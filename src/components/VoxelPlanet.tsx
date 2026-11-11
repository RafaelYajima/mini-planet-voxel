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
  stone3: new THREE.Color("#374151"), stoneDeep: new THREE.Color("#2d3748"),
  craterFloor: new THREE.Color("#475569"),
  snow1: new THREE.Color("#e0f2fe"), snow2: new THREE.Color("#f8fafc"),
  mud: new THREE.Color("#5c2d0a"), water: new THREE.Color("#0ea5e9"),
  trunk: new THREE.Color("#5b3418"), trunkDark: new THREE.Color("#3e200c"),
  bark: new THREE.Color("#4a2c12"),
  leaf1: new THREE.Color("#15803d"), leaf2: new THREE.Color("#166534"),
  leaf3: new THREE.Color("#14532d"), leafBright: new THREE.Color("#22c55e"),
};

/* ═══════ MATH ═══════ */
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
function fbm(x:number,y:number,z:number): number {
  return noise3d(x,y,z)*0.5+noise3d(x*2.1,y*2.1,z*2.1)*0.25+noise3d(x*4.3,y*4.3,z*4.3)*0.15;
}

/* ═══════ LANDMARKS ═══════ */
const HOLE_DIR = norm([-0.78, 0.08, -0.62]);
const TREE_DIR = norm([0.48, 0.12, 0.86]);
const CAVE_DIR = norm([-0.72, -0.10, -0.68]);

/* ═══════ TERRENO ═══════ */
function terrainHeight(nx:number, ny:number, nz:number): number {
  const dir:[number,number,number]=[nx,ny,nz];
  const base=(fbm(nx*1.8,ny*1.8,nz*1.8)-0.5)*6;
  // Cratera
  const dH=dot3(dir,HOLE_DIR);
  let crater=0;
  if(dH>0.96) crater=-16;
  else if(dH>0.88) { const t=(dH-0.88)/(0.96-0.88); crater=-16*(t*t*(3-2*t)); }
  // Borda
  let rim=0;
  if(dH>0.82&&dH<0.90) { const t=1-Math.min(1,Math.abs(dH-0.86)/0.04); rim=t*5; }
  return base+crater+rim;
}

function isCave(x:number,y:number,z:number): boolean {
  // Túnel cilíndrico que entra na parede da cratera
  const startDist=R-8, endDist=R-22;
  const sx=CAVE_DIR[0]*startDist, sy=CAVE_DIR[1]*startDist, sz=CAVE_DIR[2]*startDist;
  const ex=CAVE_DIR[0]*endDist, ey=CAVE_DIR[1]*endDist, ez=CAVE_DIR[2]*endDist;
  const dx=x-sx,dy=y-sy,dz=z-sz;
  const lx=ex-sx,ly=ey-sy,lz=ez-sz;
  const lenSq=lx*lx+ly*ly+lz*lz;
  const t=Math.max(0,Math.min(1,(dx*lx+dy*ly+dz*lz)/lenSq));
  const px=sx+t*lx,py=sy+t*ly,pz=sz+t*lz;
  return Math.sqrt((x-px)**2+(y-py)**2+(z-pz)**2) < 4;
}

/* ═══════ COR POR CLIMA ═══════ */
function colorForWeather(x:number,y:number,z:number,h:number,n:number,w:WeatherType): THREE.Color {
  const pN=hash(Math.round(x*0.3),Math.round(y*0.3),Math.round(z*0.3));

  if(w==="snow"||w==="storm") { if(h>-10) return n>0.4?C.snow1:C.snow2; }

  if((w==="rain"||w==="storm")&&h<2&&h>-5) {
    if(pN>0.85) return C.water; // poça
    if(pN>0.7) return C.mud;    // lama ao redor
  }

  if(h>12) return n>0.4?C.snow1:C.snow2;
  if(h>7) return n>0.5?C.stone1:C.stone2;
  if(h<=-14) return n>0.5?C.craterFloor:C.stone2;
  if(h<-6) return n>0.5?C.stoneDeep:C.stone3;
  if(h<-2) return n>0.5?C.stone2:C.dirt1;

  if(n>0.85) return C.dirt2;
  if(n>0.6) return C.grass1;
  if(n>0.35) return C.grass2;
  if(n>0.15) return C.grass3;
  return C.grass4;
}

/* ═══════ TIPOS ═══════ */
type VD = { pos:[number,number,number]; h:number; n:number; isInternal:boolean };

/* ═══════ GERAÇÃO (uma vez só) ═══════ */
function generatePlanet(): VD[] {
  const data: VD[]=[];
  const solidSet=new Set<string>();
  const maxR=R+10, minR=R-20;

  // Passo 1: sólidos
  for(let x=-maxR;x<=maxR;x++)
  for(let y=-maxR;y<=maxR;y++)
  for(let z=-maxR;z<=maxR;z++) {
    const dSq=x*x+y*y+z*z;
    if(dSq<minR*minR||dSq>maxR*maxR) continue;
    if(isCave(x,y,z)) continue;
    const dist=Math.sqrt(dSq);
    const nx=x/dist,ny=y/dist,nz=z/dist;
    if(dist<=R+terrainHeight(nx,ny,nz)) solidSet.add(`${x},${y},${z}`);
  }

  // Passo 2: expostos
  const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(const k of solidSet) {
    const [x,y,z]=k.split(",").map(Number);
    let exp=false;
    for(const [dx,dy,dz] of dirs) if(!solidSet.has(`${x+dx},${y+dy},${z+dz}`)){exp=true;break;}
    if(!exp) continue;
    const dist=Math.sqrt(x*x+y*y+z*z);
    const nx=x/dist,ny=y/dist,nz=z/dist;
    const h=terrainHeight(nx,ny,nz);
    const depth=R+h-dist;
    data.push({pos:[x,y,z],h,n:hash(x,y,z),isInternal:depth>1.2});
  }

  // Passo 3: árvore colossal
  const [tx,ty,tz]=TREE_DIR;
  const th=terrainHeight(tx,ty,tz);
  const bx=tx*(R+th),by=ty*(R+th),bz=tz*(R+th);
  const tH=34;
  const occ=new Set<string>();

  // Tronco
  for(let i=0;i<=tH;i++) {
    const cx=bx+tx*i,cy=by+ty*i,cz=bz+tz*i;
    const r=Math.max(2,Math.round(5-i*3/tH));
    for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)for(let dz=-r;dz<=r;dz++) {
      if(dx*dx+dy*dy+dz*dz<=r*r+1) {
        const px=Math.round(cx+dx),py=Math.round(cy+dy),pz=Math.round(cz+dz);
        const k=`${px},${py},${pz}`;
        if(!occ.has(k)){occ.add(k);data.push({pos:[px,py,pz],h:99,n:hash(px,py,pz),isInternal:false});}
      }
    }
  }

  // Galhos com copas nas pontas
  for(let br=0;br<6;br++) {
    const ang=(br/6)*Math.PI*2+br*0.4;
    const start=14+br*3;
    const scx=bx+tx*start,scy=by+ty*start,scz=bz+tz*start;
    let tipX=scx,tipY=scy,tipZ=scz;
    for(let j=0;j<16;j++) {
      const gx=Math.round(scx+Math.cos(ang)*j*1.8+tx*j*0.4);
      const gy=Math.round(scy+Math.sin(ang)*j*0.4+ty*j*0.7);
      const gz=Math.round(scz+Math.sin(ang)*j*1.8+tz*j*0.4);
      tipX=gx;tipY=gy;tipZ=gz;
      const br2=j<5?2:j<10?1:0;
      for(let dx=-br2;dx<=br2;dx++)for(let dy=-br2;dy<=br2;dy++)for(let dz=-br2;dz<=br2;dz++){
        if(dx*dx+dy*dy+dz*dz<=br2*br2+1){
          const k=`${gx+dx},${gy+dy},${gz+dz}`;
          if(!occ.has(k)){occ.add(k);data.push({pos:[gx+dx,gy+dy,gz+dz],h:98,n:0.5,isInternal:false});}
        }
      }
    }
    // Copa na ponta
    const cr=5+Math.floor(hash(br,0,0)*3);
    for(let dx=-cr;dx<=cr;dx++)for(let dy=-cr;dy<=cr;dy++)for(let dz=-cr;dz<=cr;dz++){
      if(dx*dx+dy*dy+dz*dz<=cr*cr&&hash(dx+br*7,dy,dz)>0.15){
        const k=`${Math.round(tipX+dx)},${Math.round(tipY+dy)},${Math.round(tipZ+dz)}`;
        if(!occ.has(k)){occ.add(k);data.push({pos:[Math.round(tipX+dx),Math.round(tipY+dy),Math.round(tipZ+dz)],h:100,n:hash(dx,dy,dz),isInternal:false});}
      }
    }
  }

  // Copa central do topo
  const topX=bx+tx*(tH+6),topY=by+ty*(tH+6),topZ=bz+tz*(tH+6);
  for(let dx=-10;dx<=10;dx++)for(let dy=-10;dy<=10;dy++)for(let dz=-10;dz<=10;dz++){
    if(dx*dx+dy*dy+dz*dz<=90&&hash(dx+99,dy+33,dz+77)>0.14){
      const k=`${Math.round(topX+dx)},${Math.round(topY+dy)},${Math.round(topZ+dz)}`;
      if(!occ.has(k)){occ.add(k);data.push({pos:[Math.round(topX+dx),Math.round(topY+dy),Math.round(topZ+dz)],h:100,n:hash(dx,dy,dz),isInternal:false});}
    }
  }

  return data;
}

/* ═══════ COR PARA UM VOXEL ═══════ */
function voxelColor(v: VD, weather: WeatherType): THREE.Color {
  // Árvore
  if(v.h>=98) {
    if(v.h===100) { const ln=v.n; return ln>0.6?C.leafBright:ln>0.4?C.leaf1:ln>0.2?C.leaf2:C.leaf3; }
    return v.n>0.7?C.bark:v.n>0.3?C.trunk:C.trunkDark;
  }
  if(v.isInternal) return v.n>0.5?C.stone2:C.stone3;
  return colorForWeather(v.pos[0],v.pos[1],v.pos[2],v.h,v.n,weather);
}

/* ═══════ COMPONENTE PLANETA ═══════ */
function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const voxels = useMemo(() => generatePlanet(), []);
  const lastWeather = useRef<WeatherType>("sunny");
  const transitionIndex = useRef(voxels.length); // começa "terminado"
  const shuffledOrder = useRef<number[]>([]);

  // Setup posições (uma vez)
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    for(let i=0;i<voxels.length;i++) {
      dummy.position.set(...voxels[i].pos);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, voxelColor(voxels[i], "sunny"));
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [voxels]);

  // Transição gradual: a cada frame pinta um lote de blocos
  useFrame(() => {
    if(!meshRef.current) return;

    // Detecta troca de clima
    if(lastWeather.current !== weather) {
      lastWeather.current = weather;
      // Cria ordem aleatória de índices
      const order = Array.from({length: voxels.length}, (_,i) => i);
      // Fisher-Yates shuffle
      for(let i=order.length-1;i>0;i--) {
        const j=Math.floor(hash(i,weather.length,0)*i);
        [order[i],order[j]]=[order[j],order[i]];
      }
      shuffledOrder.current = order;
      transitionIndex.current = 0;
    }

    // Pinta ~800 blocos por frame (~18s para 100k blocos a 60fps)
    if(transitionIndex.current < voxels.length) {
      const batchSize = Math.min(800, voxels.length - transitionIndex.current);
      for(let b=0; b<batchSize; b++) {
        const idx = shuffledOrder.current[transitionIndex.current + b];
        meshRef.current.setColorAt(idx, voxelColor(voxels[idx], weather));
      }
      transitionIndex.current += batchSize;
      meshRef.current.instanceColor!.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} flatShading />
    </instancedMesh>
  );
}

/* ═══════ ROTAÇÃO ═══════ */
function Rotator({children}:{children:React.ReactNode}) {
  const ref = useRef<THREE.Group>(null!);
  const {weather} = useGameState();
  useFrame((_,d)=>{ ref.current.rotation.y += d*(weather==="storm"?0.12:0.035); });
  return <group ref={ref}>{children}</group>;
}

/* ═══════ ATMOSFERA ═══════ */
function Atmosphere() {
  const {hour,weather}=useGameState();
  const {scene}=useThree();
  const target=useRef(new THREE.Color("#070e2b"));
  const fogTarget=useRef({near:R*8,far:R*12,color:new THREE.Color("#334155")});

  useFrame((_,delta)=>{
    let bg="#070e2b";
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

    target.current.set(bg);
    (scene.background as THREE.Color).lerp(target.current, delta*3);

    if(weather==="fog"){fogTarget.current={near:R*0.6,far:R*2.5,color:new THREE.Color("#334155")};}
    else if(weather==="storm"){fogTarget.current={near:R*0.8,far:R*3,color:new THREE.Color("#0f172a")};}
    else if(weather==="rain"){fogTarget.current={near:R*2,far:R*5,color:new THREE.Color("#1a2332")};}
    else if(weather==="snow"){fogTarget.current={near:R*1.5,far:R*4,color:new THREE.Color("#1e293b")};}
    else{fogTarget.current={near:R*10,far:R*15,color:new THREE.Color("#070e2b")};}

    if(!scene.fog) scene.fog=new THREE.Fog("#070e2b",R*10,R*15);
    const f=scene.fog as THREE.Fog;
    f.color.lerp(fogTarget.current.color, delta*2);
    f.near+=(fogTarget.current.near-f.near)*delta*2;
    f.far+=(fogTarget.current.far-f.far)*delta*2;
  });

  return <color attach="background" args={["#070e2b"]}/>;
}

/* ═══════ SOL ═══════ */
function Sun() {
  const {hour,weather}=useGameState();
  const ref=useRef<THREE.DirectionalLight>(null!);
  const ambRef=useRef<THREE.AmbientLight>(null!);
  useFrame(()=>{
    if(!ref.current) return;
    const a=((hour-6)/24)*Math.PI*2;
    ref.current.position.set(Math.cos(a)*R*4,Math.sin(a)*R*4,Math.sin(a)*R*2);
    const day=Math.max(0,Math.sin(a));
    const dim=weather==="storm"?0.25:weather==="fog"?0.5:1;
    ref.current.intensity=(0.15+day*1.5)*dim;
    ref.current.color.set(day>0.3?"#fef3c7":"#c4b5fd");
    if(ambRef.current) ambRef.current.intensity=(0.15+day*0.4)*dim;
  });
  return <><directionalLight ref={ref} color="#fef3c7"/><ambientLight ref={ambRef} intensity={0.3}/></>;
}

/* ═══════ PARTÍCULAS ═══════ */
function WeatherFX() {
  const {weather}=useGameState();
  const rainRef=useRef<THREE.Points>(null!);
  const snowRef=useRef<THREE.Points>(null!);
  const sp=R*3;

  const rainGeo=useMemo(()=>{
    const p=new Float32Array(2500*3);
    for(let i=0;i<2500;i++){p[i*3]=(Math.random()-0.5)*sp;p[i*3+1]=Math.random()*sp-sp/3;p[i*3+2]=(Math.random()-0.5)*sp;}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(p,3));return g;
  },[sp]);

  const snowGeo=useMemo(()=>{
    const p=new Float32Array(1200*3);
    for(let i=0;i<1200;i++){p[i*3]=(Math.random()-0.5)*sp;p[i*3+1]=Math.random()*sp-sp/3;p[i*3+2]=(Math.random()-0.5)*sp;}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(p,3));return g;
  },[sp]);

  useFrame((_,delta)=>{
    const isRain=weather==="rain"||weather==="storm";
    const isSnow=weather==="snow";

    if(rainRef.current){
      const m=rainRef.current.material as THREE.PointsMaterial;
      m.opacity+=(isRain?0.6:0-m.opacity)*delta*2;
      if(isRain){
        const pos=rainRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const speed=weather==="storm"?80:40;
        const wind=weather==="storm"?delta*15:delta*3;
        for(let i=0;i<pos.count;i++){
          pos.setY(i,pos.getY(i)-delta*speed);
          pos.setX(i,pos.getX(i)+wind);
          if(pos.getY(i)<-sp/2){pos.setY(i,sp/2);pos.setX(i,(Math.random()-0.5)*sp);}
        }
        pos.needsUpdate=true;
      }
    }
    if(snowRef.current){
      const m=snowRef.current.material as THREE.PointsMaterial;
      m.opacity+=(isSnow?0.7:0-m.opacity)*delta*2;
      if(isSnow){
        const pos=snowRef.current.geometry.attributes.position as THREE.BufferAttribute;
        for(let i=0;i<pos.count;i++){
          pos.setY(i,pos.getY(i)-delta*8);
          pos.setX(i,pos.getX(i)+Math.sin(pos.getY(i)*0.1+i)*delta*2);
          if(pos.getY(i)<-sp/2){pos.setY(i,sp/2);pos.setX(i,(Math.random()-0.5)*sp);}
        }
        pos.needsUpdate=true;
      }
    }
  });

  return <>
    <points ref={rainRef} geometry={rainGeo}><pointsMaterial color="#7dd3fc" size={0.35} transparent opacity={0} depthWrite={false}/></points>
    <points ref={snowRef} geometry={snowGeo}><pointsMaterial color="#e0f2fe" size={1.2} transparent opacity={0} depthWrite={false}/></points>
  </>;
}

/* ═══════ CANVAS ═══════ */
export default function VoxelPlanet() {
  const {weatherPanelOpen,diaryOpen}=useGameState();
  return (
    <div className="absolute inset-0">
      <Canvas camera={{position:[0,15,R*2.8],fov:45}} dpr={[1,1.5]}>
        <Atmosphere/>
        <Sun/>
        <Rotator><PlanetBody/></Rotator>
        <WeatherFX/>
        <Stars radius={R*6} depth={R*2} count={5000} factor={6} fade speed={0.3}/>
        <OrbitControls enabled={!weatherPanelOpen&&!diaryOpen} enablePan={false} minDistance={R*1.3} maxDistance={R*4.5} enableDamping dampingFactor={0.05}/>
      </Canvas>
    </div>
  );
}
