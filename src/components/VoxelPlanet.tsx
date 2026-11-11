"use client";

import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";

const R = 40;

/* ═══════ PALETA ═══════ */
const C = {
  grass1: new THREE.Color("#4ade80"),
  grass2: new THREE.Color("#22c55e"),
  stone1: new THREE.Color("#6b7280"),
  stone2: new THREE.Color("#4b5563"),
  stoneDeep: new THREE.Color("#1a202c"),
  snow1: new THREE.Color("#e0f2fe"),
  mud: new THREE.Color("#5c2d0a"),
  water: new THREE.Color("#0ea5e9"),
  trunk: new THREE.Color("#5b3418"),
  leaf: new THREE.Color("#15803d"),
  leafBright: new THREE.Color("#22c55e"),
};

/* ═══════ MATH ═══════ */
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
  const x0 = a + (b - a) * sx, x1 = c + (d - c) * sx;
  return x0 + (x1 - x0) * sy; // Simplificado para performance
}

/* ═══════ LANDMARKS ═══════ */
const HOLE_DIR = [-0.78, 0.08, -0.62];
const TREE_DIR = [0.48, 0.12, 0.86];

/* ═══════ TERRENO ═══════ */
function getTerrainHeight(nx: number, ny: number, nz: number): number {
  const base = (noise3d(nx * 2, ny * 2, nz * 2) - 0.5) * 6;
  const dotHole = nx * HOLE_DIR[0] + ny * HOLE_DIR[1] + nz * HOLE_DIR[2];
  let crater = 0;
  if (dotHole > 0.9) {
    const t = (dotHole - 0.9) / 0.1;
    crater = -15 * (t * t * (3 - 2 * t));
  }
  return base + crater;
}

type Voxel = { pos: [number, number, number]; color: THREE.Color; isTree: boolean };

function generatePlanet(): Voxel[] {
  console.log("Gerando Planeta...");
  const voxels: Voxel[] = [];
  const occ = new Set<string>();
  const maxR = R + 10, minR = R - 15;

  for (let x = -maxR; x <= maxR; x++) {
    for (let y = -maxR; y <= maxR; y++) {
      for (let z = -maxR; z <= maxR; z++) {
        const dSq = x * x + y * y + z * z;
        if (dSq < minR * minR || dSq > maxR * maxR) continue;

        const dist = Math.sqrt(dSq);
        const nx = x / dist, ny = y / dist, nz = z / dist;
        const h = getTerrainHeight(nx, ny, nz);
        const surfDist = R + h;

        // Casca sólida de 3 blocos de espessura
        if (dist <= surfDist && dist >= surfDist - 3) {
          const n = hash(x, y, z);
          let color = n > 0.5 ? C.grass1 : C.grass2;
          if (h < -10) color = C.stone2;
          else if (h > 8) color = C.snow1;
          
          voxels.push({ pos: [x, y, z], color, isTree: false });
          occ.add(`${x},${y},${z}`);
        }
      }
    }
  }

  // Árvore Colossal (Maciça)
  const [tx, ty, tz] = TREE_DIR;
  const hT = getTerrainHeight(tx, ty, tz);
  const bx = tx * (R + hT), by = ty * (R + hT), bz = tz * (R + hT);
  
  for (let i = 0; i < 40; i++) {
    const cx = bx + tx * i, cy = by + ty * i, cz = bz + tz * i;
    const radius = Math.max(1, Math.round(5 * (1 - i / 40)));
    for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++)
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dy * dy + dz * dz <= radius * radius) {
        const px = Math.round(cx + dx), py = Math.round(cy + dy), pz = Math.round(cz + dz);
        const key = `${px},${py},${pz}`;
        if (!occ.has(key)) {
          voxels.push({ pos: [px, py, pz], color: C.trunk, isTree: true });
          occ.add(key);
        }
      }
    }
    // Copas
    if (i > 25 && i % 10 === 0 || i === 39) {
      const cr = i === 39 ? 12 : 7;
      for (let dx = -cr; dx <= cr; dx++)
      for (let dy = -cr; dy <= cr; dy++)
      for (let dz = -cr; dz <= cr; dz++) {
        if (dx * dx + dy * dy + dz * dz <= cr * cr) {
          const px = Math.round(cx + dx), py = Math.round(cy + dy), pz = Math.round(cz + dz);
          const key = `${px},${py},${pz}`;
          if (!occ.has(key)) {
            voxels.push({ pos: [px, py, pz], color: i === 39 ? C.leafBright : C.leaf, isTree: true });
            occ.add(key);
          }
        }
      }
    }
  }

  return voxels;
}

function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();

  useLayoutEffect(() => {
    let bg = "#070e2b";
    if (weather === "storm") bg = "#0a0a0f";
    else if (weather === "fog") bg = "#1e293b";
    else if (hour < 6 || hour > 20) bg = "#020408";
    scene.background = new THREE.Color(bg);
  }, [hour, weather, scene]);

  return null;
}

function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const voxels = useMemo(() => generatePlanet(), []);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    voxels.forEach((v, i) => {
      dummy.position.set(...v.pos);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, v.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor!.needsUpdate = true;
  }, [voxels]);

  // Transição de clima simplificada (Troca instantânea para teste de visibilidade)
  useEffect(() => {
    if (!meshRef.current) return;
    voxels.forEach((v, i) => {
      if (v.isTree) return;
      let color = v.color;
      if (weather === "snow" || weather === "storm") color = C.snow1;
      meshRef.current.setColorAt(i, color);
    });
    meshRef.current.instanceColor!.needsUpdate = true;
  }, [weather, voxels]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.8} flatShading />
    </instancedMesh>
  );
}

export default function VoxelPlanet() {
  const { weatherPanelOpen, diaryOpen } = useGameState();
  return (
    <div className="absolute inset-0 bg-[#05070f]">
      <Canvas camera={{ position: [0, 40, 160], fov: 45 }} dpr={[1, 1.5]}>
        <Atmosphere />
        <ambientLight intensity={0.5} />
        <pointLight position={[100, 100, 100]} intensity={1.5} />
        <PlanetBody />
        <Stars radius={300} count={3000} factor={6} />
        <OrbitControls enabled={!weatherPanelOpen && !diaryOpen} enablePan={false} minDistance={80} maxDistance={300} />
      </Canvas>
    </div>
  );
}
