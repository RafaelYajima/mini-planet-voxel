"use client";

import { useLayoutEffect, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";

const R = 40;

/* ═══════ PALETA ═══════ */
const C = {
  grass1:    new THREE.Color("#4ade80"),
  grass2:    new THREE.Color("#22c55e"),
  grass3:    new THREE.Color("#16a34a"),
  grassDark: new THREE.Color("#15803d"),
  dirt1:     new THREE.Color("#92400e"),
  dirt2:     new THREE.Color("#a16207"),
  stone1:    new THREE.Color("#6b7280"),
  stone2:    new THREE.Color("#4b5563"),
  stone3:    new THREE.Color("#374151"),
  snow1:     new THREE.Color("#e0f2fe"),
  snow2:     new THREE.Color("#f0f9ff"),
  mud:       new THREE.Color("#5c2d0a"),
  trunk:     new THREE.Color("#5c3317"),
  leaf1:     new THREE.Color("#15803d"),
  leaf2:     new THREE.Color("#166534"),
  leaf3:     new THREE.Color("#14532d"),
};

/* ═══════ RUÍDO ═══════ */
function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function noise3d(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const n000 = hash(ix, iy, iz), n100 = hash(ix+1, iy, iz);
  const n010 = hash(ix, iy+1, iz), n110 = hash(ix+1, iy+1, iz);
  const n001 = hash(ix, iy, iz+1), n101 = hash(ix+1, iy, iz+1);
  const n011 = hash(ix, iy+1, iz+1), n111 = hash(ix+1, iy+1, iz+1);
  const n00 = n000+(n100-n000)*sx, n01 = n001+(n101-n001)*sx;
  const n10 = n010+(n110-n010)*sx, n11 = n011+(n111-n011)*sx;
  const n0 = n00+(n10-n00)*sy, n1 = n01+(n11-n01)*sy;
  return n0+(n1-n0)*sz;
}

function fbm(x: number, y: number, z: number, oct = 4): number {
  let v = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { v += noise3d(x*f, y*f, z*f)*a; t += a; a *= 0.5; f *= 2; }
  return v / t;
}

/* ═══════ ALTURA DO TERRENO ═══════ */
function terrainHeight(nx: number, ny: number, nz: number): number {
  // Base suave
  const base = fbm(nx * 2, ny * 2, nz * 2, 4) * 4;

  // Montanhas (raras e localizadas — threshold alto)
  const mNoise = fbm(nx * 1.5 + 100, ny * 1.5, nz * 1.5, 3);
  const mountain = mNoise > 0.62 ? Math.pow(mNoise - 0.62, 1.5) * 200 : 0;

  // Crateras (poucas, rasas)
  const cNoise = fbm(nx * 2.5 + 50, ny * 2.5 + 50, nz * 2.5 + 50, 3);
  const crater = cNoise > 0.7 ? -(cNoise - 0.7) * 10 : 0;

  return base + mountain + crater;
}

/* ═══════ COR DO TERRENO ═══════ */
type VD = { pos: [number, number, number]; color: THREE.Color };

function terrainColor(h: number, n: number, weather: WeatherType): THREE.Color {
  // Clima neve/tempestade cobre tudo
  if (weather === "snow" || weather === "storm") {
    if (h > -1) return n > 0.5 ? C.snow1 : C.snow2;
  }

  // Picos de neve (só muito alto)
  if (h > 8) return n > 0.4 ? C.snow1 : C.snow2;
  // Montanhas de pedra
  if (h > 5) return n > 0.5 ? C.stone1 : C.stone2;
  // Crateras
  if (h < -1) return n > 0.5 ? C.stone2 : C.stone3;
  // Chuva: lama em terras baixas
  if (weather === "rain" && h < 1.5) return n > 0.5 ? C.mud : C.dirt1;
  // Grama (a maior parte)
  if (n > 0.85) return C.dirt2;
  if (n > 0.6) return C.grass1;
  if (n > 0.35) return C.grass2;
  if (n > 0.15) return C.grass3;
  return C.grassDark;
}

/* ═══════ GERAÇÃO DO PLANETA (casca cúbica — SEM buracos) ═══════ */
function generatePlanet(weather: WeatherType): VD[] {
  const data: VD[] = [];
  const occupied = new Set<string>();
  const maxR = R + 12; // margem para montanhas

  for (let x = -maxR; x <= maxR; x++) {
    for (let y = -maxR; y <= maxR; y++) {
      for (let z = -maxR; z <= maxR; z++) {
        const dist = Math.sqrt(x * x + y * y + z * z);
        if (dist < R - 2 || dist > maxR + 1) continue;

        // Normal (direção para fora)
        const nx = x / dist, ny = y / dist, nz = z / dist;
        const h = terrainHeight(nx, ny, nz);
        const surfaceDist = R + h;

        // O voxel faz parte da casca se está entre (surfaceDist - 1.2) e surfaceDist
        if (dist >= surfaceDist - 1.2 && dist <= surfaceDist + 0.3) {
          const key = `${x},${y},${z}`;
          if (occupied.has(key)) continue;
          occupied.add(key);

          const n = hash(x, y, z);
          data.push({ pos: [x, y, z], color: terrainColor(h, n, weather) });
        }
      }
    }
  }

  // ─── ÁRVORES ROBUSTAS ───
  let trees = 0;
  const treeLimit = 120;

  for (let i = 0; i < data.length; i += 30) {
    if (trees >= treeLimit) break;
    const v = data[i];
    const c = v.color;
    // Só planta em grama
    if (c !== C.grass1 && c !== C.grass2 && c !== C.grass3 && c !== C.grassDark) continue;

    const [x, y, z] = v.pos;
    const n = hash(x + 7, y + 3, z + 11);
    if (n < 0.85) continue;

    const dist = Math.sqrt(x * x + y * y + z * z);
    const ux = x / dist, uy = y / dist, uz = z / dist;

    // Tronco: 3-5 blocos na direção radial (para fora)
    const trunkH = 3 + Math.floor(n * 3);
    for (let t = 1; t <= trunkH; t++) {
      data.push({
        pos: [Math.round(x + ux * t), Math.round(y + uy * t), Math.round(z + uz * t)],
        color: C.trunk,
      });
    }

    // Copa esférica
    const cx = x + ux * (trunkH + 2);
    const cy = y + uy * (trunkH + 2);
    const cz = z + uz * (trunkH + 2);
    const cr = 2;
    for (let dx = -cr; dx <= cr; dx++)
    for (let dy = -cr; dy <= cr; dy++)
    for (let dz = -cr; dz <= cr; dz++) {
      if (dx * dx + dy * dy + dz * dz <= cr * cr + 1) {
        const ln = hash(dx + x, dy + y, dz + z);
        if (ln > 0.2) {
          data.push({
            pos: [Math.round(cx + dx), Math.round(cy + dy), Math.round(cz + dz)],
            color: ln > 0.6 ? C.leaf1 : ln > 0.35 ? C.leaf2 : C.leaf3,
          });
        }
      }
    }
    trees++;
  }

  return data;
}

/* ═══════ INSTANCED MESH ═══════ */
function VoxelInstances({ voxels }: { voxels: VD[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < voxels.length; i++) {
      dummy.position.set(voxels[i].pos[0], voxels[i].pos[1], voxels[i].pos[2]);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, voxels[i].color);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [voxels]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1.0, 1.0, 1.0]} />
      <meshStandardMaterial roughness={0.9} metalness={0.0} flatShading />
    </instancedMesh>
  );
}

/* ═══════ ATMOSFERA ═══════ */
function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();

  const color = useMemo(() => {
    if (weather === "storm") return "#0a0a0f";
    if (weather === "fog") return "#1e293b";
    if (hour >= 0 && hour < 5)  return "#020408";
    if (hour >= 5 && hour < 8)  return "#1e1b4b";
    if (hour >= 8 && hour < 16) return "#070e2b";
    if (hour >= 16 && hour < 19) return "#1a1040";
    return "#020408";
  }, [hour, weather]);

  useLayoutEffect(() => {
    if (weather === "fog") scene.fog = new THREE.Fog("#334155", R * 0.8, R * 3);
    else if (weather === "storm") scene.fog = new THREE.Fog("#0f172a", R, R * 3.5);
    else scene.fog = null;
  }, [weather, scene, color]);

  return <color attach="background" args={[color]} />;
}

/* ═══════ LUZ SOLAR DINÂMICA ═══════ */
function SunLight() {
  const { hour, weather } = useGameState();
  const ref = useRef<THREE.DirectionalLight>(null!);

  useFrame(() => {
    if (!ref.current) return;
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const d = R * 4;
    ref.current.position.set(Math.cos(angle) * d, Math.sin(angle) * d, Math.sin(angle) * d * 0.4);
    const dayFactor = Math.max(0, Math.sin(angle));
    const wDim = weather === "storm" ? 0.25 : weather === "fog" ? 0.5 : 1;
    ref.current.intensity = (0.2 + dayFactor * 1.4) * wDim;
  });

  return <directionalLight ref={ref} color="#fef3c7" />;
}

/* ═══════ PLANETA (ROTAÇÃO LENTA) ═══════ */
function PlanetGroup({ weather }: { weather: WeatherType }) {
  const ref = useRef<THREE.Group>(null!);
  const voxels = useMemo(() => generatePlanet(weather), [weather]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * (weather === "storm" ? 0.12 : 0.035);
  });

  return (
    <group ref={ref}>
      <VoxelInstances voxels={voxels} />
    </group>
  );
}

/* ═══════ CANVAS PRINCIPAL ═══════ */
export default function VoxelPlanet() {
  const { weather, hour, weatherPanelOpen, diaryOpen } = useGameState();

  // Desabilita orbit controls quando qualquer painel está aberto
  const orbitEnabled = !weatherPanelOpen && !diaryOpen;

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 15, R * 2.8], fov: 45 }} dpr={[1, 1.5]}>
        <Atmosphere />
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#bfdbfe", "#1e293b", 0.3]} />
        <SunLight />
        <PlanetGroup weather={weather} />
        <Stars radius={R * 6} depth={R * 2} count={5000} factor={6} fade speed={0.3} />
        <OrbitControls
          enabled={orbitEnabled}
          enablePan={false}
          minDistance={R * 1.3}
          maxDistance={R * 4.5}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
}
