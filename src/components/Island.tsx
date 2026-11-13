"use client";

import { useMemo, useRef, useLayoutEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Float, PerspectiveCamera, Sky } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import Player from "./Player";

const ISLAND_SIZE = 300;
const RESOLUTION = 180;
const MAX_HEIGHT = 40;

/* ═══════ MATH HELPERS ═══════ */
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

function fbm2(x: number, y: number, oct = 5): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise2d(x * f, y * f) * a;
    a *= 0.5; f *= 2.1;
  }
  return v;
}

/* ═══════ HEIGHTMAP ═══════ */
export function getTerrainHeight(x: number, z: number): number {
  const dist = Math.sqrt(x * x + z * z);
  const maxDist = ISLAND_SIZE * 0.45;
  const edgeFalloff = Math.max(0, 1 - Math.pow(dist / maxDist, 3));

  const nx = x * 0.01, nz = z * 0.01;
  const base = fbm2(nx, nz, 5) * MAX_HEIGHT * edgeFalloff;

  // Montanha principal
  const mtnDist = Math.sqrt((x - 30) * (x - 30) + (z + 40) * (z + 40));
  const mountain = Math.max(0, 1 - mtnDist / 50) * 45 * edgeFalloff;

  // Cratera
  const craterDist = Math.sqrt((x + 60) * (x + 60) + (z + 20) * (z + 20));
  let crater = 0;
  if (craterDist < 25) {
    const t = 1 - craterDist / 25;
    crater = -20 * (t * t * (3 - 2 * t));
  }

  // Lago
  const lakeDist = Math.sqrt((x - 80) * (x - 80) + (z - 60) * (z - 60));
  const lake = lakeDist < 30 ? -8 * (1 - lakeDist / 30) : 0;

  return Math.max(-4, base + mountain + crater + lake);
}

/* ═══════ TERRENO ═══════ */
function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(ISLAND_SIZE, ISLAND_SIZE, RESOLUTION, RESOLUTION);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = getTerrainHeight(x, z);
      pos.setY(i, h);

      let color = new THREE.Color();
      if (h > 30) color.set("#ffffff"); // Neve pura
      else if (h > 20) color.set("#94a3b8"); // Rocha
      else if (h > 12) color.set("#166534"); // Verde escuro
      else if (h > 1.5) color.set("#22c55e"); // Grama
      else if (h > 0.4) color.set("#fde047"); // Areia
      else color.set("#334155"); // Rocha molhada

      const v = (hash2(Math.round(x*2), Math.round(z*2)) - 0.5) * 0.04;
      colors[i * 3] = color.r + v;
      colors[i * 3 + 1] = color.g + v;
      colors[i * 3 + 2] = color.b + v;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.9} flatShading={false} />
    </mesh>
  );
}

/* ═══════ ÁGUA ═══════ */
function ModernWater() {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    mesh.current.position.y = -0.5 + Math.sin(state.clock.elapsedTime * 0.6) * 0.15;
  });

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[ISLAND_SIZE * 5, ISLAND_SIZE * 5]} />
      <meshPhysicalMaterial
        color="#0284c7"
        transmission={0.4}
        roughness={0.05}
        metalness={0.1}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

/* ═══════ FLORESTA ═══════ */
function InstancedForest() {
  const treeRef = useRef<THREE.InstancedMesh>(null!);
  const bushRef = useRef<THREE.InstancedMesh>(null!);
  const count = 1000;

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    let tIdx = 0, bIdx = 0;
    for (let i = 0; i < count; i++) {
      const x = (hash2(i, 0) - 0.5) * ISLAND_SIZE * 0.9;
      const z = (hash2(0, i) - 0.5) * ISLAND_SIZE * 0.9;
      const h = getTerrainHeight(x, z);
      if (h < 1.8 || h > 18) continue;

      const n = hash2(i, i);
      dummy.position.set(x, h, z);
      dummy.rotation.y = n * Math.PI * 2;
      if (n > 0.45 && tIdx < count) {
        dummy.scale.setScalar(1 + n * 1.5);
        dummy.updateMatrix();
        treeRef.current.setMatrixAt(tIdx++, dummy.matrix);
      } else if (bIdx < count) {
        dummy.scale.setScalar(0.6 + n * 0.8);
        dummy.updateMatrix();
        bushRef.current.setMatrixAt(bIdx++, dummy.matrix);
      }
    }
    treeRef.current.instanceMatrix.needsUpdate = true;
    bushRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group>
      <instancedMesh ref={treeRef} args={[undefined, undefined, count]} castShadow>
        <coneGeometry args={[0.6, 4, 7]} />
        <meshStandardMaterial color="#064e3b" />
      </instancedMesh>
      <instancedMesh ref={bushRef} args={[undefined, undefined, count]} castShadow>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#14532d" />
      </instancedMesh>
    </group>
  );
}

/* ═══════ GREAT DEKU TREE ═══════ */
function GreatDekuTree() {
  return (
    <group position={[-40, 0, 30]}>
      <mesh position={[0, 12, 0]} castShadow>
        <cylinderGeometry args={[4, 10, 24, 12]} />
        <meshStandardMaterial color="#422006" />
      </mesh>
      <mesh position={[0, 30, 0]} castShadow>
        <sphereGeometry args={[18, 12, 10]} />
        <meshStandardMaterial color="#064e3b" flatShading />
      </mesh>
      <mesh position={[12, 24, 5]} castShadow>
        <sphereGeometry args={[8, 8, 8]} />
        <meshStandardMaterial color="#14532d" flatShading />
      </mesh>
    </group>
  );
}

/* ═══════ AMBIENTE ═══════ */
function Environment() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null!);

  useFrame((_, delta) => {
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    sun.current.position.set(Math.cos(angle) * 150, Math.sin(angle) * 100, 50);
    let color = "#bae6fd";
    if (weather === "storm") color = "#1e293b";
    else if (hour < 6 || hour > 20) color = "#020617";
    scene.background = new THREE.Color(color);
    if (scene.fog) (scene.fog as THREE.Fog).color.lerp(new THREE.Color(color), delta);
    else scene.fog = new THREE.Fog(color, 40, 500);
  });

  return (
    <>
      <directionalLight ref={sun} castShadow shadow-mapSize={4096} intensity={1.8} />
      <ambientLight intensity={0.5} />
      <Sky sunPosition={[100, 10, 100]} turbidity={0.1} rayleigh={0.5} />
    </>
  );
}

export default function Island() {
  return (
    <div className="absolute inset-0">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <PerspectiveCamera makeDefault position={[0, 40, 80]} fov={50} />
        <Environment />
        <Terrain />
        <ModernWater />
        <InstancedForest />
        <GreatDekuTree />
        <Player />
      </Canvas>
    </div>
  );
}
