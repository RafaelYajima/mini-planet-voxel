"use client";

import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";

const R = 40;
const MAX_R = R + 25;

/* ═══════ PALETA ═══════ */
const C = {
  grass1: new THREE.Color("#4ade80"), grass2: new THREE.Color("#22c55e"),
  grass3: new THREE.Color("#16a34a"), grass4: new THREE.Color("#15803d"),
  dirt1: new THREE.Color("#92400e"), dirt2: new THREE.Color("#a16207"),
  stone1: new THREE.Color("#6b7280"), stone2: new THREE.Color("#4b5563"),
  stone3: new THREE.Color("#374151"), stoneDeep: new THREE.Color("#2d3748"),
  craterFloor: new THREE.Color("#475569"),
  snow1: new THREE.Color("#e0f2fe"), snow2: new THREE.Color("#f8fafc"),
  mud: new THREE.Color("#5c2d0a"),
  water: new THREE.Color("#0ea5e9"),
  trunk: new THREE.Color("#5b3418"), trunkDark: new THREE.Color("#3e200c"),
  bark: new THREE.Color("#4a2c12"),
  leaf1: new THREE.Color("#15803d"), leaf2: new THREE.Color("#166534"),
  leaf3: new THREE.Color("#14532d"), leafBright: new THREE.Color("#22c55e"),
};

/* ═══════ DIREÇÕES ═══════ */
function norm(v: [number,number,number]): [number,number,number] {
  const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d,v[1]/d,v[2]/d];
}
function dot3(a: [number,number,number], b: [number,number,number]) {
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}
const HOLE_DIR = norm([-0.78, 0.08, -0.62]);
const TREE_DIR = norm([0.48, 0.12, 0.86]);
const CAVE_ENTRANCE = norm([-0.85, -0.15, -0.55]); // parede da cratera

/* ═══════ RUÍDO ═══════ */
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
function fbm(x:number,y:number,z:number): number {
  return noise3d(x,y,z)*0.5+noise3d(x*2.1,y*2.1,z*2.1)*0.25+noise3d(x*4.3,y*4.3,z*4.3)*0.15;
}

/* ═══════ GEOMETRIA DO TERRENO ═══════ */
function terrainHeight(nx:number, ny:number, nz:number): number {
  const dir:[number,number,number]=[nx,ny,nz];
  const base=(fbm(nx*1.8,ny*1.8,nz*1.8)-0.5)*6;
  const dHole=dot3(dir,HOLE_DIR);
  let crater=0;
  if(dHole>0.96) crater=-16;
  else if(dHole>0.88) {
    const t=(dHole-0.88)/(0.96-0.88);
    crater=-16*(t*t*(3-2*t));
  }
  return base+crater;
}

function getVoxelType(x:number, y:number, z:number): { isSolid: boolean; isCave: boolean } {
  const dist=Math.sqrt(x*x+y*y+z*z);
  if(dist<R-22) return { isSolid: false, isCave: false };
  const nx=x/dist, ny=y/dist, nz=z/dist;
  const h=terrainHeight(nx,ny,nz);
  const surfaceDist=R+h;
  
  const isSolid = dist <= surfaceDist;
  
  // Caverna: Túnel que entra pela parede da cratera
  // Definimos um segmento de reta que entra no planeta
  const caveStart = CAVE_ENTRANCE.map(v => v * (R-10)) as [number,number,number];
  const caveEnd = CAVE_ENTRANCE.map(v => v * (R-25)) as [number,number,number];
  
  // Distancia do ponto (x,y,z) ao segmento da caverna
  const dx=x-caveStart[0], dy=y-caveStart[1], dz=z-caveStart[2];
  const ex=caveEnd[0]-caveStart[0], ey=caveEnd[1]-caveStart[1], ez=caveEnd[2]-caveStart[2];
  const lenSq=ex*ex+ey*ey+ez*ez;
  const t=Math.max(0,Math.min(1,(dx*ex+dy*ey+dz*ez)/lenSq));
  const px=caveStart[0]+t*ex, py=caveStart[1]+t*ey, pz=caveStart[2]+t*ez;
  const distToCave = Math.sqrt((x-px)**2+(y-py)**2+(z-pz)**2);
  
  const isCave = distToCave < 3.5;
  
  return { isSolid: isSolid && !isCave, isCave };
}

/* ═══════ LÓGICA DE COR (Com Poças e Lama) ═══════ */
function getTargetColor(x:number, y:number, z:number, weather: WeatherType): THREE.Color {
  const dist=Math.sqrt(x*x+y*y+z*z);
  const nx=x/dist, ny=y/dist, nz=z/dist;
  const h=terrainHeight(nx,ny,nz);
  const n=hash(x,y,z);
  const pNoise = hash(x*0.1, y*0.1, z*0.1); // Ruído para poças

  // Neve
  if((weather==="snow"||weather==="storm") && h>-5) return n>0.4?C.snow1:C.snow2;
  if(h>12) return n>0.4?C.snow1:C.snow2;

  // Chuva: Poças e Lama
  if((weather==="rain"||weather==="storm") && h<1.5) {
    if(pNoise > 0.82) return C.water; // Poça
    if(pNoise > 0.65) return C.mud;   // Lama ao redor
  }

  if(h>7) return n>0.5?C.stone1:C.stone2;
  if(h<=-14) return C.craterFloor;
  if(h<-6) return C.stoneDeep;
  
  if(n>0.8) return C.dirt1;
  return n>0.6?C.grass1:n>0.3?C.grass2:C.grass3;
}

type Voxel = { pos:[number,number,number]; color:THREE.Color; id:number };

function addV(x:number, y:number, z:number, c:THREE.Color, d:Voxel[], o:Set<string>) {
  const k=`${x},${y},${z}`; if(o.has(k)) return; o.add(k); d.push({pos:[x,y,z],color:c,id:d.length});
}

/* ═══════ GERAÇÃO ═══════ */
function generatePlanet() {
  const data: Voxel[]=[];
  const occ=new Set<string>();
  const solidMap = new Set<string>();
  
  // 1. Mapeia sólidos
  for(let x=-MAX_R;x<=MAX_R;x++)
  for(let y=-MAX_R;y<=MAX_R;y++)
  for(let z=-MAX_R;z<=MAX_R;z++) {
    const dSq=x*x+y*y+z*z;
    if(dSq<(R-23)**2 || dSq>MAX_R**2) continue;
    if(getVoxelType(x,y,z).isSolid) solidMap.add(`${x},${y},${z}`);
  }

  // 2. Filtra visíveis
  const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  let idAcc=0;
  for(const k of solidMap) {
    const [x,y,z]=k.split(",").map(Number);
    let exp=false;
    for(const [dx,dy,dz] of dirs) if(!solidMap.has(`${x+dx},${y+dy},${z+dz}`)) { exp=true; break; }
    if(exp) {
      const dist=Math.sqrt(x*x+y*y+z*z);
      const h=terrainHeight(x/dist,y/dist,z/dist);
      const color = (R+h-dist)>0.8 ? C.stoneDeep : getTargetColor(x,y,z,"sunny");
      addV(x,y,z,color,data,occ);
    }
  }

  // 3. Árvore Colossal Robustíssima
  const [tx,ty,tz]=TREE_DIR;
  const th=terrainHeight(tx,ty,tz);
  const bx=tx*(R+th), by=ty*(R+th), bz=tz*(R+th);
  
  // Tronco Colossal
  const tH=38;
  for(let i=0;i<=tH;i++) {
    const cx=bx+tx*i, cy=by+ty*i, cz=bz+tz*i;
    const r=Math.max(2, Math.round(5*(1-i/tH)+1));
    for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)for(let dz=-r;dz<=r;dz++) {
      if(dx*dx+dy*dy+dz*dz<=r*r+1) addV(Math.round(cx+dx),Math.round(cy+dy),Math.round(cz+dz),C.trunk,data,occ);
    }
    // Galhos longos e espaçados
    if(i>15 && i%8===0) {
      const bAng=(i*2.4);
      for(let j=0;j<18;j++) {
        const gx=Math.round(cx+Math.cos(bAng)*j*1.8), gy=Math.round(cy+j*0.5), gz=Math.round(cz+Math.sin(bAng)*j*1.8);
        addV(gx,gy,gz,C.trunk,data,occ);
        if(j===17) { // Copa na ponta
          for(let lx=-6;lx<=6;lx++)for(let ly=-6;ly<=6;ly++)for(let lz=-6;lz<=6;lz++)
            if(lx*lx+ly*ly+lz*lz<30) addV(gx+lx,gy+ly,gz+lz,C.leaf1,data,occ);
        }
      }
    }
  }

  return data.map((v,i)=>({...v,id:i}));
}

/* ═══════ COMPONENTE PLANETA ═══════ */
function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const voxels = useMemo(() => generatePlanet(), []);
  
  // Estado da transição: tempo que passou desde a troca de clima
  const transitionStart = useRef(Date.now());
  const lastWeather = useRef<WeatherType>("sunny");

  useFrame(() => {
    if(!meshRef.current) return;
    
    if(lastWeather.current !== weather) {
      lastWeather.current = weather;
      transitionStart.current = Date.now();
    }

    const elapsed = (Date.now() - transitionStart.current) / 1000; // segundos
    const progress = Math.min(elapsed / 18, 1); // 18 segundos para completar

    const dummy = new THREE.Object3D();
    for(let i=0; i<voxels.length; i++) {
      const v = voxels[i];
      // Sorteia se esse bloco já mudou baseado no progresso
      const blockSeed = hash(v.pos[0], v.pos[1], v.pos[2]);
      
      let color: THREE.Color;
      if(blockSeed < progress) {
        color = getTargetColor(v.pos[0], v.pos[1], v.pos[2], weather);
      } else {
        // Mantém a cor original (precisamos do estado anterior, mas para simplicidade usamos "sunny")
        color = v.color;
      }
      
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
      meshRef.current.setColorAt(i, v.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [voxels]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
      <meshStandardMaterial roughness={0.9} flatShading />
    </instancedMesh>
  );
}

/* ═══════ ATMOSFERA E LUZ ═══════ */
function Atmosphere() {
  const { hour, weather } = useGameState();
  const { scene } = useThree();
  useFrame((_,delta) => {
    let bg = "#070e2b";
    if(weather==="storm") bg="#0a0a0f";
    else if(weather==="fog") bg="#1e293b";
    else if(hour<6 || hour>20) bg="#020408";
    (scene.background as THREE.Color).lerp(new THREE.Color(bg), delta*2);
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
    ref.current.intensity = Math.max(0, Math.sin(a))*1.5 + 0.2;
  });
  return <directionalLight ref={ref} color="#fff4d6" />;
}

export default function VoxelPlanet() {
  const { weatherPanelOpen, diaryOpen } = useGameState();
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 20, 120], fov: 45 }} dpr={[1, 1.5]}>
        <Atmosphere />
        <ambientLight intensity={0.4} />
        <Sun />
        <PlanetBody />
        <Stars radius={300} count={5000} factor={7} fade speed={1} />
        <OrbitControls enabled={!weatherPanelOpen && !diaryOpen} enablePan={false} minDistance={60} maxDistance={200} />
      </Canvas>
    </div>
  );
}
