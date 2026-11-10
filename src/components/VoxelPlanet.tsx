"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";

const R = 40;
const MAX_HEIGHT = 20;
const MAX_R = R + MAX_HEIGHT + 5;

/* ═══════ PALETA ═══════ */
const C = {
  grass1:    new THREE.Color("#4ade80"),
  grass2:    new THREE.Color("#22c55e"),
  grass3:    new THREE.Color("#16a34a"),
  grass4:    new THREE.Color("#15803d"),
  dirt1:     new THREE.Color("#92400e"),
  dirt2:     new THREE.Color("#a16207"),
  stone1:    new THREE.Color("#6b7280"),
  stone2:    new THREE.Color("#4b5563"),
  stone3:    new THREE.Color("#374151"),
  stoneHole: new THREE.Color("#1f2937"),
  snow1:     new THREE.Color("#e0f2fe"),
  snow2:     new THREE.Color("#f8fafc"),
  mud:       new THREE.Color("#5c2d0a"),
  trunk:     new THREE.Color("#5b3418"),
  trunkDark: new THREE.Color("#3e200c"),
  bark:      new THREE.Color("#4a2c12"),
  leaf1:     new THREE.Color("#15803d"),
  leaf2:     new THREE.Color("#166534"),
  leaf3:     new THREE.Color("#14532d"),
  leafBright:new THREE.Color("#22c55e"),
};

/* ═══════ DIREÇÕES FIXAS ═══════ */
function normalize(v: [number, number, number]): [number, number, number] {
  const d = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
  return [v[0]/d, v[1]/d, v[2]/d];
}
function dot3(a: [number,number,number], b: [number,number,number]) {
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}

const PEAK_1 = normalize([0.82, 0.38, -0.41]);
const PEAK_2 = normalize([-0.64, 0.55, 0.46]);
const PEAK_3 = normalize([0.16, 0.78, 0.60]);
const HOLE_DIR = normalize([-0.78, 0.08, -0.62]);
const TREE_DIR = normalize([0.48, 0.12, 0.86]);

/* ═══════ RUÍDO ═══════ */
function hash(x: number, y: number, z: number): number {
  let h = (x*374761393+y*668265263+z*1274126177)|0;
  h=((h^(h>>13))*1103515245)|0;
  return ((h^(h>>16))&0x7fffffff)/0x7fffffff;
}

function noise3d(x: number, y: number, z: number): number {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const fx=x-ix,fy=y-iy,fz=z-iz;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),sz=fz*fz*(3-2*fz);
  const n000=hash(ix,iy,iz),n100=hash(ix+1,iy,iz);
  const n010=hash(ix,iy+1,iz),n110=hash(ix+1,iy+1,iz);
  const n001=hash(ix,iy,iz+1),n101=hash(ix+1,iy,iz+1);
  const n011=hash(ix,iy+1,iz+1),n111=hash(ix+1,iy+1,iz+1);
  const n00=n000+(n100-n000)*sx,n01=n001+(n101-n001)*sx;
  const n10=n010+(n110-n010)*sx,n11=n011+(n111-n011)*sx;
  const n0=n00+(n10-n00)*sy,n1=n01+(n11-n01)*sy;
  return n0+(n1-n0)*sz;
}

function fbm(x: number, y: number, z: number, oct=4): number {
  let v=0,a=1,f=1,t=0;
  for(let i=0;i<oct;i++){v+=noise3d(x*f,y*f,z*f)*a;t+=a;a*=0.5;f*=2;}
  return v/t;
}

function influence(dir: [number,number,number], target: [number,number,number], threshold: number) {
  const d=dot3(dir,target);
  if(d<=threshold) return 0;
  const t=(d-threshold)/(1-threshold);
  return t*t;
}

/* ═══════ TERRENO ═══════ */
function terrainHeight(nx: number, ny: number, nz: number): number {
  const dir: [number,number,number] = [nx,ny,nz];
  const base = (fbm(nx*1.6, ny*1.6, nz*1.6, 4) - 0.5) * 4.5
             + (fbm(nx*4.2+10, ny*4.2, nz*4.2, 3) - 0.5) * 2;

  const peaks = influence(dir, PEAK_1, 0.955) * 18
              + influence(dir, PEAK_2, 0.952) * 15
              + influence(dir, PEAK_3, 0.958) * 20;

  // Grande buraco — mais profundo e com borda
  const holeFactor = influence(dir, HOLE_DIR, 0.92);
  const holeDeep = influence(dir, HOLE_DIR, 0.95);
  const bigHole = -holeDeep * 18 + (holeFactor - holeDeep) * 5;

  const pN = fbm(nx*3.5+50, ny*3.5+50, nz*3.5+50, 3);
  const pits = pN > 0.73 ? -(pN-0.73)*4 : 0;

  return base + peaks + bigHole + pits;
}

function terrainColor(h: number, n: number, weather: WeatherType): THREE.Color {
  if (weather === "snow" || weather === "storm") {
    if (h > -1) return n > 0.45 ? C.snow1 : C.snow2;
  }
  if (h > 11)   return n > 0.45 ? C.snow1 : C.snow2;
  if (h > 6.5)  return n > 0.55 ? C.stone1 : C.stone2;
  if (h > 4)    return n > 0.6 ? C.stone1 : C.grass4;
  if (h < -8)   return n > 0.5 ? C.stoneHole : C.stone3;
  if (h < -4)   return n > 0.5 ? C.stone2 : C.stone3;
  if (h < -1.5) return n > 0.5 ? C.dirt1 : C.stone2;
  if (weather === "rain" && h < 1.5) return n > 0.5 ? C.mud : C.dirt1;
  if (n > 0.87) return C.dirt2;
  if (n > 0.62) return C.grass1;
  if (n > 0.35) return C.grass2;
  if (n > 0.15) return C.grass3;
  return C.grass4;
}

/* ═══════ HELPERS ═══════ */
type VD = { pos: [number,number,number]; color: THREE.Color };

function addV(x: number, y: number, z: number, color: THREE.Color, data: VD[], occ: Set<string>) {
  const key = `${x},${y},${z}`;
  if (occ.has(key)) return;
  occ.add(key);
  data.push({ pos: [x,y,z], color });
}

/* ═══════ GRANDE ÁRVORE MONUMENTAL ═══════ */
function addGreatTree(data: VD[], occ: Set<string>) {
  const [nx, ny, nz] = TREE_DIR;
  const h = terrainHeight(nx, ny, nz);
  const surfR = R + h;
  const bx = nx * surfR, by = ny * surfR, bz = nz * surfR;

  // Tronco maciço: 16 blocos de alto, raio 2 (cross section)
  const trunkH = 16;
  const trunkRadius = 2;
  for (let t = 0; t <= trunkH; t++) {
    const cx = bx + nx * t, cy = by + ny * t, cz = bz + nz * t;
    // Gera seção transversal perpendicular ao eixo radial
    for (let dx = -trunkRadius; dx <= trunkRadius; dx++) {
      for (let dy = -trunkRadius; dy <= trunkRadius; dy++) {
        for (let dz = -trunkRadius; dz <= trunkRadius; dz++) {
          const dd = dx*dx + dy*dy + dz*dz;
          // Raio do tronco diminui perto do topo
          const maxR = t > trunkH - 3 ? 1 : trunkRadius;
          if (dd <= maxR * maxR) {
            const n = hash(dx+t*7, dy+t*3, dz+t*11);
            addV(Math.round(cx+dx), Math.round(cy+dy), Math.round(cz+dz),
              n > 0.7 ? C.bark : n > 0.3 ? C.trunk : C.trunkDark, data, occ);
          }
        }
      }
    }
  }

  // Raízes que saem da base (4 raízes)
  for (let r = 0; r < 4; r++) {
    const angle = (r / 4) * Math.PI * 2;
    for (let seg = 0; seg < 6; seg++) {
      const spread = seg * 1.5;
      const rx = Math.round(bx + Math.cos(angle) * spread - nx * seg * 0.3);
      const ry = Math.round(by + Math.sin(angle) * spread * 0.5 - ny * seg * 0.3);
      const rz = Math.round(bz + Math.sin(angle) * spread - nz * seg * 0.3);
      addV(rx, ry, rz, C.trunkDark, data, occ);
      addV(rx+1, ry, rz, C.trunk, data, occ);
      addV(rx, ry, rz+1, C.trunk, data, occ);
    }
  }

  // Copa enorme — 3 camadas de esferas de folhas sobrepostas
  const topCenter = { x: bx + nx * (trunkH + 3), y: by + ny * (trunkH + 3), z: bz + nz * (trunkH + 3) };

  const crowns: { cx: number; cy: number; cz: number; r: number }[] = [
    { cx: topCenter.x, cy: topCenter.y, cz: topCenter.z, r: 7 },
    { cx: topCenter.x + nx * 4, cy: topCenter.y + ny * 4, cz: topCenter.z + nz * 4, r: 5 },
    { cx: topCenter.x - nx * 2 + 3, cy: topCenter.y - ny * 2 + 2, cz: topCenter.z - nz * 2 + 3, r: 5 },
    { cx: topCenter.x + 4, cy: topCenter.y + 1, cz: topCenter.z - 3, r: 4 },
    { cx: topCenter.x - 3, cy: topCenter.y + 2, cz: topCenter.z + 4, r: 4 },
  ];

  for (const crown of crowns) {
    const cr = crown.r;
    for (let dx = -cr; dx <= cr; dx++) {
      for (let dy = -cr; dy <= cr; dy++) {
        for (let dz = -cr; dz <= cr; dz++) {
          const dd = dx*dx + dy*dy + dz*dz;
          if (dd <= cr*cr && hash(dx+99+crown.r, dy+33, dz+77) > 0.15) {
            const ln = hash(dx*3+1, dy*3+2, dz*3+3);
            addV(
              Math.round(crown.cx + dx), Math.round(crown.cy + dy), Math.round(crown.cz + dz),
              ln > 0.65 ? C.leafBright : ln > 0.45 ? C.leaf1 : ln > 0.25 ? C.leaf2 : C.leaf3,
              data, occ,
            );
          }
        }
      }
    }
  }
}

/* ═══════ GERAÇÃO DO PLANETA ═══════ */
function generatePlanet(weather: WeatherType): VD[] {
  const data: VD[] = [];
  const occ = new Set<string>();

  // Pré-calcula heights para cada coordenada esférica
  // Loop cúbico para casca sólida
  for (let x = -MAX_R; x <= MAX_R; x++) {
    for (let y = -MAX_R; y <= MAX_R; y++) {
      for (let z = -MAX_R; z <= MAX_R; z++) {
        const distSq = x*x + y*y + z*z;
        // Pula o que está claramente fora ou dentro
        const minBound = R - 4;
        const maxBound = MAX_R;
        if (distSq < minBound * minBound || distSq > maxBound * maxBound) continue;

        const dist = Math.sqrt(distSq);
        const nx = x / dist, ny = y / dist, nz = z / dist;
        const h = terrainHeight(nx, ny, nz);
        const surfaceDist = R + h;

        // Casca sólida: tudo entre o interior e a superfície
        // Isso garante ZERO buracos — preenchemos de (surfaceDist - 3) até surfaceDist
        if (dist >= surfaceDist - 3 && dist <= surfaceDist + 0.4) {
          const n = hash(x, y, z);
          // Voxels internos (abaixo da superfície) usam cor de pedra
          const isInner = dist < surfaceDist - 0.8;
          const color = isInner ? (n > 0.5 ? C.stone2 : C.stone3) : terrainColor(h, n, weather);
          addV(x, y, z, color, data, occ);
        }
      }
    }
  }

  // Árvores normais
  let trees = 0;
  for (let i = 0; i < data.length; i += 45) {
    if (trees >= 80) break;
    const v = data[i];
    const isGrass = v.color === C.grass1 || v.color === C.grass2 || v.color === C.grass3 || v.color === C.grass4;
    if (!isGrass) continue;

    const [px, py, pz] = v.pos;
    const n = hash(px+7, py+3, pz+11);
    if (n < 0.88) continue;

    const dist = Math.sqrt(px*px+py*py+pz*pz);
    const ux=px/dist, uy=py/dist, uz=pz/dist;
    const trunkH = 3 + Math.floor(n*3);

    for (let t = 1; t <= trunkH; t++) {
      addV(Math.round(px+ux*t), Math.round(py+uy*t), Math.round(pz+uz*t), C.trunk, data, occ);
    }

    const cx = px+ux*(trunkH+1.5), cy = py+uy*(trunkH+1.5), cz = pz+uz*(trunkH+1.5);
    for (let dx=-2; dx<=2; dx++)
    for (let dy=-2; dy<=2; dy++)
    for (let dz=-2; dz<=2; dz++) {
      if (dx*dx+dy*dy+dz*dz <= 5 && hash(dx+px,dy+py,dz+pz) > 0.2) {
        const ln = hash(dx*3+px, dy*3+py, dz*3+pz);
        addV(Math.round(cx+dx), Math.round(cy+dy), Math.round(cz+dz),
          ln>0.6?C.leaf1:ln>0.35?C.leaf2:C.leaf3, data, occ);
      }
    }
    trees++;
  }

  // Grande árvore monumental
  addGreatTree(data, occ);

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
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} metalness={0} flatShading />
    </instancedMesh>
  );
}

/* ═══════ ATMOSFERA REATIVA (sem useMemo — atualiza a cada frame) ═══════ */
function Atmosphere() {
  const { scene } = useThree();
  const bgRef = useRef(new THREE.Color("#070e2b"));

  useFrame(() => {
    scene.background = bgRef.current;
  });

  return <AtmosphereUpdater bgRef={bgRef} />;
}

function AtmosphereUpdater({ bgRef }: { bgRef: React.RefObject<THREE.Color> }) {
  const { hour, weather } = useGameState();
  const { scene } = useThree();

  // Atualiza cor do fundo e névoa a cada mudança de hour ou weather
  useLayoutEffect(() => {
    let bg: string;
    if (weather === "storm") bg = "#0a0a0f";
    else if (weather === "fog") bg = "#1e293b";
    else if (hour >= 0 && hour < 5) bg = "#020408";
    else if (hour >= 5 && hour < 7) bg = "#1a0e3a";
    else if (hour >= 7 && hour < 8) bg = "#1e1b4b";
    else if (hour >= 8 && hour < 11) bg = "#0c1445";
    else if (hour >= 11 && hour < 16) bg = "#070e2b";
    else if (hour >= 16 && hour < 18) bg = "#1a1040";
    else if (hour >= 18 && hour < 20) bg = "#12082a";
    else bg = "#020408";

    if (bgRef.current) bgRef.current.set(bg);

    if (weather === "fog") scene.fog = new THREE.Fog("#334155", R * 0.8, R * 3);
    else if (weather === "storm") scene.fog = new THREE.Fog("#0f172a", R, R * 3.5);
    else scene.fog = null;
  }, [hour, weather, scene, bgRef]);

  return null;
}

/* ═══════ SOL DINÂMICO ═══════ */
function SunLight() {
  const { hour, weather } = useGameState();
  const ref = useRef<THREE.DirectionalLight>(null!);
  const ambRef = useRef<THREE.AmbientLight>(null!);

  useFrame(() => {
    if (!ref.current) return;
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const d = R * 4;
    ref.current.position.set(Math.cos(angle)*d, Math.sin(angle)*d, Math.sin(angle)*d*0.4);
    const day = Math.max(0, Math.sin(angle));
    const dim = weather==="storm"?0.25:weather==="fog"?0.5:1;
    ref.current.intensity = (0.15 + day * 1.5) * dim;

    // Ambient também muda com hora
    if (ambRef.current) {
      ambRef.current.intensity = (0.2 + day * 0.4) * dim;
    }
  });

  return (
    <>
      <directionalLight ref={ref} color="#fef3c7" />
      <ambientLight ref={ambRef} intensity={0.45} />
    </>
  );
}

/* ═══════ PLANETA ═══════ */
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

/* ═══════ CANVAS ═══════ */
export default function VoxelPlanet() {
  const { weather, weatherPanelOpen, diaryOpen } = useGameState();
  const orbitEnabled = !weatherPanelOpen && !diaryOpen;

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 15, R * 2.8], fov: 45 }} dpr={[1, 1.5]}>
        <Atmosphere />
        <hemisphereLight args={["#bfdbfe", "#1e293b", 0.25]} />
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
