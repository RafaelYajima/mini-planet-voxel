"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";

const RADIUS = 6;

type VoxelData = {
  pos: [number, number, number];
  color: THREE.Color;
};

// Pseudo-ruído determinístico por coordenada inteira
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const palette = {
  grassA: new THREE.Color("#59b56a"),
  grassB: new THREE.Color("#3f9153"),
  snow: new THREE.Color("#edf5ff"),
  sand: new THREE.Color("#e6cf9b"),
  stone: new THREE.Color("#8d99ae"),
  water: new THREE.Color("#3d8bfd"),
  trunk: new THREE.Color("#7a5230"),
  leaf: new THREE.Color("#2f7d46"),
};

function surfaceColor(x: number, y: number, z: number): THREE.Color {
  const n = hash(x, y, z);
  if (y >= 4) return palette.snow;
  if (y <= -4) return n > 0.5 ? palette.sand : palette.stone;
  if (n > 0.93) return palette.stone;
  if (n < 0.07) return palette.water;
  return n > 0.5 ? palette.grassA : palette.grassB;
}

// Casquinha esférica de voxels + algumas arvorezinhas no hemisfério superior
function generatePlanet(): VoxelData[] {
  const voxels: VoxelData[] = [];
  const r = RADIUS;
  let trees = 0;

  for (let x = -r - 1; x <= r + 1; x++) {
    for (let y = -r - 1; y <= r + 1; y++) {
      for (let z = -r - 1; z <= r + 1; z++) {
        const d = Math.sqrt(x * x + y * y + z * z);
        if (d >= r - 1.1 && d <= r + 0.25) {
          voxels.push({ pos: [x, y, z], color: surfaceColor(x, y, z) });
        }
      }
    }
  }

  for (const v of voxels) {
    if (trees >= 14) break;
    const [x, y, z] = v.pos;
    const n = hash(x, y, z);
    if (y >= 1 && y <= 3 && n > 0.5 && n < 0.56) {
      voxels.push({ pos: [x, y + 1, z], color: palette.trunk });
      voxels.push({ pos: [x, y + 2, z], color: palette.leaf });
      trees++;
    }
  }

  return voxels;
}

function generateMoon(): VoxelData[] {
  const voxels: VoxelData[] = [];
  const r = 2;
  for (let x = -r - 1; x <= r + 1; x++) {
    for (let y = -r - 1; y <= r + 1; y++) {
      for (let z = -r - 1; z <= r + 1; z++) {
        const d = Math.sqrt(x * x + y * y + z * z);
        if (d >= r - 0.9 && d <= r + 0.3) {
          const n = hash(x + 40, y - 17, z + 9);
          voxels.push({
            pos: [x, y, z],
            color:
              n > 0.72
                ? new THREE.Color("#6b7280")
                : new THREE.Color("#aab2c0"),
          });
        }
      }
    }
  }
  return voxels;
}

function VoxelInstances({ voxels }: { voxels: VoxelData[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    voxels.forEach((v, i) => {
      dummy.position.set(v.pos[0], v.pos[1], v.pos[2]);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, v.color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) {
      ref.current.instanceColor.needsUpdate = true;
    }
  }, [voxels]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, voxels.length]}>
      <boxGeometry args={[0.94, 0.94, 0.94]} />
      <meshStandardMaterial roughness={0.9} metalness={0.02} flatShading />
    </instancedMesh>
  );
}

function PlanetGroup() {
  const planet = useRef<THREE.Group>(null!);
  const moon = useRef<THREE.Group>(null!);
  const planetVoxels = useMemo(generatePlanet, []);
  const moonVoxels = useMemo(generateMoon, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    planet.current.rotation.y += delta * 0.12;
    planet.current.position.y = Math.sin(t * 0.8) * 0.25;

    const a = t * 0.32;
    moon.current.position.set(
      Math.cos(a) * 11,
      Math.sin(t * 0.5) * 2.2,
      Math.sin(a) * 11,
    );
    moon.current.rotation.y += delta * 0.4;
  });

  return (
    <>
      <group ref={planet}>
        <VoxelInstances voxels={planetVoxels} />
      </group>
      <group ref={moon} scale={0.85}>
        <VoxelInstances voxels={moonVoxels} />
      </group>
    </>
  );
}

export default function VoxelPlanet() {
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 1.5, 17], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#05070f"]} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#bfe3ff", "#312e2b", 0.5]} />
        <directionalLight position={[6, 10, 8]} intensity={1.25} />
        <PlanetGroup />
        <Stars
          radius={80}
          depth={40}
          count={2500}
          factor={4}
          saturation={0}
          fade
          speed={0.6}
        />
        <Sparkles
          count={70}
          scale={[20, 12, 20]}
          size={2}
          speed={0.35}
          color="#8ecbff"
        />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 3.4}
          maxPolarAngle={Math.PI / 1.75}
        />
      </Canvas>
    </div>
  );
}
