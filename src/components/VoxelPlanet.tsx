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

  // ═══════ GREAT DEKU TREE (Estilo Zelda) ═══════
  const [tx,ty,tz]=TREE_DIR;
  const hT=terrainHeight(tx,ty,tz);
  const bx=tx*(R+hT), by=ty*(R+hT), bz=tz*(R+hT);

  // Helper para adicionar bloco de árvore sem duplicata
  const addTree = (px:number, py:number, pz:number, col:THREE.Color) => {
    const rx=Math.round(px), ry=Math.round(py), rz=Math.round(pz);
    const key=`${rx},${ry},${rz}`;
    if(!occ.has(key)) {
      data.push({ pos:[rx,ry,rz], colorSunny:col, colorWeather:col, cluster:-1 });
      occ.add(key);
    }
  };

  // Tronco: Base ENORME (raio 8), afina pro meio (raio 4), alarga de novo perto do topo (raio 5)
  // Perfil: barriga na base, cintura no meio, alarga no topo antes da copa
  const trunkH = 30;
  for(let i=0; i<=trunkH; i++) {
    const cx=bx+tx*i, cy=by+ty*i, cz=bz+tz*i;
    const progress = i / trunkH;
    
    // Perfil do tronco: gordo na base, fino no meio, alarga perto do topo
    let radius: number;
    if(progress < 0.15) {
      // Base muito larga (raízes/base do tronco)
      radius = 8 - progress * 12;
    } else if(progress < 0.6) {
      // Meio afinando
      const t = (progress - 0.15) / 0.45;
      radius = 6.2 - t * 2.5;
    } else {
      // Topo alargando antes da copa
      const t = (progress - 0.6) / 0.4;
      radius = 3.7 + t * 1.5;
    }
    const r = Math.max(2, Math.round(radius));

    for(let dx=-r; dx<=r; dx++) 
    for(let dy=-r; dy<=r; dy++) 
    for(let dz=-r; dz<=r; dz++) {
      if(dx*dx+dy*dy+dz*dz <= r*r) {
        const n = hash(dx+i*7,dy+i*3,dz+i*11);
        addTree(cx+dx, cy+dy, cz+dz, n>0.7?C.bark:n>0.25?C.trunk:C.trunkDark);
      }
    }
  }

  // Raízes Massivas (6 raízes grossas saindo da base)
  for(let r=0; r<6; r++) {
    const ang = (r/6)*Math.PI*2 + 0.3;
    // Dois vetores perpendiculares à normal da superfície
    const perpX = Math.cos(ang);
    const perpZ = Math.sin(ang);
    
    for(let seg=0; seg<10; seg++) {
      const spread = seg * 2.5;
      const drop = seg * 0.8;
      const rx = bx + perpX * spread - tx * drop;
      const ry = by + perpZ * spread * 0.3 - ty * drop;
      const rz = bz + perpZ * spread - tz * drop;
      
      // Raiz grossa (raio 2 na base, afina)
      const rootR = seg < 4 ? 3 : seg < 7 ? 2 : 1;
      for(let dx=-rootR; dx<=rootR; dx++)
      for(let dy=-rootR; dy<=rootR; dy++)
      for(let dz=-rootR; dz<=rootR; dz++) {
        if(dx*dx+dy*dy+dz*dz <= rootR*rootR) {
          addTree(rx+dx, ry+dy, rz+dz, C.trunkDark);
        }
      }
    }
  }

  // 3 Galhos curtos e grossos saindo do topo do tronco (antes da copa)
  for(let br=0; br<3; br++) {
    const ang = (br/3)*Math.PI*2 + 1.0;
    const startI = 22 + br*2;
    const scx=bx+tx*startI, scy=by+ty*startI, scz=bz+tz*startI;
    
    let tipX=scx, tipY=scy, tipZ=scz;
    for(let j=0; j<10; j++) {
      tipX = scx + Math.cos(ang)*j*1.8 + tx*j*0.6;
      tipY = scy + Math.sin(ang)*j*0.3 + ty*j*0.8;
      tipZ = scz + Math.sin(ang)*j*1.8 + tz*j*0.6;
      
      const brR = j < 3 ? 2 : 1;
      for(let dx=-brR; dx<=brR; dx++)
      for(let dy=-brR; dy<=brR; dy++)
      for(let dz=-brR; dz<=brR; dz++) {
        if(dx*dx+dy*dy+dz*dz <= brR*brR) addTree(tipX+dx, tipY+dy, tipZ+dz, C.trunk);
      }
    }
    
    // Copa pequena na ponta do galho
    for(let lx=-5; lx<=5; lx++)
    for(let ly=-5; ly<=5; ly++)
    for(let lz=-5; lz<=5; lz++) {
      if(lx*lx+ly*ly+lz*lz < 22 && hash(lx+br*11,ly+br*7,lz+br*3) > 0.2) {
        const col = hash(lx,ly,lz)>0.5?C.leaf1:C.leaf2;
        addTree(tipX+lx, tipY+ly, tipZ+lz, col);
      }
    }
  }

  // Copa Principal ENORME e ACHATADA (Elipsóide: largo 16, alto 6)
  const topX=bx+tx*(trunkH+3), topY=by+ty*(trunkH+3), topZ=bz+tz*(trunkH+3);
  const crownRadiusH = 16; // Raio horizontal (muito largo)
  const crownRadiusV = 6;  // Raio vertical (achatado)
  
  // Precisamos de 2 vetores perpendiculares à direção radial para achatar corretamente
  // Usamos a projeção na direção do tronco (tx,ty,tz) como "up"
  for(let lx=-crownRadiusH; lx<=crownRadiusH; lx++)
  for(let ly=-crownRadiusH; ly<=crownRadiusH; ly++)
  for(let lz=-crownRadiusH; lz<=crownRadiusH; lz++) {
    // Componente radial (na direção do tronco) = "altura" da copa
    const radialComponent = lx*tx + ly*ty + lz*tz;
    // Componente tangencial = "largura" da copa
    const tangX = lx - radialComponent*tx;
    const tangY = ly - radialComponent*ty;
    const tangZ = lz - radialComponent*tz;
    const tangDist = Math.sqrt(tangX*tangX + tangY*tangY + tangZ*tangZ);
    
    // Teste de elipsóide: (tangDist/radiusH)² + (radial/radiusV)² <= 1
    const ellipse = (tangDist/crownRadiusH)**2 + (radialComponent/crownRadiusV)**2;
    
    if(ellipse <= 1.0 && hash(lx+99,ly+33,lz+77) > 0.12) {
      const n = hash(lx*3+1, ly*3+2, lz*3+3);
      const col = n>0.6?C.leafBright:n>0.35?C.leaf1:n>0.15?C.leaf2:C.leaf3;
      addTree(topX+lx, topY+ly, topZ+lz, col);
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
