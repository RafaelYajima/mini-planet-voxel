"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Sparkles, OrbitControls } from "@react-three/drei";
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

/* ─── Gera os voxels do planeta (Otimizado para escala R=40) ─── */
function generatePlanet(weather: WeatherType, seed = 1337): VoxelData[] {
  const R = 40; // Planeta ~7x maior em raio (~350x mais volume)
  const voxels: VoxelData[] = [];
  let trees = 0;
  const treeLimit = 180; // Mais árvores para a nova escala

  // Usamos um passo maior ou lógica de shell para não estourar a memória
  // Geramos apenas voxels onde a distância é próxima ao raio (casca)
  for (let x = -R - 1; x <= R + 1; x++) {
    for (let y = -R - 1; y <= R + 1; y++) {
      // Otimização: se x e y estão longe da borda, z pode ser calculado ou filtrado
      if (Math.abs(x) > R + 1 || Math.abs(y) > R + 1) continue;
      
      for (let z = -R - 1; z <= R + 1; z++) {
        const dSq = x * x + y * y + z * z;
        const rMinSq = (R - 1.1) * (R - 1.1);
        const rMaxSq = (R + 0.5) * (R + 0.5);

        if (dSq >= rMinSq && dSq <= rMaxSq) {
          voxels.push({
            pos: [x, y, z],
            color: surfaceColor(x + seed, y, z, weather),
          });
        }
      }
    }
  }

  // Árvores espalhadas
  for (let i = 0; i < voxels.length; i += 15) {
    if (trees >= treeLimit) break;
    const v = voxels[i];
    const [x, y, z] = v.pos;
    const n = hash(x, y, z);
    
    // Árvores nascem na grama (y > -10 e y < 30)
    if (y > -10 && y < 30 && n > 0.985) {
      voxels.push({ pos: [x, y + 1, z], color: PALETTE.trunk });
      voxels.push({ pos: [x, y + 2, z], color: PALETTE.leaf });
      voxels.push({ pos: [x, y + 3, z], color: PALETTE.leaf });
      voxels.push({ pos: [x + 1, y + 2, z], color: PALETTE.leaf });
      voxels.push({ pos: [x - 1, y + 2, z], color: PALETTE.leaf });
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

/* ─── Câmera reativa (Escalada para R=40) ─── */
const ZOOM_POS: Record<ZoomLevel, [number, number, number]> = {
  macro: [0, 0, 140],
  normal: [0, 20, 100],
  micro: [0, 5, 65],
};

function CameraRig({ zoom }: { zoom: ZoomLevel }) {
  const { camera } = useThree();
  const target = ZOOM_POS[zoom];
  useFrame((state, delta) => {
    // Interpolação suave para a posição
    camera.position.lerp(new THREE.Vector3(...target), delta * 2.5);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ─── Planeta principal ─── */
function PlanetGroup({ weather }: { weather: WeatherType }) {
  const ref = useRef<THREE.Group>(null!);
  // Adicionamos weather no useMemo para o planeta mudar se o clima mudar
  const voxels = useMemo(() => generatePlanet(weather), [weather]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * (weather === "storm" ? 0.25 : 0.08);
  });

  return (
    <group ref={ref}>
      <VoxelInstances voxels={voxels} />
    </group>
  );
}

/* ─── Cor de fundo refinada (Céu Dinâmico) ─── */
function skyColor(hour: number): string {
  // Madrugada
  if (hour >= 0 && hour < 5) return "#02040a";
  // Amanhecer
  if (hour >= 5 && hour < 8) return "#1e1b4b";
  // Dia
  if (hour >= 8 && hour < 17) return "#05070f";
  // Entardecer
  if (hour >= 17 && hour < 20) return "#1e1a2b";
  // Noite
  return "#020408";
}

/* ─── Canvas completo ─── */
export default function VoxelPlanet() {
  const { weather, zoom, hour } = useGameState();

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: ZOOM_POS["normal"], fov: 45 }} dpr={[1, 1.5]}>
        <color attach="background" args={[skyColor(hour)]} />
        <FogEffect weather={weather} />
        <CameraRig zoom={zoom} />
        <ambientLight intensity={weather === "storm" ? 0.35 : 0.65} />
        <hemisphereLight args={["#bfdbfe", "#1e293b", 0.5]} />
        <directionalLight
          position={[20, 40, 20]}
          intensity={weather === "fog" ? 0.5 : 1.3}
        />
        <PlanetGroup weather={weather} />
        <WeatherParticles weather={weather} />
        <Stars radius={150} depth={50} count={5000} factor={6} fade speed={0.4} />
        {weather === "sunny" && (
          <Sparkles count={100} scale={[60, 40, 60]} size={2} speed={0.4} color="#fde68a" />
        )}
        <OrbitControls 
          enablePan={false} 
          minDistance={50} 
          maxDistance={200}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
