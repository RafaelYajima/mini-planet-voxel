"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
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
  stone3: new THREE.Color("#374151"), stoneDeep: new THREE.Color("#1f2937"),
  snow1: new THREE.Color("#e0f2fe"), snow2: new THREE.Color("#f8fafc"),
  mud: new THREE.Color("#5c2d0a"),
  trunk: new THREE.Color("#5b3418"), trunkDark: new THREE.Color("#3e200c"),
  bark: new THREE.Color("#4a2c12"),
  leaf1: new THREE.Color("#15803d"), leaf2: new THREE.Color("#166534"),
  leaf3: new THREE.Color("#14532d"), leafBright: new THREE.Color("#22c55e"),
};

/* ═══════ DIREÇÕES FIXAS ═══════ */
function norm(v: [number,number,number]): [number,number,number] {
  const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d,v[1]/d,v[2]/d];
}
function dot3(a: [number,number,number], b: [number,number,number]) {
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}

const PEAK_1 = norm([0.82, 0.38, -0.41]);
const PEAK_2 = norm([-0.64, 0.55, 0.46]);
const PEAK_3 = norm([0.16, 0.78, 0.60]);
const HOLE_DIR = norm([-0.78, 0.08, -0.62]);
const TREE_DIR = norm([0.48, 0.12, 0.86]);

/* ═══════ RUÍDO ═══════ */
function hash(x: number, y: number, z: number): number {
  let h=(x*374761393+y*668265263+z*1274126177)|0;
  h=((h^(h>>13))*1103515245)|0;
  return ((h^(h>>16))&0x7fffffff)/0x7fffffff;
}

function noise3d(x: number, y: number, z: number): number {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const fx=x-ix,fy=y-iy,fz=z-iz;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),sz=fz*fz*(3-2*fz);
  const a=hash(ix,iy,iz),b=hash(ix+1,iy,iz);
  const c=hash(ix,iy+1,iz),d=hash(ix+1,iy+1,iz);
  const e=hash(ix,iy,iz+1),f=hash(ix+1,iy,iz+1);
  const g=hash(ix,iy+1,iz+1),h2=hash(ix+1,iy+1,iz+1);
  const x0=a+(b-a)*sx,x1=e+(f-e)*sx;
  const x2=c+(d-c)*sx,x3=g+(h2-g)*sx;
  return (x0+(x2-x0)*sy)+((x1+(x3-x1)*sy)-(x0+(x2-x0)*sy))*sz;
}

function fbm(x: number,y: number,z: number): number {
  return noise3d(x,y,z)*0.55+noise3d(x*2,y*2,z*2)*0.28+noise3d(x*4,y*4,z*4)*0.12+noise3d(x*8,y*8,z*8)*0.05;
}

function infl(dir: [number,number,number], target: [number,number,number], thr: number): number {
  const d=dot3(dir,target); if(d<=thr) return 0; const t=(d-thr)/(1-thr); return t*t;
}

/* ═══════ ALTURA DO TERRENO ═══════ */
function terrainHeight(nx: number, ny: number, nz: number): number {
  const dir: [number,number,number] = [nx,ny,nz];
  const base = (fbm(nx*1.6,ny*1.6,nz*1.6)-0.5)*5 + (fbm(nx*4+10,ny*4,nz*4)-0.5)*2;
  const peaks = infl(dir,PEAK_1,0.95)*20 + infl(dir,PEAK_2,0.95)*16 + infl(dir,PEAK_3,0.955)*22;
  const holeFactor = infl(dir,HOLE_DIR,0.90);
  const holeDeep = infl(dir,HOLE_DIR,0.94);
  const bigHole = -holeDeep*20 + (holeFactor-holeDeep)*6;
  return base + peaks + bigHole;
}

/* ═══════ COR ═══════ */
function terrainColor(h: number, n: number, w: WeatherType): THREE.Color {
  if(w==="snow"||w==="storm") { if(h>-1) return n>0.45?C.snow1:C.snow2; }
  if(h>12) return n>0.45?C.snow1:C.snow2;
  if(h>7) return n>0.55?C.stone1:C.stone2;
  if(h>4.5) return n>0.6?C.stone1:C.grass4;
  if(h<-10) return n>0.5?C.stoneDeep:C.stone3;
  if(h<-4) return n>0.5?C.stone2:C.stone3;
  if(h<-1.5) return n>0.5?C.dirt1:C.stone2;
  if(w==="rain"&&h<1.5) return n>0.5?C.mud:C.dirt1;
  if(n>0.87) return C.dirt2;
  if(n>0.62) return C.grass1;
  if(n>0.35) return C.grass2;
  if(n>0.15) return C.grass3;
  return C.grass4;
}

type VD = { pos: [number,number,number]; color: THREE.Color };

function addV(x:number,y:number,z:number,c:THREE.Color,d:VD[],o:Set<string>) {
  const k=`${x},${y},${z}`; if(o.has(k))return; o.add(k); d.push({pos:[x,y,z],color:c});
}

/* ═══════ ÁRVORE COLOSSAL ═══════ */
function addColossalTree(data: VD[], occ: Set<string>) {
  const [nx,ny,nz] = TREE_DIR;
  const h = terrainHeight(nx,ny,nz);
  const bx=nx*(R+h), by=ny*(R+h), bz=nz*(R+h);

  // Tronco: 30 blocos alto, raio base 4, afina para 2 no topo
  const trunkH = 30;
  for (let t=0; t<=trunkH; t++) {
    const cx=bx+nx*t, cy=by+ny*t, cz=bz+nz*t;
    const progress = t/trunkH;
    const trunkR = Math.round(4 - progress*2); // 4 -> 2
    for(let dx=-trunkR;dx<=trunkR;dx++)
    for(let dy=-trunkR;dy<=trunkR;dy++)
    for(let dz=-trunkR;dz<=trunkR;dz++) {
      if(dx*dx+dy*dy+dz*dz<=trunkR*trunkR) {
        const n=hash(dx+t*7,dy+t*3,dz+t*11);
        addV(Math.round(cx+dx),Math.round(cy+dy),Math.round(cz+dz),
          n>0.7?C.bark:n>0.3?C.trunk:C.trunkDark,data,occ);
      }
    }
  }

  // Raízes massivas (6 raízes que se espalham)
  for(let r=0;r<6;r++) {
    const angle = (r/6)*Math.PI*2;
    for(let seg=0;seg<12;seg++) {
      const spread = seg*2;
      const dropOff = seg*0.6;
      const rx=Math.round(bx+Math.cos(angle)*spread-nx*dropOff);
      const ry=Math.round(by+Math.sin(angle)*spread*0.3-ny*dropOff);
      const rz=Math.round(bz+Math.sin(angle)*spread-nz*dropOff);
      // Raiz grossa
      for(let dx=-1;dx<=1;dx++)
      for(let dz=-1;dz<=1;dz++) {
        addV(rx+dx,ry,rz+dz,C.trunkDark,data,occ);
        if(seg<6) addV(rx+dx,ry+1,rz+dz,C.trunk,data,occ);
      }
    }
  }

  // Galhos grossos saindo do meio do tronco (4 galhos)
  for(let br=0;br<4;br++) {
    const angle=(br/4)*Math.PI*2+0.3;
    const brStart = 16+br*2;
    const bcx=bx+nx*brStart, bcy=by+ny*brStart, bcz=bz+nz*brStart;
    for(let seg=0;seg<10;seg++) {
      const gx=Math.round(bcx+Math.cos(angle)*seg*1.5+nx*seg*0.5);
      const gy=Math.round(bcy+Math.sin(angle)*seg*0.8+ny*seg*0.5);
      const gz=Math.round(bcz+Math.sin(angle)*seg*1.5+nz*seg*0.5);
      addV(gx,gy,gz,C.trunk,data,occ);
      addV(gx+1,gy,gz,C.trunk,data,occ);
      addV(gx,gy,gz+1,C.trunk,data,occ);
    }
  }

  // Copa colossal — cluster de 7 esferas formando uma copa enorme
  const topX=bx+nx*(trunkH+5), topY=by+ny*(trunkH+5), topZ=bz+nz*(trunkH+5);
  const crowns: {cx:number;cy:number;cz:number;r:number}[] = [
    {cx:topX, cy:topY, cz:topZ, r:12},
    {cx:topX+nx*8, cy:topY+ny*8, cz:topZ+nz*8, r:8},
    {cx:topX-nx*3+8, cy:topY-ny*3+4, cz:topZ-nz*3+6, r:9},
    {cx:topX+6, cy:topY+3, cz:topZ-8, r:8},
    {cx:topX-7, cy:topY+4, cz:topZ+7, r:8},
    {cx:topX-5, cy:topY-3, cz:topZ-5, r:7},
    {cx:topX+8, cy:topY-2, cz:topZ+5, r:7},
  ];

  for(const crown of crowns) {
    const cr=crown.r;
    for(let dx=-cr;dx<=cr;dx++)
    for(let dy=-cr;dy<=cr;dy++)
    for(let dz=-cr;dz<=cr;dz++) {
      const dd=dx*dx+dy*dy+dz*dz;
      if(dd<=cr*cr && hash(dx+cr*7,dy+cr*3,dz+cr*11)>0.12) {
        const ln=hash(dx*3+1,dy*3+2,dz*3+3);
        addV(Math.round(crown.cx+dx),Math.round(crown.cy+dy),Math.round(crown.cz+dz),
          ln>0.65?C.leafBright:ln>0.45?C.leaf1:ln>0.25?C.leaf2:C.leaf3,
          data,occ);
      }
    }
  }
}

/* ═══════ GERAÇÃO ═══════ */
function generatePlanet(weather: WeatherType): VD[] {
  const data: VD[]=[];
  const occ=new Set<string>();

  // Para cada voxel candidato, verificamos se ele está DENTRO da esfera de terreno.
  // Um voxel é sólido se: dist <= R + terrainHeight(dir)
  // Um voxel é VISÍVEL se: pelo menos 1 vizinho está vazio (fora da esfera)
  // Isso garante ZERO buracos.

  // Primeiro: marcar todos os pontos sólidos
  const solidSet = new Set<string>();
  const maxR = R + 25;
  const minR = R - 5;

  for(let x=-maxR;x<=maxR;x++)
  for(let y=-maxR;y<=maxR;y++)
  for(let z=-maxR;z<=maxR;z++) {
    const distSq=x*x+y*y+z*z;
    if(distSq<minR*minR||distSq>maxR*maxR) continue;
    const dist=Math.sqrt(distSq);
    const nx=x/dist,ny=y/dist,nz=z/dist;
    const h=terrainHeight(nx,ny,nz);
    const surfDist=R+h;
    // Sólido = está abaixo ou na superfície
    if(dist<=surfDist) {
      solidSet.add(`${x},${y},${z}`);
    }
  }

  // Segundo: apenas voxels sólidos que têm pelo menos 1 vizinho NÃO-sólido
  // (visíveis) — os internos são descartados para performance
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

  for(const key of solidSet) {
    const [xs,ys,zs]=key.split(",").map(Number);
    let exposed=false;
    for(const [dx,dy,dz] of dirs) {
      if(!solidSet.has(`${xs+dx},${ys+dy},${zs+dz}`)) {
        exposed=true; break;
      }
    }
    if(!exposed) continue;

    const dist=Math.sqrt(xs*xs+ys*ys+zs*zs);
    const nx=xs/dist,ny=ys/dist,nz=zs/dist;
    const h=terrainHeight(nx,ny,nz);
    const surfDist=R+h;
    const depth=surfDist-dist;
    const n=hash(xs,ys,zs);

    // Blocos da superfície usam cor do terreno, internos usam pedra
    const color = depth < 1.5 ? terrainColor(h,n,weather) : (n>0.5?C.stone2:C.stone3);
    addV(xs,ys,zs,color,data,occ);
  }

  // Árvores normais
  let trees=0;
  for(let i=0;i<data.length;i+=45) {
    if(trees>=80)break;
    const v=data[i]; const c=v.color;
    if(c!==C.grass1&&c!==C.grass2&&c!==C.grass3&&c!==C.grass4) continue;
    const [px,py,pz]=v.pos;
    const n=hash(px+7,py+3,pz+11);
    if(n<0.88) continue;
    const dist=Math.sqrt(px*px+py*py+pz*pz);
    const ux=px/dist,uy=py/dist,uz=pz/dist;
    const tH=3+Math.floor(n*3);
    for(let t=1;t<=tH;t++) addV(Math.round(px+ux*t),Math.round(py+uy*t),Math.round(pz+uz*t),C.trunk,data,occ);
    const cx=px+ux*(tH+1.5),cy=py+uy*(tH+1.5),cz=pz+uz*(tH+1.5);
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++) {
      if(dx*dx+dy*dy+dz*dz<=5&&hash(dx+px,dy+py,dz+pz)>0.2) {
        const ln=hash(dx*3+px,dy*3+py,dz*3+pz);
        addV(Math.round(cx+dx),Math.round(cy+dy),Math.round(cz+dz),ln>0.6?C.leaf1:ln>0.35?C.leaf2:C.leaf3,data,occ);
      }
    }
    trees++;
  }

  addColossalTree(data,occ);
  return data;
}

/* ═══════ INSTANCED MESH ═══════ */
function VoxelInstances({voxels}:{voxels:VD[]}) {
  const ref=useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(()=>{
    const d=new THREE.Object3D();
    for(let i=0;i<voxels.length;i++){
      d.position.set(voxels[i].pos[0],voxels[i].pos[1],voxels[i].pos[2]);
      d.updateMatrix(); ref.current.setMatrixAt(i,d.matrix); ref.current.setColorAt(i,voxels[i].color);
    }
    ref.current.instanceMatrix.needsUpdate=true;
    if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;
  },[voxels]);

  return (
    <instancedMesh ref={ref} args={[undefined,undefined,voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1,1,1]}/>
      <meshStandardMaterial roughness={0.9} metalness={0} flatShading/>
    </instancedMesh>
  );
}

/* ═══════ ATMOSFERA — ATUALIZAÇÃO DIRETA ═══════ */
function Atmosphere() {
  const {hour,weather}=useGameState();
  const {scene}=useThree();

  // Atualiza A CADA FRAME para garantir reatividade ao slider
  useFrame(()=>{
    let bg:string;
    if(weather==="storm") bg="#0a0a0f";
    else if(weather==="fog") bg="#1e293b";
    else if(hour<5) bg="#020408";
    else if(hour<7) bg="#1a0e3a";
    else if(hour<8) bg="#1e1b4b";
    else if(hour<11) bg="#0c1445";
    else if(hour<16) bg="#070e2b";
    else if(hour<18) bg="#1a1040";
    else if(hour<20) bg="#12082a";
    else bg="#020408";

    (scene.background as THREE.Color).set(bg);

    if(weather==="fog") { if(!scene.fog) scene.fog=new THREE.Fog("#334155",R*0.8,R*3); }
    else if(weather==="storm") { if(!scene.fog||!(scene.fog as THREE.Fog).color.equals(new THREE.Color("#0f172a"))) scene.fog=new THREE.Fog("#0f172a",R,R*3.5); }
    else { scene.fog=null; }
  });

  return <color attach="background" args={["#070e2b"]}/>; // valor inicial
}

/* ═══════ SOL ═══════ */
function SunLight() {
  const {hour,weather}=useGameState();
  const ref=useRef<THREE.DirectionalLight>(null!);
  const ambRef=useRef<THREE.AmbientLight>(null!);

  useFrame(()=>{
    if(!ref.current) return;
    const angle=((hour-6)/24)*Math.PI*2;
    const d=R*4;
    ref.current.position.set(Math.cos(angle)*d,Math.sin(angle)*d,Math.sin(angle)*d*0.4);
    const day=Math.max(0,Math.sin(angle));
    const dim=weather==="storm"?0.25:weather==="fog"?0.5:1;
    ref.current.intensity=(0.15+day*1.5)*dim;
    ref.current.color.set(day>0.3?"#fef3c7":"#c4b5fd");
    if(ambRef.current) ambRef.current.intensity=(0.15+day*0.4)*dim;
  });

  return (
    <>
      <directionalLight ref={ref} color="#fef3c7"/>
      <ambientLight ref={ambRef} intensity={0.3}/>
    </>
  );
}

/* ═══════ PLANETA ═══════ */
function PlanetGroup({weather}:{weather:WeatherType}) {
  const ref=useRef<THREE.Group>(null!);
  const voxels=useMemo(()=>generatePlanet(weather),[weather]);
  useFrame((_,delta)=>{ ref.current.rotation.y+=delta*(weather==="storm"?0.12:0.035); });
  return <group ref={ref}><VoxelInstances voxels={voxels}/></group>;
}

/* ═══════ CANVAS ═══════ */
export default function VoxelPlanet() {
  const {weather,weatherPanelOpen,diaryOpen}=useGameState();
  const orbitEnabled=!weatherPanelOpen&&!diaryOpen;

  return (
    <div className="absolute inset-0">
      <Canvas camera={{position:[0,15,R*2.8],fov:45}} dpr={[1,1.5]}>
        <Atmosphere/>
        <hemisphereLight args={["#bfdbfe","#1e293b",0.25]}/>
        <SunLight/>
        <PlanetGroup weather={weather}/>
        <Stars radius={R*6} depth={R*2} count={5000} factor={6} fade speed={0.3}/>
        <OrbitControls enabled={orbitEnabled} enablePan={false} minDistance={R*1.3} maxDistance={R*4.5} enableDamping dampingFactor={0.05}/>
      </Canvas>
    </div>
  );
}
