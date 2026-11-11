"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";

// Importa terrainHeight — precisamos replicar aqui para calcular onde o personagem pisa
// (as funções de ruído são internas ao VoxelPlanet, então duplicamos as essenciais)
function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}
function noise3d(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iy, iz), b = hash(ix + 1, iy, iz);
  const c = hash(ix, iy + 1, iz), d = hash(ix + 1, iy + 1, iz);
  const e = hash(ix, iy, iz + 1), f = hash(ix + 1, iy, iz + 1);
  const g = hash(ix, iy + 1, iz + 1), h2 = hash(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * sx, x1 = e + (f - e) * sx;
  const x2 = c + (d - c) * sx, x3 = g + (h2 - g) * sx;
  return (x0 + (x2 - x0) * sy) + ((x1 + (x3 - x1) * sy) - (x0 + (x2 - x0) * sy)) * sz;
}
function fbm(x: number, y: number, z: number, oct = 3): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += noise3d(x * f, y * f, z * f) * a; a *= 0.5; f *= 2.1; }
  return v;
}

function norm(v: [number, number, number]): [number, number, number] {
  const d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / d, v[1] / d, v[2] / d];
}
function dot3(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const R = 40;
const HOLE_DIR = norm([-0.78, 0.08, -0.62]);
const LAKE_DIR = norm([0.2, -0.6, -0.4]);
const MTN_1 = norm([0.75, 0.55, -0.30]);
const MTN_2 = norm([-0.50, 0.65, 0.50]);
const MTN_3 = norm([0.10, -0.80, 0.55]);

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

function getSurfaceHeight(pos: THREE.Vector3): number {
  const dist = pos.length();
  if (dist === 0) return R;
  const nx = pos.x / dist, ny = pos.y / dist, nz = pos.z / dist;
  return R + terrainHeight(nx, ny, nz);
}

// Teclas pressionadas
const keys: Record<string, boolean> = {};

export default function Player() {
  const { cameraView, entered, weatherPanelOpen, diaryOpen } = useGameState();
  const { camera } = useThree();

  const playerPos = useRef(new THREE.Vector3(0, 0, R + 3)); // Posição inicial
  const playerDir = useRef(new THREE.Vector3(1, 0, 0)); // Direção que o jogador "olha" tangencialmente
  const meshRef = useRef<THREE.Group>(null!);

  const speed = 12;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  useFrame((_, delta) => {
    if (!entered || weatherPanelOpen || diaryOpen) return;
    if (cameraView === "orbit") return; // No modo órbita, o personagem não se move

    const pos = playerPos.current;
    const up = pos.clone().normalize(); // "up" = radial (para fora do centro)

    // Direção para frente (tangente à superfície)
    let forward = playerDir.current.clone();
    // Garante que forward é perpendicular a up
    forward.sub(up.clone().multiplyScalar(forward.dot(up))).normalize();

    // Direção lateral
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    // Input WASD
    let moveForward = 0, moveRight = 0;
    if (keys["w"] || keys["arrowup"]) moveForward += 1;
    if (keys["s"] || keys["arrowdown"]) moveForward -= 1;
    if (keys["a"] || keys["arrowleft"]) moveRight -= 1;
    if (keys["d"] || keys["arrowright"]) moveRight += 1;

    if (moveForward !== 0 || moveRight !== 0) {
      const moveDir = forward.clone().multiplyScalar(moveForward).add(right.clone().multiplyScalar(moveRight)).normalize();
      pos.add(moveDir.multiplyScalar(speed * delta));

      // Re-projeta na superfície do planeta (gravidade esférica)
      const surfH = getSurfaceHeight(pos);
      const playerHeight = 2.5; // altura do personagem acima do chão
      pos.normalize().multiplyScalar(surfH + playerHeight);

      // Atualiza direção forward para seguir o movimento
      playerDir.current.copy(moveDir);
    } else {
      // Mesmo parado, gruda na superfície
      const surfH = getSurfaceHeight(pos);
      pos.normalize().multiplyScalar(surfH + 2.5);
    }

    // Posiciona o mesh do personagem
    if (meshRef.current) {
      meshRef.current.position.copy(pos);
      // Orientação: "pé" aponta pro centro, "frente" aponta pra forward
      const lookTarget = pos.clone().add(forward);
      meshRef.current.lookAt(lookTarget);
      // Corrige o up do personagem para apontar para fora do planeta
      meshRef.current.up.copy(up);
      meshRef.current.lookAt(lookTarget);
    }

    // Câmera
    if (cameraView === "third") {
      // 3ª pessoa: atrás e acima do personagem
      const camOffset = forward.clone().multiplyScalar(-8).add(up.clone().multiplyScalar(5));
      const targetCamPos = pos.clone().add(camOffset);
      camera.position.lerp(targetCamPos, delta * 5);
      camera.lookAt(pos);
      camera.up.copy(up);
    } else if (cameraView === "first") {
      // 1ª pessoa: nos olhos do personagem
      const eyeOffset = up.clone().multiplyScalar(1.5);
      camera.position.copy(pos.clone().add(eyeOffset));
      const lookPoint = pos.clone().add(forward.clone().multiplyScalar(10)).add(eyeOffset);
      camera.lookAt(lookPoint);
      camera.up.copy(up);
    }
  });

  // Não mostra o boneco em 1ª pessoa
  const showMesh = cameraView !== "first";

  return (
    <group ref={meshRef} visible={showMesh}>
      {/* Corpo (cubo principal) */}
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
