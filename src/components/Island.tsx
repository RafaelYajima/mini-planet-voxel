"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Sky } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";
import Player from "./Player";

/* ═══════ CONFIGURAÇÕES DA ILHA ═══════ */
const ISLAND_SIZE = 200;
const RESOLUTION = 128;
const MAX_HEIGHT = 30;

/* ═══════ RUÍDO ═══════ */
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
    a *= 0.5; f *= 2.1;
  }
  return v;
}

/* ═══════ HEIGHTMAP DA ILHA ═══════ */
export function getTerrainHeight(x: number, z: number): number {
  // Distância do centro (a ilha é circular)
  const dist = Math.sqrt(x * x + z * z);
  const maxDist = ISLAND_SIZE * 0.45;

  // Máscara circular suave (borda da ilha cai pro mar)
  const edgeFalloff = Math.max(0, 1 - Math.pow(dist / maxDist, 2.5));

  // Terreno base
  const nx = x * 0.015, nz = z * 0.015;
  const base = fbm2(nx, nz, 5) * MAX_HEIGHT * edgeFalloff;

  // Montanha central
  const mtnDist = Math.sqrt((x - 20) * (x - 20) + (z + 15) * (z + 15));
  const mountain = Math.max(0, 1 - mtnDist / 30) * 25 * edgeFalloff;

  // Montanha secundária
  const mtn2Dist = Math.sqrt((x + 35) * (x + 35) + (z - 25) * (z - 25));
  const mountain2 = Math.max(0, 1 - mtn2Dist / 20) * 18 * edgeFalloff;

  // Cratera (buraco no terreno)
  const craterDist = Math.sqrt((x + 40) * (x + 40) + (z + 30) * (z + 30));
  const crater = craterDist < 15 ? -10 * (1 - craterDist / 15) : 0;

  // Lago (depressão com água)
  const lakeDist = Math.sqrt((x - 50) * (x - 50) + (z - 40) * (z - 40));
  const lake = lakeDist < 20 ? -5 * (1 - lakeDist / 20) : 0;

  return Math.max(-2, base + mountain + mountain2 + crater + lake);
}

/* ═══════ TERRENO MESH ═══════ */
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

      // Cores baseadas na altura
      let r = 0.26, gr = 0.65, b = 0.23; // grama
      if (h > 20) { r = 0.95; gr = 0.97; b = 1.0; }        // neve
      else if (h > 14) { r = 0.55; gr = 0.55; b = 0.52; }   // pedra
      else if (h > 8) { r = 0.35; gr = 0.55; b = 0.3; }     // grama escura
      else if (h < -1) { r = 0.35; gr = 0.28; b = 0.15; }   // terra/cratera
      else if (h < 1) { r = 0.75; gr = 0.7; b = 0.45; }     // areia/praia

      // Variação aleatória
      const noise = (hash2(Math.round(x), Math.round(z)) - 0.5) * 0.08;
      colors[i * 3] = Math.min(1, Math.max(0, r + noise));
      colors[i * 3 + 1] = Math.min(1, Math.max(0, gr + noise));
      colors[i * 3 + 2] = Math.min(1, Math.max(0, b + noise));
    }

    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0.05} flatShading />
    </mesh>
  );
}

/* ═══════ ÁGUA ═══════ */
function Water() {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshStandardMaterial).opacity = 0.7 + Math.sin(state.clock.elapsedTime) * 0.05;
    }
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <planeGeometry args={[ISLAND_SIZE * 1.5, ISLAND_SIZE * 1.5]} />
      <meshStandardMaterial color="#0ea5e9" transparent opacity={0.7} roughness={0.1} metalness={0.3} />
    </mesh>
  );
}

/* ═══════ ÁRVORE PROCEDURAL (3D real, não voxel) ═══════ */
function Tree({ position, scale: s = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={s}>
      {/* Tronco */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.15 * s, 0.3 * s, 3 * s, 6]} />
        <meshStandardMaterial color="#5b3418" roughness={0.9} />
      </mesh>
      {/* Copa */}
      <mesh position={[0, 3.5 * s, 0]} castShadow>
        <dodecahedronGeometry args={[1.8 * s, 1]} />
        <meshStandardMaterial color="#15803d" roughness={0.8} flatShading />
      </mesh>
    </group>
  );
}

/* ═══════ ÁRVORE COLOSSAL (Great Deku Tree) ═══════ */
function ColossalTree() {
  return (
    <group position={[-15, 0, 10]}>
      {/* Tronco massivo */}
      <mesh position={[0, 8, 0]} castShadow>
        <cylinderGeometry args={[2, 4, 16, 8]} />
        <meshStandardMaterial color="#4a2c12" roughness={0.95} />
      </mesh>
      {/* Copa principal (achatada e larga) */}
      <mesh position={[0, 18, 0]} castShadow>
        <sphereGeometry args={[10, 8, 6]} />
        <meshStandardMaterial color="#166534" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 20, 0]} castShadow>
        <sphereGeometry args={[8, 8, 5]} />
        <meshStandardMaterial color="#15803d" roughness={0.8} flatShading />
      </mesh>
      {/* Copas laterais */}
      <mesh position={[7, 15, 3]} castShadow>
        <sphereGeometry args={[5, 6, 5]} />
        <meshStandardMaterial color="#14532d" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-6, 14, -4]} castShadow>
        <sphereGeometry args={[4.5, 6, 5]} />
        <meshStandardMaterial color="#22c55e" roughness={0.8} flatShading />
      </mesh>
      {/* Raízes */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 5, 0.5, Math.sin(a) * 5]}
            rotation={[0, a, Math.PI / 6]} castShadow>
            <cylinderGeometry args={[0.3, 0.8, 6, 5]} />
            <meshStandardMaterial color="#3e200c" roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

/* ═══════ ARBUSTO ═══════ */
function Bush({ position, hasFruit = false }: { position: [number, number, number]; hasFruit?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <dodecahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#22c55e" roughness={0.85} flatShading />
      </mesh>
      {hasFruit && (
        <>
          <mesh position={[0.4, 0.6, 0.3]}>
            <sphereGeometry args={[0.12, 6, 6]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
          <mesh position={[-0.3, 0.5, -0.2]}>
            <sphereGeometry args={[0.1, 6, 6]} />
            <meshStandardMaterial color="#a855f7" />
          </mesh>
        </>
      )}
    </group>
  );
}

/* ═══════ VEGETAÇÃO ESPALHADA ═══════ */
function Vegetation() {
  const items = useMemo(() => {
    const trees: { pos: [number, number, number]; s: number }[] = [];
    const bushes: { pos: [number, number, number]; fruit: boolean }[] = [];

    for (let i = 0; i < 400; i++) {
      const x = (hash2(i, 0) - 0.5) * ISLAND_SIZE * 0.8;
      const z = (hash2(0, i) - 0.5) * ISLAND_SIZE * 0.8;
      const h = getTerrainHeight(x, z);
      if (h < 1.5 || h > 14) continue; // Só planta em grama

      const n = hash2(i * 7, i * 3);
      if (n > 0.7) {
        trees.push({ pos: [x, h, z], s: 0.8 + n * 0.8 });
      } else if (n > 0.5) {
        bushes.push({ pos: [x, h, z], fruit: n > 0.6 });
      }
    }
    return { trees, bushes };
  }, []);

  return (
    <>
      {items.trees.map((t, i) => <Tree key={`t${i}`} position={t.pos} scale={t.s} />)}
      {items.bushes.map((b, i) => <Bush key={`b${i}`} position={b.pos} hasFruit={b.fruit} />)}
    </>
  );
}

/* ═══════ PARTÍCULAS DE CLIMA ═══════ */
function WeatherFX() {
  const { weather } = useGameState();
  const ref = useRef<THREE.Points>(null!);
  const count = 2000;

  const geo = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 150;
      p[i * 3 + 1] = Math.random() * 50;
      p[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const isRain = weather === "rain" || weather === "storm";
    const isSnow = weather === "snow";
    const mat = ref.current.material as THREE.PointsMaterial;
    mat.opacity += (((isRain || isSnow) ? 0.6 : 0) - mat.opacity) * delta * 2;

    if (isRain || isSnow) {
      const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
      const speed = isSnow ? 5 : (weather === "storm" ? 40 : 20);
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, pos.getY(i) - delta * speed);
        if (isSnow) pos.setX(i, pos.getX(i) + Math.sin(i + pos.getY(i) * 0.1) * delta);
        if (weather === "storm") pos.setX(i, pos.getX(i) + delta * 8);
        if (pos.getY(i) < 0) {
          pos.setY(i, 50);
          pos.setX(i, (Math.random() - 0.5) * 150);
          pos.setZ(i, (Math.random() - 0.5) * 150);
        }
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={weather === "snow" ? "#e0f2fe" : "#7dd3fc"}
        size={weather === "snow" ? 0.5 : 0.15}
        transparent opacity={0} depthWrite={false}
      />
    </points>
  );
}

/* ═══════ LUZ DINÂMICA ═══════ */
function DynamicLighting() {
  const { hour, weather } = useGameState();
  const sunRef = useRef<THREE.DirectionalLight>(null!);

  useFrame(() => {
    if (!sunRef.current) return;
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    sunRef.current.position.set(Math.cos(angle) * 100, Math.sin(angle) * 80 + 20, 30);
    const dayFactor = Math.max(0, Math.sin(angle));
    const dim = weather === "storm" ? 0.3 : weather === "fog" ? 0.5 : 1;
    sunRef.current.intensity = (0.3 + dayFactor * 1.5) * dim;
  });

  return <directionalLight ref={sunRef} color="#fef3c7" castShadow shadow-mapSize={1024} />;
}

/* ═══════ ATMOSFERA ═══════ */
function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();

  useFrame((_, delta) => {
    let fogColor = "#87ceeb";
    let fogNear = 80, fogFar = 300;

    if (weather === "fog") { fogColor = "#9ca3af"; fogNear = 10; fogFar = 60; }
    else if (weather === "storm") { fogColor = "#374151"; fogNear = 20; fogFar = 80; }
    else if (weather === "rain") { fogColor = "#6b7280"; fogNear = 40; fogFar = 120; }
    else if (hour < 6 || hour > 20) { fogColor = "#1e1b4b"; fogNear = 30; fogFar = 150; }

    if (!scene.fog) scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    else {
      const f = scene.fog as THREE.Fog;
      f.color.lerp(new THREE.Color(fogColor), delta * 2);
      f.near += (fogNear - f.near) * delta * 2;
      f.far += (fogFar - f.far) * delta * 2;
    }

    if (scene.background) {
      (scene.background as THREE.Color).lerp(new THREE.Color(fogColor), delta);
    }
  });

  return null;
}

/* ═══════ CANVAS PRINCIPAL ═══════ */
export default function Island() {
  const { weather } = useGameState();

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        camera={{ position: [0, 20, 40], fov: 60 }}
        dpr={[1, 1.5]}
        onCreated={({ scene }) => { scene.background = new THREE.Color("#87ceeb"); }}
      >
        <Atmosphere />
        <ambientLight intensity={0.4} />
        <hemisphereLight args={["#87ceeb", "#4a3728", 0.5]} />
        <DynamicLighting />
        <Terrain />
        <Water />
        <ColossalTree />
        <Vegetation />
        <Player />
        <WeatherFX />
        {weather === "fog" || weather === "storm" ? null : <Stars radius={200} count={2000} factor={4} fade />}
      </Canvas>
    </div>
  );
}
