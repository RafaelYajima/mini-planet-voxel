"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Sparkles, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType, ZoomLevel } from "@/store/gameStore";

const R = 40; // Raio do planeta

const C = {
  grass1: new THREE.Color("#4ade80"),
  grass2: new THREE.Color("#22c55e"),
  grass3: new THREE.Color("#16a34a"),
  grassDark: new THREE.Color("#15803d"),
  dirt1: new THREE.Color("#92400e"),
  stone1: new THREE.Color("#6b7280"),
  stone2: new THREE.Color("#4b5563"),
  snow1: new THREE.Color("#e0f2fe"),
  snow2: new THREE.Color("#f0f9ff"),
  mud: new THREE.Color("#5c2d0a"),
  trunk: new THREE.Color("#5c3317"),
  leaf1: new THREE.Color("#15803d"),
  leaf2: new THREE.Color("#166534"),
};

/* ─── Funções de Ruído (Internas para evitar re-declaração) ─── */
function hash(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >> 13)) * 1103515245;
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
  const n00 = n000 + (n100 - n000) * sx, n01 = n001 + (n101 - n001) * sx;
  const n10 = n010 + (n110 - n010) * sx, n11 = n011 + (n111 - n011) * sx;
  const n0 = n00 + (n10 - n00) * sy, n1 = n01 + (n11 - n01) * sy;
  return n0 + (n1 - n0) * sz;
}

function fbm(x: number, y: number, z: number): number {
  let v = 0, a = 1, f = 1;
  for (let i = 0; i < 4; i++) { v += noise3d(x * f, y * f, z * f) * a; a *= 0.5; f *= 2; }
  return v;
}

/* ─── Componente: Atmosfera (Céu e Névoa) ─── */
function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();

  const color = useMemo(() => {
    if (weather === "storm") return "#0a0a0f";
    if (weather === "fog") return "#1e293b";
    if (hour >= 0 && hour < 5) return "#020408";
    if (hour >= 5 && hour < 8) return "#1e1b4b";
    if (hour >= 8 && hour < 17) return "#070e2b";
    if (hour >= 17 && hour < 20) return "#1a1040";
    return "#020408";
  }, [hour, weather]);

  useLayoutEffect(() => {
    if (weather === "fog") scene.fog = new THREE.Fog(color, R * 0.8, R * 3);
    else if (weather === "storm") scene.fog = new THREE.Fog("#000000", R, R * 4);
    else scene.fog = null;
  }, [weather, color, scene]);

  return <color attach="background" args={[color]} />;
}

/* ─── Componente: Luz do Sol Dinâmica ─── */
function GodLight() {
  const { hour, weather } = useGameState();
  const lightRef = useRef<THREE.DirectionalLight>(null!);

  useFrame(() => {
    if (!lightRef.current) return;
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const sunDist = R * 4;
    lightRef.current.position.set(Math.cos(angle) * sunDist, Math.sin(angle) * sunDist, Math.sin(angle) * sunDist * 0.5);
    const dayIntensity = Math.max(0, Math.sin(angle));
    lightRef.current.intensity = (0.2 + dayIntensity * 1.5) * (weather === "storm" ? 0.3 : 1);
  });

  return <directionalLight ref={lightRef} color="#fff4d6" castShadow />;
}

/* ─── Componente: O Planeta (Renderezado apenas quando o clima muda) ─── */
function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  const voxels = useMemo(() => {
    console.log("Gerando Planeta Gigante...");
    const data: { pos: [number, number, number]; color: THREE.Color }[] = [];
    const latSteps = 180, lonSteps = 360;

    for (let lat = 0; lat < latSteps; lat++) {
      const theta = (lat / latSteps) * Math.PI;
      for (let lon = 0; lon < lonSteps; lon++) {
        const phi = (lon / lonSteps) * Math.PI * 2;
        const nx = Math.sin(theta) * Math.cos(phi), ny = Math.cos(theta), nz = Math.sin(theta) * Math.sin(phi);
        
        // Terreno FBM
        const hNoise = fbm(nx * 2, ny * 2, nz * 2);
        const mountain = Math.pow(Math.max(0, fbm(nx * 4 + 10, ny * 4, nz * 4) - 0.5), 2) * 50;
        const crater = Math.pow(Math.max(0, fbm(nx * 3 + 50, ny * 3, nz * 3) - 0.7), 2) * -40;
        const h = hNoise * 10 + mountain + crater;
        
        const x = Math.round(nx * (R + h)), y = Math.round(ny * (R + h)), z = Math.round(nz * (R + h));
        const n = hash(x, y, z);
        
        // Logica de cor baseada na altura e clima
        let color = n > 0.5 ? C.grass1 : C.grass2;
        if (h > 15) color = n > 0.4 ? C.snow1 : C.snow2; // Picos de neve
        else if (h > 8) color = n > 0.6 ? C.stone1 : C.stone2; // Montanhas pedra
        else if (h < -2) color = C.stone2; // Crateras
        
        if (weather === "snow" && h > -5) color = C.snow1;
        if (weather === "rain" && h < 2) color = C.mud;

        data.push({ pos: [x, y, z], color });
      }
    }

    // Árvores Robustas
    let treeCount = 0;
    for (let i = 0; i < data.length; i += 80) {
      if (treeCount > 300) break;
      const v = data[i];
      if (v.color === C.grass1 || v.color === C.grass2) {
        const [x, y, z] = v.pos;
        const dist = Math.sqrt(x*x+y*y+z*z);
        const ux = x/dist, uy = y/dist, uz = z/dist;
        const trunkH = 4 + Math.floor(hash(x,y,z) * 3);
        for(let t=1; t<=trunkH; t++) data.push({ pos: [Math.round(x+ux*t), Math.round(y+uy*t), Math.round(z+uz*t)], color: C.trunk });
        treeCount++;
      }
    }

    return data;
  }, [weather]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    voxels.forEach((v, i) => {
      dummy.position.set(...v.pos);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, v.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [voxels]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1.05, 1.05, 1.05]} />
      <meshStandardMaterial roughness={0.9} metalness={0.0} flatShading />
    </instancedMesh>
  );
}

export default function VoxelPlanet() {
  const { zoom, weather } = useGameState();

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 20, R * 2.8], fov: 45 }} dpr={[1, 1.5]}>
        <Atmosphere />
        <ambientLight intensity={0.4} />
        <GodLight />
        <group rotation={[0, 0, 0]}>
          <PlanetBody />
        </group>
        <Stars radius={300} depth={60} count={10000} factor={7} saturation={0} fade speed={1} />
        {weather === "sunny" && <Sparkles count={100} scale={R * 3} size={4} speed={0.4} color="#fde68a" />}
        <OrbitControls enablePan={false} minDistance={R * 1.5} maxDistance={R * 4} />
      </Canvas>
    </div>
  );
}
