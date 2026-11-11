"use client";

import { useLayoutEffect, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";

const R = 40;

/* ═══════ PALETA ═══════ */
const C = {
  grass1: new THREE.Color("#4ade80"), grass2: new THREE.Color("#22c55e"),
  grass3: new THREE.Color("#16a34a"), grass4: new THREE.Color("#15803d"),
  dirt1: new THREE.Color("#92400e"), dirt2: new THREE.Color("#a16207"),
  stone1: new THREE.Color("#6b7280"), stone2: new THREE.Color("#4b5563"),
  stone3: new THREE.Color("#374151"), stoneDeep: new THREE.Color("#2d3748"),
  craterFloor: new THREE.Color("#475569"),
  snow1: new THREE.Color("#e0f2fe"), snow2: new THREE.Color("#f8fafc"),
  mud: new THREE.Color("#5c2d0a"), water: new THREE.Color("#0ea5e9"),
  trunk: new THREE.Color("#5b3418"), trunkDark: new THREE.Color("#3e200c"),
  bark: new THREE.Color("#4a2c12"),
  leaf1: new THREE.Color("#15803d"), leaf2: new THREE.Color("#166534"),
  leaf3: new THREE.Color("#14532d"), leafBright: new THREE.Color("#22c55e"),
};

/* ═══════ MATH & NOISE ═══════ */
function norm(v: [number,number,number]): [number,number,number] {
  const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d,v[1]/d,v[2]/d];
}
function dot3(a: [number,number,number], b: [number,number,number]) {
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}
function hash(x: number, y: number, z: number): number {
  let h=(x*374761393+y*668265263+z*1274126177)|0;
  h=((h^(h>>13))*1103515245)|0;
  return ((h^(h>>16))&0x7fffffff)/0x7fffffff;
}
function noise3d(x:number,y:number,z:number): number {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const fx=x-ix,fy=y-iy,fz=z-iz;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),sz=fz*fz*(3-2*fz);
  const a=hash(ix,iy,iz),b=hash(ix+1,iy,iz),c=hash(ix,iy+1,iz),d=hash(ix+1,iy+1,iz);
  const e=hash(ix,iy,iz+1),f=hash(ix+1,iy,iz+1),g=hash(ix,iy+1,iz+1),h2=hash(ix+1,iy+1,iz+1);
  const x0=a+(b-a)*sx,x1=e+(f-e)*sx,x2=c+(d-c)*sx,x3=g+(h2-g)*sx;
  return (x0+(x2-x0)*sy)+((x1+(x3-x1)*sy)-(x0+(x2-x0)*sy))*sz;
}
function fbm(x:number,y:number,z:number, oct=3): number {
  let v=0, a=0.5, f=1;
  for(let i=0; i<oct; i++) { v += noise3d(x*f, y*f, z*f)*a; a*=0.5; f*=2.1; }
  return v;
}

/* ═══════ LANDMARKS ═══════ */
const HOLE_DIR = norm([-0.78, 0.08, -0.62]);
const TREE_DIR = norm([0.48, 0.12, 0.86]);
const LAKE_DIR = norm([0.2, -0.6, -0.4]);
const CAVE_DIR = norm([-0.85, -0.15, -0.55]);

/* ═══════ TERRENO ═══════ */
function terrainHeight(nx:number, ny:number, nz:number): number {
  const dir:[number,number,number]=[nx,ny,nz];
  // Montanhas base e pequenos picos
  const hills = (fbm(nx*2.5, ny*2.5, nz*2.5, 4)-0.3)*8;
  const smallPeaks = Math.pow(Math.max(0, fbm(nx*5, ny*5, nz*5, 2)-0.4), 2)*15;
  
  // Cratera profunda
  const dH=dot3(dir,HOLE_DIR);
  let crater=0;
  if(dH>0.96) crater=-14;
  else if(dH>0.88) { const t=(dH-0.88)/(0.96-0.88); crater=-14*(t*t*(3-2*t)); }
  
  // Lago
  const dL=dot3(dir,LAKE_DIR);
  let lake=0;
  if(dL>0.94) lake=-6;
  else if(dL>0.86) { const t=(dL-0.86)/(0.94-0.86); lake=-6*(t*t*(3-2*t)); }

  return hills + smallPeaks + crater + lake;
}

function getVoxelData(x:number, y:number, z:number, weather: WeatherType, progress: number): THREE.Color | null {
  const dist=Math.sqrt(x*x+y*y+z*z);
  const nx=x/dist, ny=y/dist, nz=z/dist;
  const h = terrainHeight(nx,ny,nz);
  const surfDist = R + h;
  
  // Casca muito grossa: não tem erro, não tem furos. De 3 blocos de espessura.
  if(dist > surfDist + 0.3) return null;
  if(dist < surfDist - 3.5) return null;

  // Caverna: Subtração Cilíndrica Clara
  const startD = R - 4; // Começa dentro da cratera
  const endD = R - 20;  // Entra no planeta
  const sx = CAVE_DIR[0]*startD, sy = CAVE_DIR[1]*startD, sz = CAVE_DIR[2]*startD;
  const ex = CAVE_DIR[0]*endD, ey = CAVE_DIR[1]*endD, ez = CAVE_DIR[2]*endD;
  const dx=x-sx, dy=y-sy, dz=z-sz;
  const lx=ex-sx, ly=ey-sy, lz=ez-sz;
  const tCave = Math.max(0, Math.min(1, (dx*lx+dy*ly+dz*lz)/(lx*lx+ly*ly+lz*lz)));
  const distToCave = Math.sqrt((x-(sx+tCave*lx))**2+(y-(sy+tCave*ly))**2+(z-(sz+tCave*lz))**2);
  // Se está dentro do túnel da caverna (raio 4), deletamos o bloco.
  if(distToCave < 4.0) return null;

  const n = hash(x,y,z);
  const clusterNoise = noise3d(x*0.15, y*0.15, z*0.15);
  
  const effectiveWeather = clusterNoise < progress ? weather : "sunny";

  // Se for o interior da casca, é rocha escura (evita ver furos)
  if (dist < surfDist - 1.5) {
    return n > 0.5 ? C.stoneDeep : C.stone3;
  }

  // Clima de neve e tempestade afetam a superfície
  if(effectiveWeather === "snow" || effectiveWeather === "storm") {
    if(h > -2) return n > 0.4 ? C.snow1 : C.snow2;
  }
  
  // Água do Lago
  const dL = dot3([nx,ny,nz], LAKE_DIR);
  if(dL > 0.93 && dist < R - 2.5) return C.water;

  if(h > 12) return n > 0.5 ? C.snow1 : C.snow2; // Picos
  if(h > 6) return n > 0.5 ? C.stone1 : C.stone2; // Pedra
  if(h < -12) return C.craterFloor; // Fundo da cratera
  
  // Poças na chuva
  if(effectiveWeather === "rain" && h < 1) {
    const pNoise = hash(Math.round(x*0.2), 0, Math.round(z*0.2));
    if(pNoise > 0.8) return C.water;
    if(pNoise > 0.6) return C.mud;
  }

  if(n > 0.8) return C.dirt1;
  return n > 0.6 ? C.grass1 : n > 0.3 ? C.grass2 : C.grass3;
}

type Voxel = { pos:[number,number,number]; colorSunny:THREE.Color; colorWeather:THREE.Color; cluster:number };

/* ═══════ GERAÇÃO ═══════ */
function generatePlanet(weather: WeatherType): Voxel[] {
  const data: Voxel[]=[];
  const occ=new Set<string>();
  const maxR = R + 22, minR = R - 22;

  // 1. Geração da Superfície do Planeta
  for(let x=-maxR; x<=maxR; x++)
  for(let y=-maxR; y<=maxR; y++)
  for(let z=-maxR; z<=maxR; z++) {
    const dSq = x*x+y*y+z*z;
    if(dSq < minR*minR || dSq > maxR*maxR) continue;
    
    const color = getVoxelData(x,y,z, "sunny", 0);
    if(color) {
      const cluster = noise3d(x*0.15, y*0.15, z*0.15);
      const wColor = getVoxelData(x,y,z, weather, 1.1) || color;
      data.push({ pos:[x,y,z], colorSunny:color, colorWeather:wColor, cluster });
      occ.add(`${x},${y},${z}`);
    }
  }

  // Helper para adicionar blocos de vegetação ignorando duplicatas
  const addBlock = (x:number, y:number, z:number, c:THREE.Color) => {
    const key = `${x},${y},${z}`;
    if(!occ.has(key)) {
      occ.add(key);
      data.push({ pos:[x,y,z], colorSunny:c, colorWeather:c, cluster:-1 });
    }
  }

  // 2. Árvores Regulares
  let smallTrees = 0;
  for(let i=0; i<data.length && smallTrees < 120; i += 50) {
    const v = data[i];
    if(v.colorSunny !== C.grass1 && v.colorSunny !== C.grass2) continue;
    const [px,py,pz] = v.pos;
    if(hash(px,py,pz) < 0.96) continue;
    const dist = Math.sqrt(px*px+py*py+pz*pz);
    const ux=px/dist, uy=py/dist, uz=pz/dist;
    const h = 2 + Math.floor(hash(px,py,pz)*2);
    
    // Tronco
    for(let t=1; t<=h; t++) addBlock(Math.round(px+ux*t), Math.round(py+uy*t), Math.round(pz+uz*t), C.trunk);
    
    // Copa Esférica sólida
    const cx=px+ux*(h+1), cy=py+uy*(h+1), cz=pz+uz*(h+1);
    for(let dx=-2; dx<=2; dx++) for(let dy=-2; dy<=2; dy++) for(let dz=-2; dz<=2; dz++) {
      if(dx*dx+dy*dy+dz*dz <= 5) addBlock(Math.round(cx+dx), Math.round(cy+dy), Math.round(cz+dz), C.leaf2);
    }
    smallTrees++;
  }

  // 3. A Grande Árvore Colossal (Totalmente preenchida, sem furos)
  const [tx,ty,tz] = TREE_DIR;
  const hT = terrainHeight(tx,ty,tz);
  const bx = tx*(R+hT), by = ty*(R+hT), bz = tz*(R+hT);
  const trunkH = 45;

  // Tronco Principal (sólido)
  for(let i=0; i<trunkH; i++) {
    const cx=bx+tx*i, cy=by+ty*i, cz=bz+tz*i;
    const r=Math.max(2, Math.round(5*(1-i/trunkH)+1));
    for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++) for(let dz=-r; dz<=r; dz++) {
      if(dx*dx+dy*dy+dz*dz <= r*r) addBlock(Math.round(cx+dx), Math.round(cy+dy), Math.round(cz+dz), C.trunk);
    }

    // Galhos Grandes
    if(i > 20 && i % 10 === 0) {
      const ang = i * 1.5;
      const gxDir = Math.cos(ang), gyDir = 0.4, gzDir = Math.sin(ang);
      
      let lastGX = cx, lastGY = cy, lastGZ = cz;
      // Cilindro contínuo para o galho
      for(let j=0; j<24; j++) {
        lastGX = cx + gxDir * j * 1.5;
        lastGY = cy + gyDir * j * 1.5;
        lastGZ = cz + gzDir * j * 1.5;
        
        // Galho sólido
        for(let dx=-1; dx<=1; dx++) for(let dy=-1; dy<=1; dy++) for(let dz=-1; dz<=1; dz++) {
          if(dx*dx+dy*dy+dz*dz <= 2) addBlock(Math.round(lastGX+dx), Math.round(lastGY+dy), Math.round(lastGZ+dz), C.trunk);
        }
      }

      // Copa Esférica Massiva e SÓLIDA na ponta do galho
      const crownR = 7;
      for(let lx=-crownR; lx<=crownR; lx++) for(let ly=-crownR; ly<=crownR; ly++) for(let lz=-crownR; lz<=crownR; lz++) {
        if(lx*lx+ly*ly+lz*lz <= crownR*crownR) addBlock(Math.round(lastGX+lx), Math.round(lastGY+ly), Math.round(lastGZ+lz), C.leaf1);
      }
    }
  }

  // Copa Central Gigante no topo da árvore
  const topX = bx+tx*(trunkH+2), topY = by+ty*(trunkH+2), topZ = bz+tz*(trunkH+2);
  const topR = 10;
  for(let lx=-topR; lx<=topR; lx++) for(let ly=-topR; ly<=topR; ly++) for(let lz=-topR; lz<=topR; lz++) {
    if(lx*lx+ly*ly+lz*lz <= topR*topR) addBlock(Math.round(topX+lx), Math.round(topY+ly), Math.round(topZ+lz), C.leafBright);
  }

  return data;
}

/* ═══════ COMPONENTE PLANETA ═══════ */
function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  
  // O Planeta é gerado UMA VEZ
  const voxels = useMemo(() => generatePlanet("sunny"), []);
  
  const transitionStart = useRef(Date.now());
  const prevWeather = useRef<WeatherType>("sunny");

  useEffect(() => {
    transitionStart.current = Date.now();
  }, [weather]);

  useFrame(() => {
    if(!meshRef.current) return;
    const elapsed = (Date.now() - transitionStart.current) / 1000;
    const progress = Math.min(elapsed / 15, 1); 

    for(let i=0; i<voxels.length; i++) {
      const v = voxels[i];
      if(v.cluster === -1) continue; 
      const normalizedCluster = (v.cluster + 1) / 2;
      const color = normalizedCluster < progress ? v.colorWeather : v.colorSunny;
      meshRef.current.setColorAt(i, color);
    }
    meshRef.current.instanceColor!.needsUpdate = true;
  });

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    voxels.forEach((v, i) => {
      dummy.position.set(...v.pos);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, v.colorSunny);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor!.needsUpdate = true;
  }, [voxels]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1.05, 1.05, 1.05]} />
      <meshStandardMaterial roughness={0.8} flatShading />
    </instancedMesh>
  );
}

/* ═══════ ROTAÇÃO E ATMOSFERA ═══════ */
function Rotator({children}:{children:React.ReactNode}) {
  const ref = useRef<THREE.Group>(null!);
  const {weather} = useGameState();
  useFrame((_,d)=>{ ref.current.rotation.y += d*(weather==="storm"?0.15:0.04); });
  return <group ref={ref}>{children}</group>;
}

function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();
  useFrame((_,delta) => {
    let bg = "#070e2b";
    if(weather==="storm") bg="#0a0a0f";
    else if(weather==="fog") bg="#1e293b";
    else if(hour<6 || hour>20) bg="#020408";
    (scene.background as THREE.Color).lerp(new THREE.Color(bg), delta);
    if(weather==="fog") scene.fog = new THREE.Fog(bg, R, R*3);
    else scene.fog = null;
  });
  return null;
}

function Sun() {
  const { hour } = useGameState();
  const ref = useRef<THREE.DirectionalLight>(null!);
  useFrame(() => {
    const a = ((hour-6)/24)*Math.PI*2;
    ref.current.position.set(Math.cos(a)*200, Math.sin(a)*200, 50);
    ref.current.intensity = Math.max(0, Math.sin(a))*1.8 + 0.15;
  });
  return <directionalLight ref={ref} color="#fff4d6" castShadow />;
}

export default function VoxelPlanet() {
  const { weatherPanelOpen, diaryOpen, weather } = useGameState();
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 40, 160], fov: 45 }} dpr={[1, 1.5]}>
        <Atmosphere />
        <ambientLight intensity={0.4} />
        <Sun />
        <Rotator><PlanetBody /></Rotator>
        <Stars radius={300} count={6000} factor={7} fade />
        {weather === "sunny" && <Sparkles count={100} scale={R * 3} size={4} speed={0.4} color="#fde68a" />}
        <OrbitControls enabled={!weatherPanelOpen && !diaryOpen} enablePan={false} minDistance={80} maxDistance={280} />
      </Canvas>
    </div>
  );
}
