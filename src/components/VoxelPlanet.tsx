"use client";

import { useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Sparkles, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType, ZoomLevel } from "@/store/gameStore";

/* ═══════════════════════════════════════════════════════
   CONSTANTES DO PLANETA
   ═══════════════════════════════════════════════════════ */
const R = 120; // Raio em voxels — planeta massivo tipo Terra

/* ═══════════════════════════════════════════════════════
   PALETA DE CORES
   ═══════════════════════════════════════════════════════ */
const C = {
  grass1:    new THREE.Color("#4ade80"),
  grass2:    new THREE.Color("#22c55e"),
  grass3:    new THREE.Color("#16a34a"),
  grassDark: new THREE.Color("#15803d"),
  dirt1:     new THREE.Color("#92400e"),
  dirt2:     new THREE.Color("#78350f"),
  stone1:    new THREE.Color("#6b7280"),
  stone2:    new THREE.Color("#4b5563"),
  stone3:    new THREE.Color("#374151"),
  snow1:     new THREE.Color("#e0f2fe"),
  snow2:     new THREE.Color("#f0f9ff"),
  mud:       new THREE.Color("#5c2d0a"),
  sand:      new THREE.Color("#d4a855"),
  trunk:     new THREE.Color("#5c3317"),
  leaf1:     new THREE.Color("#15803d"),
  leaf2:     new THREE.Color("#166534"),
  leaf3:     new THREE.Color("#14532d"),
  water:     new THREE.Color("#0ea5e9"),
};

/* ═══════════════════════════════════════════════════════
   RUÍDO PROCEDURAL
   ═══════════════════════════════════════════════════════ */
function hash(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >> 13)) * 1103515245;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

// Ruído fractal simples baseado em hash (simula Perlin básico)
function noise3d(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);

  const n000 = hash(ix, iy, iz);
  const n100 = hash(ix + 1, iy, iz);
  const n010 = hash(ix, iy + 1, iz);
  const n110 = hash(ix + 1, iy + 1, iz);
  const n001 = hash(ix, iy, iz + 1);
  const n101 = hash(ix + 1, iy, iz + 1);
  const n011 = hash(ix, iy + 1, iz + 1);
  const n111 = hash(ix + 1, iy + 1, iz + 1);

  const n00 = n000 + (n100 - n000) * sx;
  const n01 = n001 + (n101 - n001) * sx;
  const n10 = n010 + (n110 - n010) * sx;
  const n11 = n011 + (n111 - n011) * sx;

  const n0 = n00 + (n10 - n00) * sy;
  const n1 = n01 + (n11 - n01) * sy;

  return n0 + (n1 - n0) * sz;
}

// FBM (Fractal Brownian Motion) para terreno rico
function fbm(x: number, y: number, z: number, octaves = 4): number {
  let val = 0, amp = 1, freq = 1, totalAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise3d(x * freq, y * freq, z * freq) * amp;
    totalAmp += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / totalAmp;
}

/* ═══════════════════════════════════════════════════════
   GERAÇÃO DA SUPERFÍCIE (abordagem esférica)
   ═══════════════════════════════════════════════════════ */
type VoxelData = { pos: [number, number, number]; color: THREE.Color };

function heightAt(theta: number, phi: number): number {
  // Converte esférica para cartesiana para amostrar ruído 3D
  const nx = Math.sin(theta) * Math.cos(phi);
  const ny = Math.cos(theta);
  const nz = Math.sin(theta) * Math.sin(phi);

  // FBM multi-octave para terreno interessante
  const baseHeight = fbm(nx * 3.5, ny * 3.5, nz * 3.5, 5);

  // Montanhas (picos altos)
  const mountainNoise = fbm(nx * 1.2 + 100, ny * 1.2, nz * 1.2, 4);
  const mountains = Math.pow(Math.max(0, mountainNoise - 0.45), 2) * 80;

  // Crateras (depressões)
  const craterNoise = fbm(nx * 2 + 50, ny * 2 + 50, nz * 2 + 50, 3);
  const craters = craterNoise > 0.65 ? -(craterNoise - 0.65) * 30 : 0;

  return baseHeight * 12 + mountains + craters;
}

function surfaceColor(
  height: number,
  normalY: number,
  n: number,
  weather: WeatherType,
): THREE.Color {
  const absNY = Math.abs(normalY);

  // Neve no clima de nevasca/tempestade
  if (weather === "snow" || weather === "storm") {
    if (absNY > 0.2) return n > 0.5 ? C.snow1 : C.snow2;
  }

  // Montanhas altas = neve permanente
  if (height > 16) return n > 0.5 ? C.snow1 : C.snow2;

  // Montanhas médias = pedra
  if (height > 10) {
    if (n > 0.7) return C.snow1; // manchas de neve
    return n > 0.4 ? C.stone1 : C.stone2;
  }

  // Crateras profundas = pedra escura
  if (height < -3) {
    return n > 0.5 ? C.stone2 : C.stone3;
  }

  // Regiões baixas e chuva = lama
  if (weather === "rain" && height < 2) {
    return n > 0.5 ? C.mud : C.dirt2;
  }

  // Terra / Grama (a maioria da superfície)
  if (height > 6) {
    // Transição pedra/grama nas encostas
    return n > 0.6 ? C.stone1 : C.grassDark;
  }

  // Planícies verdes
  if (n > 0.8) return C.dirt1;
  if (n > 0.5) return C.grass1;
  if (n > 0.2) return C.grass2;
  return C.grass3;
}

function generatePlanet(weather: WeatherType): VoxelData[] {
  const voxels: VoxelData[] = [];

  // Resolução angular — quantos pontos amostramos na esfera
  // Maior = mais detalhado mas mais voxels
  const latSteps = 220;  // latitude
  const lonSteps = 440;  // longitude

  for (let lat = 0; lat < latSteps; lat++) {
    const theta = (lat / latSteps) * Math.PI;

    for (let lon = 0; lon < lonSteps; lon++) {
      const phi = (lon / lonSteps) * Math.PI * 2;

      // Direção normal da superfície
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);

      // Altura do terreno neste ponto
      const h = heightAt(theta, phi);
      const surfaceR = R + h;

      // Posição do voxel
      const x = Math.round(nx * surfaceR);
      const y = Math.round(ny * surfaceR);
      const z = Math.round(nz * surfaceR);

      // Ruído local para variação de cor
      const n = hash(x, y, z);

      voxels.push({
        pos: [x, y, z],
        color: surfaceColor(h, ny, n, weather),
      });
    }
  }

  // ─── Árvores robustas ───
  let trees = 0;
  const treeLimit = 400;

  for (let i = 0; i < voxels.length; i += 40) {
    if (trees >= treeLimit) break;
    const v = voxels[i];
    const [x, y, z] = v.pos;
    const n = hash(x + 7, y + 3, z + 11);

    // Distância do centro
    const dist = Math.sqrt(x * x + y * y + z * z);
    // Normal aponta para fora
    const ux = x / dist, uy = y / dist, uz = z / dist;

    // Altura do terreno neste voxel
    const terrainH = dist - R;

    // Árvores só em grama (altura 0-8, não montanha nem cratera)
    if (terrainH > 0 && terrainH < 8 && n > 0.93) {
      // Tronco (3-5 blocos de alto)
      const trunkH = 3 + Math.floor(n * 3);
      for (let t = 1; t <= trunkH; t++) {
        voxels.push({
          pos: [
            Math.round(x + ux * t),
            Math.round(y + uy * t),
            Math.round(z + uz * t),
          ],
          color: C.trunk,
        });
      }

      // Copa (esfera de folhas)
      const cx = x + ux * (trunkH + 1);
      const cy = y + uy * (trunkH + 1);
      const cz = z + uz * (trunkH + 1);
      const crownR = 2 + Math.floor(n * 2);

      for (let dx = -crownR; dx <= crownR; dx++) {
        for (let dy = -crownR; dy <= crownR; dy++) {
          for (let dz = -crownR; dz <= crownR; dz++) {
            const dd = dx * dx + dy * dy + dz * dz;
            if (dd <= crownR * crownR && hash(dx + x, dy + y, dz + z) > 0.25) {
              const ln = hash(dx, dy, dz);
              voxels.push({
                pos: [
                  Math.round(cx + dx),
                  Math.round(cy + dy),
                  Math.round(cz + dz),
                ],
                color: ln > 0.6 ? C.leaf1 : ln > 0.3 ? C.leaf2 : C.leaf3,
              });
            }
          }
        }
      }
      trees++;
    }
  }

  return voxels;
}

/* ═══════════════════════════════════════════════════════
   INSTANCED MESH
   ═══════════════════════════════════════════════════════ */
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
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, voxels.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[1.05, 1.05, 1.05]} />
      <meshStandardMaterial roughness={0.88} metalness={0.02} flatShading />
    </instancedMesh>
  );
}

/* ═══════════════════════════════════════════════════════
   PARTÍCULAS DE CLIMA (escaladas para planeta grande)
   ═══════════════════════════════════════════════════════ */
function WeatherParticles({ weather }: { weather: WeatherType }) {
  const ref = useRef<THREE.Points>(null!);
  const count = 2000;
  const spread = R * 3;

  const geo = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = Math.random() * spread - spread / 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [spread]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const speed = weather === "storm" ? 60 : weather === "snow" ? 12 : 30;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) - delta * speed);
      if (pos.getY(i) < -spread / 2) pos.setY(i, spread / 2);
    }
    pos.needsUpdate = true;
  });

  if (weather !== "rain" && weather !== "snow" && weather !== "storm") return null;

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={weather === "snow" ? "#e0f2fe" : "#7dd3fc"}
        size={weather === "snow" ? 1.2 : 0.5}
        transparent
        opacity={0.65}
      />
    </points>
  );
}

/* ═══════════════════════════════════════════════════════
   NÉVOA
   ═══════════════════════════════════════════════════════ */
function FogEffect({ weather }: { weather: WeatherType }) {
  const { scene } = useThree();
  useLayoutEffect(() => {
    if (weather === "fog") {
      scene.fog = new THREE.Fog("#334155", R * 0.8, R * 2.5);
    } else if (weather === "storm") {
      scene.fog = new THREE.Fog("#0f172a", R * 1, R * 3);
    } else {
      scene.fog = null;
    }
    return () => { scene.fog = null; };
  }, [weather, scene]);
  return null;
}

/* ═══════════════════════════════════════════════════════
   ILUMINAÇÃO DINÂMICA POR HORA
   ═══════════════════════════════════════════════════════ */
function DynamicLight({ hour, weather }: { hour: number; weather: WeatherType }) {
  const lightRef = useRef<THREE.DirectionalLight>(null!);

  useFrame(() => {
    if (!lightRef.current) return;
    // Sol gira ao redor do planeta conforme a hora
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const sunDist = R * 3;
    lightRef.current.position.set(
      Math.cos(angle) * sunDist,
      Math.sin(angle) * sunDist * 0.6 + R,
      Math.sin(angle) * sunDist * 0.4,
    );

    // Intensidade varia: forte de dia, fraca à noite
    const dayFactor = Math.max(0, Math.sin(angle));
    const weatherDim = weather === "fog" ? 0.4 : weather === "storm" ? 0.3 : 1;
    lightRef.current.intensity = (0.3 + dayFactor * 1.2) * weatherDim;
  });

  return <directionalLight ref={lightRef} color="#fef3c7" />;
}

/* ═══════════════════════════════════════════════════════
   CÂMERA
   ═══════════════════════════════════════════════════════ */
const ZOOM_DIST: Record<ZoomLevel, number> = {
  macro: R * 4,
  normal: R * 2.5,
  micro: R * 1.6,
};

/* ═══════════════════════════════════════════════════════
   PLANETA (GRUPO QUE ROTACIONA)
   ═══════════════════════════════════════════════════════ */
function PlanetGroup({ weather }: { weather: WeatherType }) {
  const ref = useRef<THREE.Group>(null!);
  const voxels = useMemo(() => generatePlanet(weather), [weather]);

  useFrame((_, delta) => {
    const speed = weather === "storm" ? 0.15 : 0.04;
    ref.current.rotation.y += delta * speed;
  });

  return (
    <group ref={ref}>
      <VoxelInstances voxels={voxels} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════
   CÉU DINÂMICO
   ═══════════════════════════════════════════════════════ */
function skyColor(hour: number, weather: WeatherType): string {
  if (weather === "storm") return "#0a0a0f";
  if (weather === "fog") return "#1e293b";

  if (hour >= 0 && hour < 5) return "#020408";   // Madrugada
  if (hour >= 5 && hour < 7) return "#1e1b4b";   // Amanhecer
  if (hour >= 7 && hour < 10) return "#0c1445";   // Manhã
  if (hour >= 10 && hour < 16) return "#070e2b";  // Dia
  if (hour >= 16 && hour < 18) return "#1a1040";  // Entardecer
  if (hour >= 18 && hour < 20) return "#12082a";  // Crepúsculo
  return "#020408";                                 // Noite
}

/* ═══════════════════════════════════════════════════════
   CANVAS PRINCIPAL
   ═══════════════════════════════════════════════════════ */
export default function VoxelPlanet() {
  const { weather, zoom, hour } = useGameState();

  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, R * 0.5, ZOOM_DIST["normal"]], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[skyColor(hour, weather)]} />
        <FogEffect weather={weather} />
        <ambientLight intensity={weather === "storm" ? 0.2 : weather === "fog" ? 0.4 : 0.55} />
        <hemisphereLight args={["#bfdbfe", "#1e293b", 0.35]} />
        <DynamicLight hour={hour} weather={weather} />
        <PlanetGroup weather={weather} />
        <WeatherParticles weather={weather} />
        <Stars radius={R * 6} depth={R * 3} count={6000} factor={8} fade speed={0.3} />
        {weather === "sunny" && (
          <Sparkles
            count={60}
            scale={[R * 4, R * 2, R * 4]}
            size={3}
            speed={0.3}
            color="#fde68a"
          />
        )}
        <OrbitControls
          enablePan={false}
          minDistance={R * 1.4}
          maxDistance={R * 5}
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
}
