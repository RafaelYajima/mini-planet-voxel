"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType, ZoomLevel } from "@/store/gameStore";

/* ─── Paletas de cor por bioma / clima ─── */
const PALETTE = {
  grass:  new THREE.Color("#4ade80"),
  grass2: new THREE.Color("#22c55e"),
  dirt:   new THREE.Color("#92400e"),
  stone:  new THREE.Color("#94a3b8"),
  water:  new THREE.Color("#38bdf8"),
  snow:   new THREE.Color("#e0f2fe"),
  mud:    new THREE.Color("#78350f"),
  sand:   new THREE.Color("#fcd34d"),
  trunk:  new THREE.Color("#713f12"),
  leaf:   new THREE.Color("#15803d"),
  fog:    new THREE.Color("#94a3b8"),
};

/* ─── Ruído pseudo-randômico determinístico ─── */
function hash(x: number, y: number, z: number) {
  const s = Math.sin(x * 12.98 + y * 78.23 + z * 37.71) * 43758.54;
  return s - Math.floor(s);
}

/* ─── Cor de um voxel de superfície ─── */
function surfaceColor(
  x: number, y: number, z: number,
  weather: WeatherType
): THREE.Color {
  const n = hash(x, y, z);
  if (weather === "snow" || weather === "storm") {
    if (y >= 0) return PALETTE.snow;
  }
  if (weather === "rain" && y <= -2) return PALETTE.mud;
  if (y >= 5)  return PALETTE.snow;
  if (y <= -4) return n > 0.5 ? PALETTE.sand : PALETTE.stone;
  if (n > 0.92) return PALETTE.stone;
  if (n < 0.07) return PALETTE.water;
  return n > 0.5 ? PALETTE.grass : PALETTE.grass2;
}

type VoxelData = { pos: [number,number,number]; color: THREE.Color };

/* ─── Gera os voxels do planeta ─── */
function generatePlanet(weather: WeatherType, seed = 42): VoxelData[] {
  const R = 6;
  const voxels: VoxelData[] = [];
  let trees = 0;

  for (let x = -R-1; x <= R+1; x++)
  for (let y = -R-1; y <= R+1; y++)
  for (let z = -R-1; z <= R+1; z++) {
    const d = Math.sqrt(x*x + y*y + z*z);
    if (d >= R - 1.1 && d <= R + 0.3) {
      voxels.push({ pos: [x, y, z], color: surfaceColor(x + seed, y, z, weather) });
    }
  }
  // Árvores no hemisfério superior
  for (const v of voxels) {
    if (trees >= 10) break;
    const [x, y, z] = v.pos;
    const n = hash(x, y, z);
    if (y >= 1 && y <= 4 && n > 0.52 && n < 0.57) {
      voxels.push({ pos: [x, y+1, z], color: PALETTE.trunk });
      voxels.push({ pos: [x, y+2, z], color: PALETTE.leaf });
      voxels.push({ pos: [x, y+3, z], color: PALETTE.leaf });
      trees++;
    }
  }
  return voxels;
}

/* ─── Mesh instanciado ─── */
function VoxelInstances({ voxels }: { voxels: VoxelData[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    voxels.forEach((v, i) => {
      dummy.position.set(...v.pos);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, v.color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [voxels]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, voxels.length]}>
      <boxGeometry args={[0.93, 0.93, 0.93]} />
      <meshStandardMaterial roughness={0.85} metalness={0.05} flatShading />
    </instancedMesh>
  );
}

/* ─── Partículas de clima ─── */
function WeatherParticles({ weather }: { weather: WeatherType }) {
  const ref = useRef<THREE.Points>(null!);
  const geo  = useMemo(() => {
    const positions = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 30;
      positions[i*3+1] = Math.random() * 20 - 5;
      positions[i*3+2] = (Math.random() - 0.5) * 30;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const speed = weather === "storm" ? 14 : weather === "snow" ? 3 : 8;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) - delta * speed);
      if (pos.getY(i) < -8) pos.setY(i, 15);
    }
    pos.needsUpdate = true;
  });

  if (weather !== "rain" && weather !== "snow" && weather !== "storm") return null;

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={weather === "snow" ? "#e0f2fe" : "#7dd3fc"}
        size={weather === "snow" ? 0.18 : 0.08}
        transparent opacity={0.7}
      />
    </points>
  );
}

/* ─── Névoa ─── */
function FogEffect({ weather }: { weather: WeatherType }) {
  const { scene } = useThree();
  useLayoutEffect(() => {
    if (weather === "fog" || weather === "storm") {
      scene.fog = new THREE.Fog("#1e293b", 10, 28);
    } else {
      scene.fog = null;
    }
    return () => { scene.fog = null; };
  }, [weather, scene]);
  return null;
}

/* ─── Câmera reativa ao zoom ─── */
const ZOOM_POS: Record<ZoomLevel, [number,number,number]> = {
  macro:  [0, 0, 32],
  normal: [0, 2, 20],
  micro:  [0, 1, 11],
};

function CameraRig({ zoom }: { zoom: ZoomLevel }) {
  const { camera } = useThree();
  const target = ZOOM_POS[zoom];
  useFrame((_, delta) => {
    camera.position.x += (target[0] - camera.position.x) * delta * 2;
    camera.position.y += (target[1] - camera.position.y) * delta * 2;
    camera.position.z += (target[2] - camera.position.z) * delta * 2;
  });
  return null;
}

/* ─── Planeta principal ─── */
function PlanetGroup({ weather }: { weather: WeatherType }) {
  const ref = useRef<THREE.Group>(null!);
  const voxels = useMemo(() => generatePlanet(weather), [weather]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * (weather === "storm" ? 0.3 : 0.1);
  });

  return (
    <group ref={ref}>
      <VoxelInstances voxels={voxels} />
    </group>
  );
}

/* ─── Cor de fundo por hora do dia ─── */
function skyColor(hour: number): string {
  if (hour >= 6  && hour < 12) return "#0f172a";
  if (hour >= 12 && hour < 18) return "#05070f";
  if (hour >= 18 && hour < 21) return "#0f0a1a";
  return "#020408";
}

/* ─── Canvas completo ─── */
export default function VoxelPlanet() {
  const { weather, zoom, hour } = useGameState();

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: ZOOM_POS["normal"], fov: 42 }} dpr={[1, 1.5]}>
        <color attach="background" args={[skyColor(hour)]} />
        <FogEffect weather={weather} />
        <CameraRig zoom={zoom} />
        <ambientLight intensity={weather === "storm" ? 0.3 : 0.6} />
        <hemisphereLight args={["#bfdbfe", "#312e2b", 0.5]} />
        <directionalLight
          position={[8, 12, 8]}
          intensity={weather === "fog" ? 0.4 : 1.2}
          castShadow
        />
        <PlanetGroup weather={weather} />
        <WeatherParticles weather={weather} />
        <Stars radius={90} depth={50} count={3000} factor={4} fade speed={0.5} />
        {weather === "sunny" && (
          <Sparkles count={40} scale={[18,10,18]} size={1.5} speed={0.3} color="#fde68a" />
        )}
      </Canvas>
    </div>
  );
}
