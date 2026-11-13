"use client";

import { useMemo, useRef, useLayoutEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Float, PerspectiveCamera, Sky } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import Player from "./Player";

/* ═══════ CONFIGURAÇÕES OTIMIZADAS ═══════ */
const ISLAND_SIZE = 280;
const RESOLUTION = 120; // Reduzido para PCs fracos (era 180)
const MAX_HEIGHT = 38;

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function noise2d(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm2(x: number, y: number, oct = 4): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise2d(x * f, y * f) * a;
    a *= 0.5; f *= 2.2;
  }
  return v;
}

export function getTerrainHeight(x: number, z: number): number {
  const dist = Math.sqrt(x * x + z * z);
  const maxDist = ISLAND_SIZE * 0.46;
  const edgeFalloff = Math.max(0, 1 - Math.pow(dist / maxDist, 3));
  const nx = x * 0.012, nz = z * 0.012;
  const base = fbm2(nx, nz, 4) * MAX_HEIGHT * edgeFalloff;
  const mtnDist = Math.sqrt((x - 20) * (x - 20) + (z + 30) * (z + 30));
  const mountain = Math.max(0, 1 - mtnDist / 45) * 40 * edgeFalloff;
  const craterDist = Math.sqrt((x + 50) * (x + 50) + (z + 20) * (z + 20));
  const crater = craterDist < 20 ? -18 * (1 - craterDist / 20) : 0;
  const lakeDist = Math.sqrt((x - 70) * (x - 70) + (z - 50) * (z - 50));
  const lake = lakeDist < 25 ? -7 * (1 - lakeDist / 25) : 0;
  return Math.max(-4, base + mountain + crater + lake);
}

function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(ISLAND_SIZE, ISLAND_SIZE, RESOLUTION, RESOLUTION);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = getTerrainHeight(x, z);
      pos.setY(i, h);
      let color = new THREE.Color();
      if (h > 26) color.set("#f1f5f9"); 
      else if (h > 15) color.set("#475569");
      else if (h > 1.8) color.set("#15803d");
      else if (h > 0.5) color.set("#eab308");
      else color.set("#1e293b");
      const v = (hash2(Math.round(x), Math.round(z)) - 0.5) * 0.03;
      colors[i * 3] = color.r + v; colors[i * 3 + 1] = color.g + v; colors[i * 3 + 2] = color.b + v;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

function OptimizedWater() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((s) => { ref.current.position.y = -0.6 + Math.sin(s.clock.elapsedTime * 0.5) * 0.1; });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <planeGeometry args={[ISLAND_SIZE * 4, ISLAND_SIZE * 4]} />
      <meshStandardMaterial color="#0ea5e9" transparent opacity={0.6} roughness={0.1} />
    </mesh>
  );
}

function Forest() {
  const treeRef = useRef<THREE.InstancedMesh>(null!);
  const count = 800; // Levemente reduzido para ganho de draw call
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < count; i++) {
      const x = (hash2(i, 0) - 0.5) * ISLAND_SIZE * 0.8;
      const z = (hash2(0, i) - 0.5) * ISLAND_SIZE * 0.8;
      const h = getTerrainHeight(x, z);
      if (h < 2 || h > 16) continue;
      const n = hash2(i, i);
      dummy.position.set(x, h, z);
      dummy.rotation.y = n * Math.PI;
      dummy.scale.setScalar(0.7 + n * 1.5);
      dummy.updateMatrix();
      treeRef.current.setMatrixAt(idx++, dummy.matrix);
    }
    treeRef.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={treeRef} args={[undefined, undefined, count]} castShadow>
      <coneGeometry args={[0.4, 3, 5]} />
      <meshStandardMaterial color="#064e3b" />
    </instancedMesh>
  );
}

function DekuTree() {
  return (
    <group position={[-35, 0, 25]}>
      <mesh position={[0, 10, 0]} castShadow><cylinderGeometry args={[3, 8, 20, 8]} /><meshStandardMaterial color="#422006" /></mesh>
      <mesh position={[0, 24, 0]} castShadow><sphereGeometry args={[16, 8, 8]} /><meshStandardMaterial color="#064e3b" /></mesh>
    </group>
  );
}

function Lighting() {
  const { hour, weather } = useGameState();
  const sun = useRef<THREE.DirectionalLight>(null!);
  useFrame((_, delta) => {
    const a = ((hour - 6) / 24) * Math.PI * 2;
    sun.current.position.set(Math.cos(a) * 100, Math.sin(a) * 80, 40);
    let c = weather === "storm" ? "#1e293b" : (hour < 6 || hour > 20 ? "#020617" : "#bae6fd");
    const scene = sun.current.parent;
    if (scene) {
      if (!(scene as any).background) (scene as any).background = new THREE.Color(c);
      else ((scene as any).background as THREE.Color).lerp(new THREE.Color(c), delta * 2);
    }
  });
  return (
    <>
      <directionalLight ref={sun} castShadow shadow-mapSize={1024} intensity={1.5} />
      <ambientLight intensity={0.5} />
      <Sky sunPosition={[100, 10, 100]} turbidity={0.05} />
    </>
  );
}

export default function Island() {
  return (
    <div className="absolute inset-0 bg-[#bae6fd]">
      <Canvas shadows dpr={1} gl={{ powerPreference: "high-performance", antialias: false }}>
        <PerspectiveCamera makeDefault position={[0, 50, 100]} fov={45} />
        <Lighting />
        <Terrain />
        <OptimizedWater />
        <Forest />
        <DekuTree />
        <Player />
      </Canvas>
    </div>
  );
}
