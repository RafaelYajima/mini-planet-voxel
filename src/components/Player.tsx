"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";

const R = 40;

/* ═══════ MATH & NOISE ═══════ */
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
function dot3(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normV(v: [number, number, number]): [number, number, number] {
  const d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / d, v[1] / d, v[2] / d];
}

/* ═══════ LANDMARKS ═══════ */
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

const keys: Record<string, boolean> = {};

export default function Player() {
  const { cameraView, entered, weatherPanelOpen, diaryOpen } = useGameState();
  const { camera } = useThree();

  const playerPos = useRef(new THREE.Vector3(0, R + 10, 0));
  const smoothedUp = useRef(new THREE.Vector3(0, 1, 0));
  const smoothedHeight = useRef(R + 10);
  const yaw = useRef(0);
  const meshRef = useRef<THREE.Group>(null!);

  const MOVE_SPEED = 6;
  const TURN_SPEED = 3.0;
  const SMOOTH_FACTOR = 0.15; // Amortecimento da câmera e orientação

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useFrame((state, delta) => {
    if (!entered || weatherPanelOpen || diaryOpen || cameraView === "orbit") return;

    const p = playerPos.current;
    const currentUp = p.clone().normalize();

    // 1. Suavização da Orientação (smoothedUp)
    // Isso evita que a câmera balance violentamente em degraus de voxels
    smoothedUp.current.lerp(currentUp, 0.1);
    const up = smoothedUp.current.clone().normalize();

    // 2. Sistema de coordenadas tangente
    const worldRef = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangentX = new THREE.Vector3().crossVectors(up, worldRef).normalize();
    const tangentZ = new THREE.Vector3().crossVectors(up, tangentX).normalize();

    // 3. Forward e Right baseados no Yaw do personagem
    const forward = tangentX.clone().multiplyScalar(Math.cos(yaw.current))
      .add(tangentZ.clone().multiplyScalar(Math.sin(yaw.current))).normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    // 4. Input e Movimento
    if (keys["a"] || keys["arrowleft"]) yaw.current += TURN_SPEED * delta;
    if (keys["d"] || keys["arrowright"]) yaw.current -= TURN_SPEED * delta;

    let moveDir = new THREE.Vector3(0, 0, 0);
    if (keys["w"] || keys["arrowup"]) moveDir.add(forward);
    if (keys["s"] || keys["arrowdown"]) moveDir.sub(forward);
    
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const candidatePos = p.clone().add(moveDir.multiplyScalar(MOVE_SPEED * delta));
      
      // Colisão lateral simples
      const curS = getSurfaceDist(p);
      const candS = getSurfaceDist(candidatePos);
      if (candS - curS < 1.5) {
        p.copy(candidatePos);
      }
    }

    // 5. Suavização de Altura (smoothedHeight)
    // Impede a câmera de "pular" em cada bloco
    const rawSurfDist = getSurfaceDist(p);
    const targetH = rawSurfDist + 0.2; // 0.2 acima do chão
    smoothedHeight.current = THREE.MathUtils.lerp(smoothedHeight.current, targetH, 0.15);
    p.normalize().multiplyScalar(smoothedHeight.current);

    // 6. Atualização do Modelo
    if (meshRef.current) {
      meshRef.current.position.copy(p);
      meshRef.current.up.copy(up);
      meshRef.current.lookAt(p.clone().add(forward));
    }

    // 7. Câmera Adaptativa
    if (cameraView === "third") {
      // Braço da câmera (fixed behind the player)
      const camOffset = forward.clone().multiplyScalar(-6).add(up.clone().multiplyScalar(3.5));
      const targetCamPos = p.clone().add(camOffset);
      
      // Suavização da câmera (Inércia)
      camera.position.lerp(targetCamPos, 0.1);
      camera.up.lerp(up, 0.1);
      
      // Foca um pouco à frente do personagem para melhor visibilidade
      const focus = p.clone().add(forward.clone().multiplyScalar(2));
      camera.lookAt(focus);

    } else if (cameraView === "first") {
      const eyePos = p.clone().add(up.clone().multiplyScalar(0.6));
      camera.position.copy(eyePos);
      camera.up.copy(up);
      camera.lookAt(eyePos.clone().add(forward.clone().multiplyScalar(10)));
    }
  });

  return (
    <group ref={meshRef} visible={cameraView !== "first"} scale={0.4}>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[1, 1.4, 0.8]} />
        <meshStandardMaterial color="#3b82f6" flatShading />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#fcd34d" flatShading />
      </mesh>
      <mesh position={[-0.25, 0, 0]}>
        <boxGeometry args={[0.4, 0.8, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" flatShading />
      </mesh>
      <mesh position={[0.25, 0, 0]}>
        <boxGeometry args={[0.4, 0.8, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" flatShading />
      </mesh>
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
