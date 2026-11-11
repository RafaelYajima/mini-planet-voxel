"use client";

import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
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
  stone3: new THREE.Color("#374151"), stoneDeep: new THREE.Color("#1a202c"),
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
  // Montanhas e picos
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

/* ═══════ COR E VISIBILIDADE ═══════ */
type Voxel = { pos:[number,number,number]; colorSunny:THREE.Color; colorWeather:THREE.Color; cluster:number };

function generatePlanet(): Voxel[] {
  console.log("Gerando Planeta Orgânico e Sólido...");
  const data: Voxel[]=[];
  const occ=new Set<string>();
  
  // Mapear apenas a casca sólida para performance (evita 2 milhões de iterações)
  const maxR = R + 18, minR = R - 18;
  const solidMap = new Set<string>();

  for(let x=-maxR; x<=maxR; x++)
  for(let y=-maxR; y<=maxR; y++)
  for(let z=-maxR; z<=maxR; z++) {
    const dSq = x*x+y*y+z*z;
    if(dSq < minR*minR || dSq > maxR*maxR) continue;
    
    const dist = Math.sqrt(dSq);
    const nx=x/dist, ny=y/dist, nz=z/dist;
    const h = terrainHeight(nx,ny,nz);
    const surfDist = R + h;
    
    // Casca sólida de 3 blocos de profundidade garante ZERO furos
    if(dist <= surfDist + 0.3 && dist > surfDist - 3) {
      solidMap.add(`${x},${y},${z}`);
    }
  }

  // Caverna Cilíndrica (Subtrai da rocha sólida)
  const startD = R - 6, endD = R - 20;
  const sx = CAVE_DIR[0]*startD, sy = CAVE_DIR[1]*startD, sz = CAVE_DIR[2]*startD;
  const ex = CAVE_DIR[0]*endD, ey = CAVE_DIR[1]*endD, ez = CAVE_DIR[2]*endD;
  const lx=ex-sx, ly=ey-sy, lz=ez-sz;
  const lenSq=lx*lx+ly*ly+lz*lz;
  
  for(let x=-maxR; x<=maxR; x++)
  for(let y=-maxR; y<=maxR; y++)
  for(let z=-maxR; z<=maxR; z++) {
    const dx=x-sx, dy=y-sy, dz=z-sz;
    const t=Math.max(0,Math.min(1,(dx*lx+dy*ly+dz*lz)/lenSq));
    const px=sx+t*lx, py=sy+t*ly, pz=sz+t*lz;
    if((x-px)**2+(y-py)**2+(z-pz)**2 < 18) {
      solidMap.delete(`${x},${y},${z}`);
    }
  }

  // Define cores com base no clima
  const getColor = (x:number, y:number, z:number, w:WeatherType): THREE.Color => {
    const dist=Math.sqrt(x*x+y*y+z*z);
    const nx=x/dist, ny=y/dist, nz=z/dist;
    const h = terrainHeight(nx,ny,nz);
    const n = hash(x,y,z);

    // Se for interior da casca (mais de 1 bloco de profundidade), é rocha
    if(dist < R + h - 1.2) return n>0.5 ? C.stoneDeep : C.stone3;

    if(w==="snow"||w==="storm") { if(h>-2) return n>0.4?C.snow1:C.snow2; }
    
    const dL=dot3([nx,ny,nz],LAKE_DIR);
    if(dL>0.93 && dist<R-2) return C.water;

    if(h>12) return n>0.5?C.snow1:C.snow2;
    if(h>6) return n>0.5?C.stone1:C.stone2;
    if(h<-12) return C.craterFloor;
    
    if(w==="rain" && h<1) {
      const pNoise=hash(Math.round(x*0.2),0,Math.round(z*0.2));
      if(pNoise>0.8) return C.water;
      if(pNoise>0.6) return C.mud;
    }

    if(n>0.8) return C.dirt1;
    return n>0.6?C.grass1:n>0.3?C.grass2:C.grass3;
  };

  // Transfere apenas os blocos que sobraram na casca
  for(const key of solidMap) {
    const [x,y,z]=key.split(",").map(Number);
    const cluster = noise3d(x*0.15, y*0.15, z*0.15);
    data.push({
      pos: [x,y,z],
      colorSunny: getColor(x,y,z,"sunny"),
      colorWeather: getColor(x,y,z,"snow"), // Placeholder para transição
      cluster
    });
    occ.add(key);
  }

  // Árvores Pequenas Espalhadas
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
      if(!occ.has(`${tx},${ty},${tz}`)) {
        data.push({ pos:[tx,ty,tz], colorSunny:C.trunk, colorWeather:C.trunk, cluster:-1 });
        occ.add(`${tx},${ty},${tz}`);
      }
    }
    const cx=px+ux*(h+1), cy=py+uy*(h+1), cz=pz+uz*(h+1);
    for(let dx=-2; dx<=2; dx++) for(let dy=-2; dy<=2; dy++) for(let dz=-2; dz<=2; dz++) {
      if(dx*dx+dy*dy+dz*dz < 5) {
        const tx=Math.round(cx+dx), ty=Math.round(cy+dy), tz=Math.round(cz+dz);
        if(!occ.has(`${tx},${ty},${tz}`)) {
          data.push({ pos:[tx,ty,tz], colorSunny:C.leaf2, colorWeather:C.leaf2, cluster:-1 });
          occ.add(`${tx},${ty},${tz}`);
        }
      }
    }
    smallTrees++;
  }

  // Árvore Monumental Sólida
  const [tx,ty,tz]=TREE_DIR;
  const hT=terrainHeight(tx,ty,tz);
  const bx=tx*(R+hT), by=ty*(R+hT), bz=tz*(R+hT);
  const trunkH = 40;
  
  for(let i=0; i<=trunkH; i++) {
    const cx=bx+tx*i, cy=by+ty*i, cz=bz+tz*i;
    const radius = Math.max(1, Math.round(5 * (1 - i/trunkH))); 
    for(let dx=-radius; dx<=radius; dx++) 
    for(let dy=-radius; dy<=radius; dy++) 
    for(let dz=-radius; dz<=radius; dz++) {
      if(dx*dx+dy*dy+dz*dz <= radius*radius) {
        const px=Math.round(cx+dx), py=Math.round(cy+dy), pz=Math.round(cz+dz);
        if(!occ.has(`${px},${py},${pz}`)) {
          const col = hash(dx+i,dy+i,dz+i)>0.6?C.bark:C.trunk;
          data.push({ pos:[px,py,pz], colorSunny:col, colorWeather:col, cluster:-1 });
          occ.add(`${px},${py},${pz}`);
        }
      }
    }

    if(i > 15 && i % 8 === 0) {
      const ang = i * 2.1;
      const bLen = 20 - (i/3); 
      let tipX=cx, tipY=cy, tipZ=cz;
      
      for(let j=0; j<bLen; j++) {
        tipX=Math.round(cx+Math.cos(ang)*j*1.5+tx*j*0.5);
        tipY=Math.round(cy+j*0.4+ty*j*0.5);
        tipZ=Math.round(cz+Math.sin(ang)*j*1.5+tz*j*0.5);
        
        const brR = j < bLen*0.3 ? 2 : j < bLen*0.7 ? 1 : 0;
        for(let lx=-brR; lx<=brR; lx++) 
        for(let ly=-brR; ly<=brR; ly++) 
        for(let lz=-brR; lz<=brR; lz++) {
          if(lx*lx+ly*ly+lz*lz <= brR*brR) {
            const px=tipX+lx, py=tipY+ly, pz=tipZ+lz;
            if(!occ.has(`${px},${py},${pz}`)) {
              data.push({ pos:[px,py,pz], colorSunny:C.trunk, colorWeather:C.trunk, cluster:-1 });
              occ.add(`${px},${py},${pz}`);
            }
          }
        }
      }
      
      // Copa maciça na ponta do galho
      for(let lx=-6; lx<=6; lx++) 
      for(let ly=-6; ly<=6; ly++) 
      for(let lz=-6; lz<=6; lz++) {
        if(lx*lx+ly*ly+lz*lz < 32 && hash(lx+tipX,ly+tipY,lz+tipZ)>0.2) {
           const px=tipX+lx, py=tipY+ly, pz=tipZ+lz;
           if(!occ.has(`${px},${py},${pz}`)) {
             const col = hash(lx,ly,lz)>0.5?C.leaf1:C.leaf2;
             data.push({ pos:[px,py,pz], colorSunny:col, colorWeather:col, cluster:-1 });
             occ.add(`${px},${py},${pz}`);
           }
        }
      }
    }
  }
  
  // Copa do Topo Central (Maciça)
  const topX=bx+tx*(trunkH+4), topY=by+ty*(trunkH+4), topZ=bz+tz*(trunkH+4);
  for(let lx=-10; lx<=10; lx++) 
  for(let ly=-10; ly<=10; ly++) 
  for(let lz=-10; lz<=10; lz++) {
    if(lx*lx+ly*ly+lz*lz < 90 && hash(lx+99,ly+33,lz+77)>0.15) {
       const px=Math.round(topX+lx), py=Math.round(topY+ly), pz=Math.round(topZ+lz);
       if(!occ.has(`${px},${py},${pz}`)) {
         const col = hash(lx,ly,lz)>0.5?C.leafBright:C.leaf1;
         data.push({ pos:[px,py,pz], colorSunny:col, colorWeather:col, cluster:-1 });
         occ.add(`${px},${py},${pz}`);
       }
    }
  }

  return data;
}

/* ═══════ COMPONENTE PLANETA ═══════ */
function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  
  // Memoize com dependência vazia -> gera uma vez
  const voxels = useMemo(() => generatePlanet(), []);
  
  const lastWeather = useRef<WeatherType>("sunny");
  const transitionStart = useRef(Date.now());

  useLayoutEffect(() => {
    if (!meshRef.current) return;
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

  // Transição Gradual
  useFrame(() => {
    if(!meshRef.current) return;

    if (lastWeather.current !== weather) {
      lastWeather.current = weather;
      transitionStart.current = Date.now();
      // Atualiza target color
      for (let i = 0; i < voxels.length; i++) {
        const v = voxels[i];
        if (v.cluster !== -1) {
          // Simplificado: Neve/Chuva afeta tudo
          if (weather === "snow" || weather === "storm") v.colorWeather = C.snow1;
          else if (weather === "rain" && v.pos[1] < -10) v.colorWeather = C.mud;
          else v.colorWeather = v.colorSunny;
        }
      }
    }

    const elapsed = (Date.now() - transitionStart.current) / 1000;
    const progress = Math.min(elapsed / 8, 1); // 8 segundos transição

    let needsUpdate = false;
    for(let i=0; i<voxels.length; i++) {
      const v = voxels[i];
      if(v.cluster === -1) continue; 
      
      const normalizedCluster = (v.cluster + 1) / 2;
      const targetColor = normalizedCluster < progress ? v.colorWeather : v.colorSunny;
      
      meshRef.current.setColorAt(i, targetColor);
      needsUpdate = true;
    }
    
    if(needsUpdate) meshRef.current.instanceColor!.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
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

  useLayoutEffect(() => {
    scene.background = new THREE.Color("#070e2b");
  }, [scene]);

  useFrame((_,delta) => {
    if (!scene.background) scene.background = new THREE.Color("#070e2b");
    let bg = "#070e2b";
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
        <OrbitControls enabled={!weatherPanelOpen && !diaryOpen} enablePan={false} minDistance={80} maxDistance={280} />
      </Canvas>
    </div>
  );
}
