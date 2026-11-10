"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";

const R = 40;
const MAX_HEIGHT = 18;
const MAX_R = R + MAX_HEIGHT + 4;

const C = {
  grass1: new THREE.Color("#4ade80"),
  grass2: new THREE.Color("#22c55e"),
  grass3: new THREE.Color("#16a34a"),
  grass4: new THREE.Color("#15803d"),
  dirt1: new THREE.Color("#92400e"),
  dirt2: new THREE.Color("#a16207"),
  stone1: new THREE.Color("#6b7280"),
  stone2: new THREE.Color("#4b5563"),
  stone3: new THREE.Color("#374151"),
  snow1: new THREE.Color("#e0f2fe"),
  snow2: new THREE.Color("#f8fafc"),
  mud: new THREE.Color("#5c2d0a"),
  trunk: new THREE.Color("#5b3418"),
  leaf1: new THREE.Color("#15803d"),
  leaf2: new THREE.Color("#166534"),
  leaf3: new THREE.Color("#14532d"),
};

function normalize(v: [number, number, number]): [number, number, number] {
  const d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / d, v[1] / d, v[2] / d];
}

const PEAK_1 = normalize([0.82, 0.38, -0.41]);
const PEAK_2 = normalize([-0.64, 0.55, 0.46]);
const PEAK_3 = normalize([0.16, 0.78, 0.60]);
const HOLE_DIR = normalize([-0.78, 0.08, -0.62]);
const TREE_DIR = normalize([0.48, 0.12, 0.86]);

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

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
  const n000 = hash(ix, iy, iz), n100 = hash(ix + 1, iy, iz);
  const n010 = hash(ix, iy + 1, iz), n110 = hash(ix + 1, iy + 1, iz);
  const n001 = hash(ix, iy, iz + 1), n101 = hash(ix + 1, iy, iz + 1);
  const n011 = hash(ix, iy + 1, iz + 1), n111 = hash(ix + 1, iy + 1, iz + 1);
  const n00 = n000 + (n100 - n000) * sx;
  const n01 = n001 + (n101 - n001) * sx;
  const n10 = n010 + (n110 - n010) * sx;
  const n11 = n011 + (n111 - n011) * sx;
  const n0 = n00 + (n10 - n00) * sy;
  const n1 = n01 + (n11 - n01) * sy;
  return n0 + (n1 - n0) * sz;
}

function fbm(x: number, y: number, z: number, oct = 4): number {
  let value = 0;
  let amp = 1;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < oct; i++) {
    value += noise3d(x * freq, y * freq, z * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / total;
}

function influence(
  dir: [number, number, number],
  target: [number, number, number],
  threshold: number,
) {
  const d = dot(dir, target);
  if (d <= threshold) return 0;
  const t = (d - threshold) / (1 - threshold);
  return t * t;
}

function terrainHeight(nx: number, ny: number, nz: number) {
  const dir: [number, number, number] = [nx, ny, nz];

  const rollingA = (fbm(nx * 1.6, ny * 1.6, nz * 1.6, 4) - 0.5) * 4.5;
  const rollingB = (fbm(nx * 4.2 + 10, ny * 4.2, nz * 4.2, 3) - 0.5) * 2.0;
  const base = rollingA + rollingB;

  // 3 picos grandes, bem definidos
  const peak1 = influence(dir, PEAK_1, 0.955) * 18;
  const peak2 = influence(dir, PEAK_2, 0.952) * 15;
  const peak3 = influence(dir, PEAK_3, 0.958) * 20;
  const peaks = peak1 + peak2 + peak3;

  // grande buraco único com borda elevada
  const holeCore = influence(dir, HOLE_DIR, 0.94) * -14;
  const holeRimOuter = influence(dir, HOLE_DIR, 0.90) * 6;
  const holeRimInner = influence(dir, HOLE_DIR, 0.94) * 6;
  const bigHole = holeCore + (holeRimOuter - holeRimInner);

  // pequenas crateras rochosas espalhadas
  const pitsNoise = fbm(nx * 3.5 + 50, ny * 3.5 + 50, nz * 3.5 + 50, 3);
  const pits = pitsNoise > 0.73 ? -(pitsNoise - 0.73) * 4 : 0;

  return base + peaks + bigHole + pits;
}

function terrainColor(h: number, n: number, weather: WeatherType): THREE.Color {
  if (weather === "snow" || weather === "storm") {
    if (h > -1) return n > 0.45 ? C.snow1 : C.snow2;
  }

  // neve apenas nos topos bem altos
  if (h > 11) return n > 0.45 ? C.snow1 : C.snow2;
  // pedra nas montanhas
  if (h > 6.5) return n > 0.55 ? C.stone1 : C.stone2;
  // encostas altas misturam pedra e verde escuro
  if (h > 4) return n > 0.6 ? C.stone1 : C.grass4;
  // fundo do grande buraco / crateras
  if (h < -4) return n > 0.5 ? C.stone2 : C.stone3;
  if (h < -1.5) return n > 0.5 ? C.dirt1 : C.stone2;

  if (weather === "rain" && h < 1.5) return n > 0.5 ? C.mud : C.dirt1;

  if (n > 0.87) return C.dirt2;
  if (n > 0.62) return C.grass1;
  if (n > 0.35) return C.grass2;
  if (n > 0.15) return C.grass3;
  return C.grass4;
}

type VoxelData = { pos: [number, number, number]; color: THREE.Color };

function addVoxel(
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
  data: VoxelData[],
  occupied: Set<string>,
) {
  const key = `${x},${y},${z}`;
  if (occupied.has(key)) return;
  occupied.add(key);
  data.push({ pos: [x, y, z], color });
}

function addGreatTree(data: VoxelData[], occupied: Set<string>) {
  const [nx, ny, nz] = TREE_DIR;
  const h = terrainHeight(nx, ny, nz);
  const surfaceDist = R + h;
  const bx = Math.round(nx * surfaceDist);
  const by = Math.round(ny * surfaceDist);
  const bz = Math.round(nz * surfaceDist);

  // tronco gigante: 12 blocos radiais
  const trunkH = 12;
  for (let t = 1; t <= trunkH; t++) {
    const tx = Math.round(bx + nx * t);
    const ty = Math.round(by + ny * t);
    const tz = Math.round(bz + nz * t);
    addVoxel(tx, ty, tz, C.trunk, data, occupied);

    // engrossa o tronco com vizinhos próximos
    addVoxel(tx + 1, ty, tz, C.trunk, data, occupied);
    addVoxel(tx - 1, ty, tz, C.trunk, data, occupied);
    addVoxel(tx, ty + 1, tz, C.trunk, data, occupied);
    addVoxel(tx, ty, tz + 1, C.trunk, data, occupied);
  }

  const cx = bx + nx * (trunkH + 2);
  const cy = by + ny * (trunkH + 2);
  const cz = bz + nz * (trunkH + 2);
  const crownR = 5;

  for (let dx = -crownR; dx <= crownR; dx++) {
    for (let dy = -crownR; dy <= crownR; dy++) {
      for (let dz = -crownR; dz <= crownR; dz++) {
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd <= crownR * crownR + 2 && hash(dx + 99, dy + 33, dz + 77) > 0.14) {
          const ln = hash(dx + bx, dy + by, dz + bz);
          addVoxel(
            Math.round(cx + dx),
            Math.round(cy + dy),
            Math.round(cz + dz),
            ln > 0.62 ? C.leaf1 : ln > 0.36 ? C.leaf2 : C.leaf3,
            data,
            occupied,
          );
        }
      }
    }
  }
}

function generatePlanet(weather: WeatherType) {
  const data: VoxelData[] = [];
  const occupied = new Set<string>();

  for (let x = -MAX_R; x <= MAX_R; x++) {
    for (let y = -MAX_R; y <= MAX_R; y++) {
      for (let z = -MAX_R; z <= MAX_R; z++) {
        const dist = Math.sqrt(x * x + y * y + z * z);
        if (dist < R - 3 || dist > MAX_R) continue;

        const nx = x / dist;
        const ny = y / dist;
        const nz = z / dist;
        const h = terrainHeight(nx, ny, nz);
        const surfaceDist = R + h;

        // casca principal mais espessa = sem furos
        if (dist >= surfaceDist - 2.4 && dist <= surfaceDist + 0.35) {
          const n = hash(x, y, z);
          addVoxel(x, y, z, terrainColor(h, n, weather), data, occupied);
        }
      }
    }
  }

  // árvores regulares espalhadas
  let trees = 0;
  const treeLimit = 95;
  for (let i = 0; i < data.length; i += 40) {
    if (trees >= treeLimit) break;
    const v = data[i];
    const color = v.color;
    const isGrass =
      color === C.grass1 || color === C.grass2 || color === C.grass3 || color === C.grass4;
    if (!isGrass) continue;

    const [x, y, z] = v.pos;
    const n = hash(x + 7, y + 3, z + 11);
    if (n < 0.88) continue;

    const dist = Math.sqrt(x * x + y * y + z * z);
    const ux = x / dist, uy = y / dist, uz = z / dist;
    const trunkH = 3 + Math.floor(n * 3);

    for (let t = 1; t <= trunkH; t++) {
      addVoxel(
        Math.round(x + ux * t),
        Math.round(y + uy * t),
        Math.round(z + uz * t),
        C.trunk,
        data,
        occupied,
      );
    }

    const cx = x + ux * (trunkH + 1.5);
    const cy = y + uy * (trunkH + 1.5);
    const cz = z + uz * (trunkH + 1.5);
    const cr = 2;

    for (let dx = -cr; dx <= cr; dx++) {
      for (let dy = -cr; dy <= cr; dy++) {
        for (let dz = -cr; dz <= cr; dz++) {
          if (dx * dx + dy * dy + dz * dz <= cr * cr + 1 && hash(dx + x, dy + y, dz + z) > 0.2) {
            const ln = hash(dx + x * 3, dy + y * 3, dz + z * 3);
            addVoxel(
              Math.round(cx + dx),
              Math.round(cy + dy),
              Math.round(cz + dz),
              ln > 0.6 ? C.leaf1 : ln > 0.35 ? C.leaf2 : C.leaf3,
              data,
              occupied,
            );
          }
        }
      }
    }
    trees++;
  }

  // grande árvore única de destaque
  addGreatTree(data, occupied);

  return data;
}

function VoxelInstances({ voxels }: { voxels: VoxelData[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < voxels.length; i++) {
      const v = voxels[i];
      dummy.position.set(v.pos[0], v.pos[1], v.pos[2]);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, v.color);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [voxels]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} metalness={0} flatShading />
    </instancedMesh>
  );
}

function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();

  const bg = useMemo(() => {
    if (weather === "storm") return "#0a0a0f";
    if (weather === "fog") return "#1e293b";
    if (hour >= 0 && hour < 5) return "#020408";
    if (hour >= 5 && hour < 8) return "#1e1b4b";
    if (hour >= 8 && hour < 16) return "#070e2b";
    if (hour >= 16 && hour < 19) return "#1a1040";
    return "#020408";
  }, [hour, weather]);

  useLayoutEffect(() => {
    if (weather === "fog") scene.fog = new THREE.Fog("#334155", R * 0.8, R * 3);
    else if (weather === "storm") scene.fog = new THREE.Fog("#0f172a", R, R * 3.5);
    else scene.fog = null;
  }, [weather, scene]);

  return <color attach="background" args={[bg]} />;
}

function SunLight() {
  const { hour, weather } = useGameState();
  const ref = useRef<THREE.DirectionalLight>(null!);

  useFrame(() => {
    if (!ref.current) return;
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const d = R * 4;
    ref.current.position.set(
      Math.cos(angle) * d,
      Math.sin(angle) * d,
      Math.sin(angle) * d * 0.4,
    );
    const day = Math.max(0, Math.sin(angle));
    const dim = weather === "storm" ? 0.25 : weather === "fog" ? 0.5 : 1;
    ref.current.intensity = (0.2 + day * 1.4) * dim;
  });

  return <directionalLight ref={ref} color="#fef3c7" />;
}

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

export default function VoxelPlanet() {
  const { weather, weatherPanelOpen, diaryOpen } = useGameState();
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
