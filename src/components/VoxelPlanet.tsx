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
  stone3: new THREE.Color("#374151"), stoneDeep: new THREE.Color("#334155"),
  craterFloor: new THREE.Color("#475569"),
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

  // Cratera profunda com fundo plano e entrada de caverna
  const d = dot3(dir, HOLE_DIR);
  let crater = 0;
  const craterDepth = 18;
  if (d > 0.965) {
    crater = -craterDepth; // fundo plano profundo
  } else if (d > 0.88) {
    const t = (d - 0.88) / (0.965 - 0.88);
    crater = -craterDepth * (t * t * (3 - 2 * t)); // descida suave
  }

  // Borda elevada da cratera
  let rim = 0;
  if (d > 0.82 && d < 0.90) {
    const center = 0.86;
    const width = 0.04;
    const t = 1 - Math.min(1, Math.abs(d - center) / width);
    rim = t * 5;
  }

  // Caverna — túnel que sai da parede da cratera para dentro do planeta
  const CAVE_DIR = norm([-0.6, 0.08, -0.8]);
  const caveDot = dot3(dir, CAVE_DIR);
  let cave = 0;
  if (caveDot > 0.985) {
    cave = -8; // escava um túnel estreito
  } else if (caveDot > 0.975) {
    const t = (caveDot - 0.975) / (0.985 - 0.975);
    cave = -8 * t * t;
  }

  return base + peaks + crater + rim + cave;
}

/* ═══════ COR ═══════ */
function terrainColor(h: number, n: number, w: WeatherType): THREE.Color {
  if(w==="snow"||w==="storm") { if(h>-1) return n>0.45?C.snow1:C.snow2; }
  if(h>12) return n>0.45?C.snow1:C.snow2;
  if(h>7) return n>0.55?C.stone1:C.stone2;
  if(h>4.5) return n>0.6?C.stone1:C.grass4;
  // Cratera e caverna
  if(h<=-15) return n>0.5?C.craterFloor:C.stone2;
  if(h<-8) return n>0.5?C.stoneDeep:C.stone3;
  if(h<-3) return n>0.5?C.stone2:C.dirt1;
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

  // Tronco: ainda maior e mais grosso
  const trunkH = 34;
  for (let t=0; t<=trunkH; t++) {
    const cx=bx+nx*t, cy=by+ny*t, cz=bz+nz*t;
    const progress = t/trunkH;
    const trunkR = Math.max(2, Math.round(5 - progress*2)); // 5 -> 2
    for(let dx=-trunkR;dx<=trunkR;dx++)
    for(let dy=-trunkR;dy<=trunkR;dy++)
    for(let dz=-trunkR;dz<=trunkR;dz++) {
      if(dx*dx+dy*dy+dz*dz<=trunkR*trunkR+1) {
        const n=hash(dx+t*7,dy+t*3,dz+t*11);
        addV(Math.round(cx+dx),Math.round(cy+dy),Math.round(cz+dz),
          n>0.72?C.bark:n>0.38?C.trunk:C.trunkDark,data,occ);
      }
    }
  }

  // Raízes massivas
  for(let r=0;r<8;r++) {
    const angle = (r/8)*Math.PI*2;
    for(let seg=0;seg<14;seg++) {
      const spread = seg*2.1;
      const dropOff = seg*0.7;
      const rx=Math.round(bx+Math.cos(angle)*spread-nx*dropOff);
      const ry=Math.round(by+Math.sin(angle)*spread*0.25-ny*dropOff);
      const rz=Math.round(bz+Math.sin(angle)*spread-nz*dropOff);
      for(let dx=-1;dx<=1;dx++)
      for(let dz=-1;dz<=1;dz++) {
        addV(rx+dx,ry,rz+dz,C.trunkDark,data,occ);
        if(seg<7) addV(rx+dx,ry+1,rz+dz,C.trunk,data,occ);
      }
    }
  }

  // Muitos galhos longos, com copas separadas nas pontas
  const branches: {angle:number; start:number; rise:number; len:number; tipR:number}[] = [
    { angle: 0.1, start: 14, rise: 0.8, len: 12, tipR: 5 },
    { angle: 0.9, start: 17, rise: 1.0, len: 14, tipR: 6 },
    { angle: 1.7, start: 15, rise: 0.9, len: 13, tipR: 5 },
    { angle: 2.6, start: 18, rise: 1.1, len: 15, tipR: 6 },
    { angle: 3.5, start: 13, rise: 0.7, len: 11, tipR: 5 },
    { angle: 4.2, start: 19, rise: 1.2, len: 16, tipR: 6 },
    { angle: 5.1, start: 16, rise: 0.9, len: 13, tipR: 5 },
    { angle: 5.9, start: 20, rise: 1.3, len: 17, tipR: 6 },
  ];

  const crowns: {cx:number;cy:number;cz:number;r:number}[] = [];

  for(const br of branches) {
    const startX=bx+nx*br.start, startY=by+ny*br.start, startZ=bz+nz*br.start;
    let tipX=startX, tipY=startY, tipZ=startZ;

    for(let seg=0;seg<br.len;seg++) {
      const gx=Math.round(startX+Math.cos(br.angle)*seg*1.6+nx*seg*0.5);
      const gy=Math.round(startY+Math.sin(br.angle)*seg*0.35+ny*seg*br.rise);
      const gz=Math.round(startZ+Math.sin(br.angle)*seg*1.6+nz*seg*0.5);
      tipX=gx; tipY=gy; tipZ=gz;

      // Galho grosso na base, afinando na ponta
      const branchR = seg < 4 ? 2 : seg < 8 ? 1 : 0;
      for(let dx=-branchR;dx<=branchR;dx++)
      for(let dy=-branchR;dy<=branchR;dy++)
      for(let dz=-branchR;dz<=branchR;dz++) {
        if(dx*dx+dy*dy+dz*dz<=branchR*branchR+1) {
          addV(gx+dx,gy+dy,gz+dz,seg>br.len*0.7?C.trunk:C.bark,data,occ);
        }
      }
    }

    // Guarda copa da ponta do galho
    crowns.push({ cx: tipX, cy: tipY, cz: tipZ, r: br.tipR });
  }

  // Copa central superior + copas nas pontas dos galhos (mais espaçadas)
  const topX=bx+nx*(trunkH+7), topY=by+ny*(trunkH+7), topZ=bz+nz*(trunkH+7);
  crowns.unshift(
    {cx:topX, cy:topY, cz:topZ, r:10},
    {cx:topX+nx*8, cy:topY+ny*8, cz:topZ+nz*8, r:7},
  );

  for(const crown of crowns) {
    const cr=crown.r;
    for(let dx=-cr;dx<=cr;dx++)
    for(let dy=-cr;dy<=cr;dy++)
    for(let dz=-cr;dz<=cr;dz++) {
      const dd=dx*dx+dy*dy+dz*dz;
      if(dd<=cr*cr && hash(dx+cr*7,dy+cr*3,dz+cr*11)>0.18) {
        const ln=hash(dx*3+1,dy*3+2,dz*3+3);
        addV(Math.round(crown.cx+dx),Math.round(crown.cy+dy),Math.round(crown.cz+dz),
          ln>0.68?C.leafBright:ln>0.48?C.leaf1:ln>0.28?C.leaf2:C.leaf3,
          data,occ);
      }
    }
  }
}

/* ═══════ CHÃO DA CRATERA (plano explícito) ═══════ */
function addCraterFloor(data: VD[], occ: Set<string>) {
  // Ponto central da cratera na superfície do planeta
  const [nx, ny, nz] = HOLE_DIR;
  const centerDist = R - 18; // 18 unidades abaixo da superfície = fundo da cratera
  const cx = nx * centerDist;
  const cy = ny * centerDist;
  const cz = nz * centerDist;

  // Duas direções perpendiculares à normal (para varrer o plano do chão)
  // Encontra vetores ortogonais ao HOLE_DIR
  const up: [number,number,number] = Math.abs(ny) < 0.9 ? [0,1,0] : [1,0,0];
  const t1x = ny*up[2]-nz*up[1], t1y = nz*up[0]-nx*up[2], t1z = nx*up[1]-ny*up[0];
  const t1len = Math.sqrt(t1x*t1x+t1y*t1y+t1z*t1z);
  const e1: [number,number,number] = [t1x/t1len, t1y/t1len, t1z/t1len];
  const e2x = ny*e1[2]-nz*e1[1], e2y = nz*e1[0]-nx*e1[2], e2z = nx*e1[1]-ny*e1[0];
  const e2len = Math.sqrt(e2x*e2x+e2y*e2y+e2z*e2z);
  const e2: [number,number,number] = [e2x/e2len, e2y/e2len, e2z/e2len];

  // Preenche disco de raio 9 no plano do fundo
  const floorR = 11; // chão mais largo para a cratera mais profunda
  for (let u = -floorR; u <= floorR; u++) {
    for (let v = -floorR; v <= floorR; v++) {
      if (u*u + v*v > floorR*floorR) continue;
      // Coloca 2 camadas de espessura para garantir visibilidade
      for (let d = 0; d <= 2; d++) {
        const wx = Math.round(cx + e1[0]*u + e2[0]*v + nx*d);
        const wy = Math.round(cy + e1[1]*u + e2[1]*v + ny*d);
        const wz = Math.round(cz + e1[2]*u + e2[2]*v + nz*d);
        const n = hash(wx, wy, wz);
        const col = n > 0.6 ? C.craterFloor : n > 0.3 ? C.stone2 : C.stoneDeep;
        addV(wx, wy, wz, col, data, occ);
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
  const minR = R - 22; // expandido para cobrir cratera profunda + caverna

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
  addCraterFloor(data,occ);
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

/* ═══════ ATMOSFERA — COM TRANSIÇÃO SUAVE ═══════ */
function Atmosphere() {
  const {hour,weather}=useGameState();
  const {scene}=useThree();
  const targetColor = useRef(new THREE.Color("#070e2b"));
  const currentColor = useRef(new THREE.Color("#070e2b"));
  const targetFogNear = useRef(999);
  const targetFogFar = useRef(999);
  const currentFogNear = useRef(999);
  const currentFogFar = useRef(999);
  const fogColor = useRef(new THREE.Color("#334155"));

  useFrame((_,delta)=>{
    // Cor do céu alvo
    let bg: string;
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

    targetColor.current.set(bg);
    // Interpola suavemente
    currentColor.current.lerp(targetColor.current, delta * 3);
    (scene.background as THREE.Color).copy(currentColor.current);

    // Névoa com transição suave
    if(weather==="fog") {
      targetFogNear.current = R * 0.6;
      targetFogFar.current = R * 2.5;
      fogColor.current.set("#334155");
    } else if(weather==="storm") {
      targetFogNear.current = R * 0.8;
      targetFogFar.current = R * 3;
      fogColor.current.set("#0f172a");
    } else if(weather==="rain") {
      targetFogNear.current = R * 1.5;
      targetFogFar.current = R * 5;
      fogColor.current.set("#1a2332");
    } else if(weather==="snow") {
      targetFogNear.current = R * 1.2;
      targetFogFar.current = R * 4;
      fogColor.current.set("#1e293b");
    } else {
      targetFogNear.current = R * 8;
      targetFogFar.current = R * 12;
    }

    currentFogNear.current += (targetFogNear.current - currentFogNear.current) * delta * 2;
    currentFogFar.current += (targetFogFar.current - currentFogFar.current) * delta * 2;

    if(weather==="sunny") {
      if(scene.fog) {
        const f = scene.fog as THREE.Fog;
        f.near += (R*8 - f.near) * delta * 2;
        f.far += (R*12 - f.far) * delta * 2;
        if(f.near > R * 6) scene.fog = null;
      }
    } else {
      if(!scene.fog) scene.fog = new THREE.Fog(fogColor.current, currentFogNear.current, currentFogFar.current);
      else {
        const f = scene.fog as THREE.Fog;
        f.color.lerp(fogColor.current, delta * 2);
        f.near += (currentFogNear.current - f.near) * delta * 2;
        f.far += (currentFogFar.current - f.far) * delta * 2;
      }
    }
  });

  return <color attach="background" args={["#070e2b"]}/>;
}

/* ═══════ PARTÍCULAS DE CLIMA SUAVES ═══════ */
function WeatherParticles() {
  const {weather} = useGameState();
  const rainRef = useRef<THREE.Points>(null!);
  const snowRef = useRef<THREE.Points>(null!);
  const targetOpacity = useRef(0);

  const rainCount = 3000;
  const snowCount = 1500;
  const spread = R * 3.5;

  const rainGeo = useMemo(() => {
    const pos = new Float32Array(rainCount * 3);
    for(let i=0;i<rainCount;i++) {
      pos[i*3] = (Math.random()-0.5)*spread;
      pos[i*3+1] = Math.random()*spread - spread/3;
      pos[i*3+2] = (Math.random()-0.5)*spread;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [spread]);

  const snowGeo = useMemo(() => {
    const pos = new Float32Array(snowCount * 3);
    for(let i=0;i<snowCount;i++) {
      pos[i*3] = (Math.random()-0.5)*spread;
      pos[i*3+1] = Math.random()*spread - spread/3;
      pos[i*3+2] = (Math.random()-0.5)*spread;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [spread]);

  useFrame((_,delta) => {
    const isRain = weather === "rain" || weather === "storm";
    const isSnow = weather === "snow";

    // Suaviza opacidade
    const tgt = (isRain || isSnow) ? 1 : 0;
    targetOpacity.current += (tgt - targetOpacity.current) * delta * 2;

    // Chuva
    if(rainRef.current) {
      const mat = rainRef.current.material as THREE.PointsMaterial;
      mat.opacity = isRain ? targetOpacity.current * 0.6 : 0;
      mat.size = weather === "storm" ? 0.7 : 0.35;

      if(isRain) {
        const pos = rainRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const speed = weather === "storm" ? 80 : 40;
        const wind = weather === "storm" ? delta * 15 : delta * 3;
        for(let i=0;i<pos.count;i++) {
          pos.setY(i, pos.getY(i) - delta * speed);
          pos.setX(i, pos.getX(i) + wind);
          if(pos.getY(i) < -spread/2) { pos.setY(i, spread/2); pos.setX(i, (Math.random()-0.5)*spread); }
        }
        pos.needsUpdate = true;
      }
    }

    // Neve
    if(snowRef.current) {
      const mat = snowRef.current.material as THREE.PointsMaterial;
      mat.opacity = isSnow ? targetOpacity.current * 0.7 : 0;

      if(isSnow) {
        const pos = snowRef.current.geometry.attributes.position as THREE.BufferAttribute;
        for(let i=0;i<pos.count;i++) {
          pos.setY(i, pos.getY(i) - delta * 8);
          // Ondulação lateral suave
          pos.setX(i, pos.getX(i) + Math.sin(pos.getY(i) * 0.1 + i) * delta * 2);
          pos.setZ(i, pos.getZ(i) + Math.cos(pos.getY(i) * 0.08 + i * 0.5) * delta * 1.5);
          if(pos.getY(i) < -spread/2) {
            pos.setY(i, spread/2);
            pos.setX(i, (Math.random()-0.5)*spread);
            pos.setZ(i, (Math.random()-0.5)*spread);
          }
        }
        pos.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <points ref={rainRef} geometry={rainGeo}>
        <pointsMaterial color="#7dd3fc" size={0.35} transparent opacity={0} depthWrite={false} />
      </points>
      <points ref={snowRef} geometry={snowGeo}>
        <pointsMaterial color="#e0f2fe" size={1.2} transparent opacity={0} depthWrite={false} />
      </points>
    </>
  );
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
        <WeatherParticles/>
        <Stars radius={R*6} depth={R*2} count={5000} factor={6} fade speed={0.3}/>
        <OrbitControls enabled={orbitEnabled} enablePan={false} minDistance={R*1.3} maxDistance={R*4.5} enableDamping dampingFactor={0.05}/>
      </Canvas>
    </div>
  );
}
