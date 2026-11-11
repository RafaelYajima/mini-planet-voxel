"use client";

import { useLayoutEffect, useMemo, useRef, useEffect, useState } from "react";
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
const CAVE_DIR = norm([-0.72, -0.10, -0.68]);

/* ═══════ TERRENO ═══════ */
function terrainHeight(nx:number, ny:number, nz:number): number {
  const dir:[number,number,number]=[nx,ny,nz];
  // Montanhas pequenas e médias (Ambientação)
  const hills = (fbm(nx*2.5, ny*2.5, nz*2.5, 4)-0.3)*8;
  const smallPeaks = Math.pow(Math.max(0, fbm(nx*5, ny*5, nz*5, 2)-0.4), 2)*15;
  
  // Cratera
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
  
  // Subtração da Caverna
  const startD=R-6, endD=R-20;
  const sx=CAVE_DIR[0]*startD, sy=CAVE_DIR[1]*startD, sz=CAVE_DIR[2]*startD;
  const ex=CAVE_DIR[0]*endD, ey=CAVE_DIR[1]*endD, ez=CAVE_DIR[2]*endD;
  const dx=x-sx, dy=y-sy, dz=z-sz;
  const lx=ex-sx, ly=ey-sy, lz=ez-sz;
  const tCave=Math.max(0,Math.min(1,(dx*lx+dy*ly+dz*lz)/(lx*lx+ly*ly+lz*lz)));
  const distToCave = Math.sqrt((x-(sx+tCave*lx))**2+(y-(sy+tCave*ly))**2+(z-(sz+tCave*lz))**2);
  if(distToCave < 3.8) return null;

  const h = terrainHeight(nx,ny,nz);
  const surfDist = R + h;
  if(dist > surfDist + 0.3) return null;
  if(dist < surfDist - 1.0) return null; // Casca de 1 bloco

  const n = hash(x,y,z);
  const clusterNoise = noise3d(x*0.15, y*0.15, z*0.15); // Ruído para manchas (clusters)
  
  // Lógica de Transição por Manchas
  // Se clusterNoise < progress, o bloco já "pegou" o novo clima
  const effectiveWeather = clusterNoise < progress ? weather : "sunny";

  // Determinação da Cor baseada no Clima Efetivo
  if(effectiveWeather === "snow" || effectiveWeather === "storm") {
    if(h > -2) return n > 0.4 ? C.snow1 : C.snow2;
  }
  
  // Água do Lago
  const dL = dot3([nx,ny,nz], LAKE_DIR);
  if(dL > 0.93 && dist < R - 2) return C.water;

  if(h > 12) return n > 0.5 ? C.snow1 : C.snow2; // Picos nevados permanentes
  if(h > 6) return n > 0.5 ? C.stone1 : C.stone2;
  if(h < -12) return C.craterFloor;
  
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
  const maxR = R + 15, minR = R - 18;

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

  // Árvores Regulares (Pequenas)
  let smallTrees = 0;
  for(let i=0; i<data.length && smallTrees < 150; i += 40) {
    const v = data[i];
    if(v.colorSunny !== C.grass1 && v.colorSunny !== C.grass2) continue;
    const [px,py,pz] = v.pos;
    if(hash(px,py,pz) < 0.97) continue;
    const dist = Math.sqrt(px*px+py*py+pz*pz);
    const ux=px/dist, uy=py/dist, uz=pz/dist;
    const h = 2 + Math.floor(hash(px,py,pz)*2);
    for(let t=1; t<=h; t++) {
      const tx=Math.round(px+ux*t), ty=Math.round(py+uy*t), tz=Math.round(pz+uz*t);
      data.push({ pos:[tx,ty,tz], colorSunny:C.trunk, colorWeather:C.trunk, cluster:-1 });
    }
    const cx=px+ux*(h+1), cy=py+uy*(h+1), cz=pz+uz*(h+1);
    for(let dx=-2; dx<=2; dx++) for(let dy=-2; dy<=2; dy++) for(let dz=-2; dz<=2; dz++) {
      if(dx*dx+dy*dy+dz*dz < 5) {
        data.push({ pos:[Math.round(cx+dx),Math.round(cy+dy),Math.round(cz+dz)], colorSunny:C.leaf2, colorWeather:C.leaf2, cluster:-1 });
      }
    }
    smallTrees++;
  }

  // Árvore Colossal (Ainda Maior)
  const [tx,ty,tz]=TREE_DIR;
  const hT=terrainHeight(tx,ty,tz);
  const bx=tx*(R+hT), by=ty*(R+hT), bz=tz*(R+hT);
  const trunkH = 45;
  for(let i=0; i<trunkH; i++) {
    const cx=bx+tx*i, cy=by+ty*i, cz=bz+tz*i;
    const r=Math.max(2, Math.round(6*(1-i/trunkH)+1));
    for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++) for(let dz=-r; dz<=r; dz++) {
      if(dx*dx+dy*dy+dz*dz <= r*r) {
        data.push({ pos:[Math.round(cx+dx),Math.round(cy+dy),Math.round(cz+dz)], colorSunny:C.trunk, colorWeather:C.trunk, cluster:-1 });
      }
    }
    // Galhos Colossais
    if(i > 20 && i % 10 === 0) {
      const ang = i * 1.5;
      for(let j=0; j<22; j++) {
        const gx=Math.round(cx+Math.cos(ang)*j*2), gy=Math.round(cy+j*0.8), gz=Math.round(cz+Math.sin(ang)*j*2);
        data.push({ pos:[gx,gy,gz], colorSunny:C.trunk, colorWeather:C.trunk, cluster:-1 });
        if(j > 18) {
          for(let lx=-7; lx<=7; lx++) for(let ly=-7; ly<=7; ly++) for(let lz=-7; lz<=7; lz++)
            if(lx*lx+ly*ly+lz*lz < 45) data.push({ pos:[gx+lx,gy+ly,gz+lz], colorSunny:C.leaf1, colorWeather:C.leaf1, cluster:-1 });
        }
      }
    }
  }

  return data;
}

/* ═══════ COMPONENTE PLANETA ═══════ */
function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Gerar uma vez só, sem depender de weather
  const voxels = useMemo(() => generatePlanet("sunny"), []);

  // Controle de transição
  const lastWeather = useRef<WeatherType>("sunny");
  const transitionQueue = useRef<number[]>([]); // índices dos blocos que faltam mudar
  const transitionDone = useRef(true);

  // Posições (uma vez)
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < voxels.length; i++) {
      dummy.position.set(...voxels[i].pos);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, voxels[i].colorSunny);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor!.needsUpdate = true;
  }, [voxels]);

  useFrame(() => {
    if (!meshRef.current) return;

    // Detecta troca de clima → cria fila de transição
    if (lastWeather.current !== weather) {
      lastWeather.current = weather;

      // Pré-computa as cores alvo para este clima
      for (let i = 0; i < voxels.length; i++) {
        const v = voxels[i];
        if (v.cluster === -1) continue; // árvores não mudam
        const [x, y, z] = v.pos;
        v.colorWeather = getVoxelData(x, y, z, weather, 1.1) || v.colorSunny;
      }

      // Ordena os índices pelo valor de cluster (manchas crescentes)
      const indices: { idx: number; cluster: number }[] = [];
      for (let i = 0; i < voxels.length; i++) {
        if (voxels[i].cluster !== -1) indices.push({ idx: i, cluster: voxels[i].cluster });
      }
      indices.sort((a, b) => a.cluster - b.cluster);
      transitionQueue.current = indices.map(i => i.idx);
      transitionDone.current = false;
    }

    // Processa lote: ~300 blocos por frame = ~15s para 55k blocos a 60fps
    if (!transitionDone.current) {
      const queue = transitionQueue.current;
      const batchSize = Math.min(300, queue.length);
      if (batchSize === 0) {
        transitionDone.current = true;
        return;
      }
      const batch = queue.splice(0, batchSize);
      for (const idx of batch) {
        meshRef.current.setColorAt(idx, voxels[idx].colorWeather);
      }
      meshRef.current.instanceColor!.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.8} flatShading />
    </instancedMesh>
  );
}

/* ═══════ ROTAÇÃO ═══════ */
function Rotator({children}:{children:React.ReactNode}) {
  const ref = useRef<THREE.Group>(null!);
  const {weather} = useGameState();
  useFrame((_,d)=>{ ref.current.rotation.y += d*(weather==="storm"?0.15:0.04); });
  return <group ref={ref}>{children}</group>;
}

/* ═══════ ATMOSFERA ═══════ */
function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();

  // Inicializa background no mount
  useLayoutEffect(() => {
    scene.background = new THREE.Color("#070e2b");
  }, [scene]);

  useFrame((_,delta) => {
    if (!scene.background) scene.background = new THREE.Color("#070e2b");
    let bg = "#070e2b";
    if(weather==="storm") bg="#0a0a0f";
    else if(weather==="fog") bg="#1e293b";
    else if(weather==="rain") bg="#0d1025";
    else if(weather==="snow") bg="#101828";
    else if(hour<5) bg="#020408";
    else if(hour<7) bg="#1a0e3a";
    else if(hour<8) bg="#1e1b4b";
    else if(hour<11) bg="#0c1445";
    else if(hour<16) bg="#070e2b";
    else if(hour<18) bg="#1a1040";
    else if(hour<20) bg="#12082a";
    else bg="#020408";

    (scene.background as THREE.Color).lerp(new THREE.Color(bg), delta*2);
    
    if(weather==="fog") scene.fog = new THREE.Fog("#334155", R*0.6, R*3);
    else if(weather==="storm") scene.fog = new THREE.Fog("#0f172a", R, R*3.5);
    else if(weather==="rain") scene.fog = new THREE.Fog("#1a2332", R*2, R*5);
    else scene.fog = null;
  });
  return <color attach="background" args={["#070e2b"]} />;
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
