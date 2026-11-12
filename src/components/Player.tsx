"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";

const R = 40;

/* ═══════ TERRENO (cópia exata do VoxelPlanet) ═══════ */
function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}
function noise3d(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iy, iz), b = hash(ix + 1, iy, iz), c = hash(ix, iy + 1, iz), d = hash(ix + 1, iy + 1, iz);
  const e = hash(ix, iy, iz + 1), f = hash(ix + 1, iy, iz + 1), g = hash(ix, iy + 1, iz + 1), h2 = hash(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * sx, x1 = e + (f - e) * sx, x2 = c + (d - c) * sx, x3 = g + (h2 - g) * sx;
  return (x0 + (x2 - x0) * sy) + ((x1 + (x3 - x1) * sy) - (x0 + (x2 - x0) * sy)) * sz;
}
function fbm(x: number, y: number, z: number, oct = 3): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += noise3d(x * f, y * f, z * f) * a; a *= 0.5; f *= 2.1; }
  return v;
}
function normV(v: [number, number, number]): [number, number, number] {
  const d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / d, v[1] / d, v[2] / d];
}
function dot3(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
const HOLE_DIR = normV([-0.78, 0.08, -0.62]);
const LAKE_DIR = normV([0.2, -0.6, -0.4]);
const MTN_1 = normV([0.75, 0.55, -0.30]);
const MTN_2 = normV([-0.50, 0.65, 0.50]);
const MTN_3 = normV([0.10, -0.80, 0.55]);

function terrainHeight(nx: number, ny: number, nz: number): number {
  const dir: [number, number, number] = [nx, ny, nz];
  const hills = (fbm(nx * 2.5, ny * 2.5, nz * 2.5, 4) - 0.3) * 8;
  const smallPeaks = Math.pow(Math.max(0, fbm(nx * 5, ny * 5, nz * 5, 2) - 0.4), 2) * 15;
  const infl = (target: [number, number, number], thr: number) => {
    const d = dot3(dir, target); if (d <= thr) return 0; const t = (d - thr) / (1 - thr); return t * t;
  };
  const mountains = infl(MTN_1, 0.94) * 22 + infl(MTN_2, 0.95) * 16 + infl(MTN_3, 0.96) * 12;
  const dH = dot3(dir, HOLE_DIR);
  let crater = 0;
  if (dH > 0.96) crater = -14;
  else if (dH > 0.88) { const t = (dH - 0.88) / 0.08; crater = -14 * (t * t * (3 - 2 * t)); }
  const dL = dot3(dir, LAKE_DIR);
  let lake = 0;
  if (dL > 0.94) lake = -6;
  else if (dL > 0.86) { const t = (dL - 0.86) / 0.08; lake = -6 * (t * t * (3 - 2 * t)); }
  return hills + smallPeaks + mountains + crater + lake;
}

function getSurfaceDist(pos: THREE.Vector3): number {
  const d = pos.length();
  if (d === 0) return R;
  return R + terrainHeight(pos.x / d, pos.y / d, pos.z / d);
}

/* ═══════ INPUT ═══════ */
const keys: Record<string, boolean> = {};

export default function Player() {
  const { cameraView, entered, weatherPanelOpen, diaryOpen } = useGameState();
  const { camera } = useThree();

  // Estado do personagem
  const pos = useRef(new THREE.Vector3(0, 0, R + 3));
  const yaw = useRef(0); // Ângulo horizontal (giro do corpo em torno do eixo "up")
  const meshRef = useRef<THREE.Group>(null!);

  // Configurações estilo Minecraft
  const MOVE_SPEED = 5;
  const TURN_SPEED = 2.5; // rad/s
  const PLAYER_HEIGHT = 0.3; // centro do corpo acima do chão
  const EYE_HEIGHT = 0.7; // olhos acima do chão

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useFrame((_, delta) => {
    if (!entered || weatherPanelOpen || diaryOpen || cameraView === "orbit") return;

    const p = pos.current;
    const up = p.clone().normalize();

    // ─── FORWARD e RIGHT no espaço tangente da esfera ───
    // Cria um sistema de coordenadas local na superfície do planeta:
    // - "up" aponta pra fora do centro
    // - "forward" é uma direção tangente baseada no yaw
    // - "right" é perpendicular a ambos

    // Vetor de referência para construir o frame tangente
    const worldUp = new THREE.Vector3(0, 1, 0);
    let tangentRef = new THREE.Vector3().crossVectors(up, worldUp);
    if (tangentRef.lengthSq() < 0.001) {
      tangentRef = new THREE.Vector3().crossVectors(up, new THREE.Vector3(1, 0, 0));
    }
    tangentRef.normalize();
    const tangentRef2 = new THREE.Vector3().crossVectors(up, tangentRef).normalize();

    // Forward e right baseados no yaw (giro do corpo)
    const forward = tangentRef.clone().multiplyScalar(Math.cos(yaw.current))
      .add(tangentRef2.clone().multiplyScalar(Math.sin(yaw.current))).normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    // ─── INPUT (Estilo Minecraft) ───
    // A/D GIRAM o personagem, W/S andam pra frente/trás
    if (keys["a"] || keys["arrowleft"]) yaw.current += TURN_SPEED * delta;
    if (keys["d"] || keys["arrowright"]) yaw.current -= TURN_SPEED * delta;

    let moveAmount = 0;
    let strafeAmount = 0;
    if (keys["w"] || keys["arrowup"]) moveAmount += 1;
    if (keys["s"] || keys["arrowdown"]) moveAmount -= 1;

    if (moveAmount !== 0 || strafeAmount !== 0) {
      const moveDir = forward.clone().multiplyScalar(moveAmount)
        .add(right.clone().multiplyScalar(strafeAmount)).normalize();

      const candidatePos = p.clone().add(moveDir.clone().multiplyScalar(MOVE_SPEED * delta));

      // ─── COLISÃO COM PAREDES ───
      const curSurf = getSurfaceDist(p);
      const candSurf = getSurfaceDist(candidatePos);
      const heightDiff = candSurf - curSurf;

      // Permite subir degraus de até 1.5 blocos, bloqueia paredes mais altas
      if (heightDiff < 1.5) {
        p.copy(candidatePos);
      }
    }

    // ─── GRUDAR NO CHÃO (snap direto, sem flutuação) ───
    const surfDist = getSurfaceDist(p);
    p.normalize().multiplyScalar(surfDist + PLAYER_HEIGHT);

    // ─── ATUALIZA MESH ───
    if (meshRef.current) {
      meshRef.current.position.copy(p);
      meshRef.current.up.copy(up);
      const lookTarget = p.clone().add(forward);
      meshRef.current.lookAt(lookTarget);
    }

    // ─── CÂMERA ───
    // Recalcula up e forward APÓS snap do chão
    const upFinal = p.clone().normalize();
    const fwdFinal = tangentRef.clone().multiplyScalar(Math.cos(yaw.current))
      .add(tangentRef2.clone().multiplyScalar(Math.sin(yaw.current))).normalize();

    if (cameraView === "third") {
      // ─── 3ª PESSOA (Minecraft style) ───
      // Câmera fica ATRÁS do personagem, olhando PRA ELE
      const camBehind = fwdFinal.clone().multiplyScalar(-6);
      const camAbove = upFinal.clone().multiplyScalar(3);
      let idealCamPos = p.clone().add(camBehind).add(camAbove);

      // Colisão da câmera com o terreno: se ia enterrar, sobe
      const camSurfDist = getSurfaceDist(idealCamPos);
      const camMinDist = camSurfDist + 2;
      if (idealCamPos.length() < camMinDist) {
        idealCamPos.normalize().multiplyScalar(camMinDist);
      }

      camera.position.lerp(idealCamPos, Math.min(delta * 8, 1));

      // OLHA PRO PERSONAGEM (como Minecraft 3ª pessoa)
      const lookAt = p.clone().add(upFinal.clone().multiplyScalar(0.5));
      camera.up.copy(upFinal);
      camera.lookAt(lookAt);

    } else if (cameraView === "first") {
      // ─── 1ª PESSOA (Minecraft style) ───
      // Câmera nos olhos, olha pra onde o personagem aponta
      const eyePos = p.clone().add(upFinal.clone().multiplyScalar(EYE_HEIGHT));
      camera.position.copy(eyePos);

      // Olha reto pra frente na direção que o personagem está virado
      const lookTarget = eyePos.clone().add(fwdFinal.clone().multiplyScalar(20));
      camera.up.copy(upFinal);
      camera.lookAt(lookTarget);
    }
  });

  const visible = cameraView !== "first";

  return (
    <group ref={meshRef} visible={visible} scale={0.4}>
      {/* Corpo */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[1, 1.4, 0.8]} />
        <meshStandardMaterial color="#3b82f6" flatShading />
      </mesh>
      {/* Cabeça */}
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#fcd34d" flatShading />
      </mesh>
      {/* Pernas */}
      <mesh position={[-0.25, 0, 0]}>
        <boxGeometry args={[0.4, 0.8, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" flatShading />
      </mesh>
      <mesh position={[0.25, 0, 0]}>
        <boxGeometry args={[0.4, 0.8, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" flatShading />
      </mesh>
      {/* Braços */}
      <mesh position={[-0.7, 0.9, 0]}>
        <boxGeometry args={[0.3, 1.0, 0.4]} />
        <meshStandardMaterial color="#3b82f6" flatShading />
      </mesh>
      <mesh position={[0.7, 0.9, 0]}>
        <boxGeometry args={[0.3, 1.0, 0.4]} />
        <meshStandardMaterial color="#3b82f6" flatShading />
      </mesh>
    </group>
  );
}
