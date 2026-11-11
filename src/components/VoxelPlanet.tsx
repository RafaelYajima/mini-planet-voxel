"use client";

import { useLayoutEffect, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";
import Player from "./Player";

const R = 40;

const C = {
  grass1: new THREE.Color("#4ade80"),
  grass2: new THREE.Color("#22c55e"),
  grass3: new THREE.Color("#16a34a"),
  dirt1: new THREE.Color("#92400e"),
  dirt2: new THREE.Color("#a16207"),
  stone1: new THREE.Color("#6b7280"),
  stone2: new THREE.Color("#4b5563"),
  stone3: new THREE.Color("#374151"),
  stoneDeep: new THREE.Color("#1a202c"),
  craterFloor: new THREE.Color("#475569"),
  snow1: new THREE.Color("#e0f2fe"),
  snow2: new THREE.Color("#f8fafc"),
  mud: new THREE.Color("#5c2d0a"),
  water: new THREE.Color("#0ea5e9"),
  trunk: new THREE.Color("#5b3418"),
  trunkDark: new THREE.Color("#3e200c"),
  bark: new THREE.Color("#4a2c12"),
  leaf1: new THREE.Color("#15803d"),
  leaf2: new THREE.Color("#166534"),
  leaf3: new THREE.Color("#14532d"),
  leafBright: new THREE.Color("#22c55e"),
};

function norm(v: [number, number, number]): [number, number, number] {
  const d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / d, v[1] / d, v[2] / d];
}
function dot3(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}
function noise3d(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iy, iz), b = hash(ix + 1, iy, iz);
  const c = hash(ix, iy + 1, iz), d = hash(ix + 1, iy + 1, iz);
  const e = hash(ix, iy, iz + 1), f = hash(ix + 1, iy, iz + 1);
  const g = hash(ix, iy + 1, iz + 1), h2 = hash(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * sx;
  const x1 = e + (f - e) * sx;
  const x2 = c + (d - c) * sx;
  const x3 = g + (h2 - g) * sx;
  return (x0 + (x2 - x0) * sy) + ((x1 + (x3 - x1) * sy) - (x0 + (x2 - x0) * sy)) * sz;
}
function fbm(x: number, y: number, z: number, oct = 3): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise3d(x * f, y * f, z * f) * a;
    a *= 0.5;
    f *= 2.1;
  }
  return v;
}

const HOLE_DIR = norm([-0.78, 0.08, -0.62]);
const TREE_DIR = norm([0.48, 0.12, 0.86]);
const LAKE_DIR = norm([0.2, -0.6, -0.4]);
const CAVE_DIR = norm([-0.85, -0.15, -0.55]);
const MTN_1 = norm([0.75, 0.55, -0.30]);
const MTN_2 = norm([-0.50, 0.65, 0.50]);
const MTN_3 = norm([0.10, -0.80, 0.55]);

function terrainHeight(nx: number, ny: number, nz: number): number {
  const dir: [number, number, number] = [nx, ny, nz];
  const hills = (fbm(nx * 2.5, ny * 2.5, nz * 2.5, 4) - 0.3) * 8;
  const smallPeaks = Math.pow(Math.max(0, fbm(nx * 5, ny * 5, nz * 5, 2) - 0.4), 2) * 15;

  // 3 Montanhas com picos gelados (tamanhos variados)
  const infl = (target: [number,number,number], thr: number) => {
    const d = dot3(dir, target); if (d <= thr) return 0; const t = (d - thr) / (1 - thr); return t * t;
  };
  const mountains = infl(MTN_1, 0.94) * 22   // grande
                   + infl(MTN_2, 0.95) * 16   // média
                   + infl(MTN_3, 0.96) * 12;  // pequena

  const dH = dot3(dir, HOLE_DIR);
  let crater = 0;
  if (dH > 0.96) crater = -14;
  else if (dH > 0.88) {
    const t = (dH - 0.88) / (0.96 - 0.88);
    crater = -14 * (t * t * (3 - 2 * t));
  }

  const dL = dot3(dir, LAKE_DIR);
  let lake = 0;
  if (dL > 0.94) lake = -6;
  else if (dL > 0.86) {
    const t = (dL - 0.86) / (0.94 - 0.86);
    lake = -6 * (t * t * (3 - 2 * t));
  }

  return hills + smallPeaks + mountains + crater + lake;
}

function baseColor(h: number, n: number, nx: number, ny: number, nz: number, dist: number): THREE.Color {
  const dL = dot3([nx, ny, nz], LAKE_DIR);
  if (dL > 0.93 && dist < R - 2) return C.water;
  if (h > 16) return n > 0.5 ? C.snow1 : C.snow2;       // pico gelado
  if (h > 10) return n > 0.6 ? C.snow1 : C.stone1;       // pedra com neve
  if (h > 6) return n > 0.5 ? C.stone1 : C.stone2;       // pedra
  if (h > 4) return n > 0.6 ? C.stone2 : C.grass3;        // encosta
  if (h < -12) return C.craterFloor;
  if (n > 0.8) return C.dirt1;
  return n > 0.6 ? C.grass1 : n > 0.3 ? C.grass2 : C.grass3;
}

function targetWeatherColor(x: number, y: number, z: number, h: number, n: number, dist: number, weather: WeatherType): THREE.Color {
  const nx = x / dist, ny = y / dist, nz = z / dist;

  if (weather === "snow") {
    if (h > -2) return n > 0.4 ? C.snow1 : C.snow2;
  }
  if (weather === "storm") {
    if (h > -1) return n > 0.45 ? C.snow1 : C.snow2;
  }
  if (weather === "rain" || weather === "storm") {
    const pNoise = hash(Math.round(x * 0.2), 0, Math.round(z * 0.2));
    if (h < 1.2 && pNoise > 0.82) return C.water;
    if (h < 1.8 && pNoise > 0.62) return C.mud;
  }

  return baseColor(h, n, nx, ny, nz, dist);
}

type Voxel = {
  pos: [number, number, number];
  colorSunny: THREE.Color;
  colorWeather: THREE.Color;
  cluster: number;
  isTree: boolean;
  h: number;
  n: number;
  dist: number;
};

function generatePlanet(): Voxel[] {
  const data: Voxel[] = [];
  const occ = new Set<string>();
  const solidMap = new Set<string>();
  const maxR = R + 18, minR = R - 18;

  for (let x = -maxR; x <= maxR; x++)
    for (let y = -maxR; y <= maxR; y++)
      for (let z = -maxR; z <= maxR; z++) {
        const dSq = x * x + y * y + z * z;
        if (dSq < minR * minR || dSq > maxR * maxR) continue;
        const dist = Math.sqrt(dSq);
        const nx = x / dist, ny = y / dist, nz = z / dist;
        const h = terrainHeight(nx, ny, nz);
        if (dist <= R + h) solidMap.add(`${x},${y},${z}`);
      }

  // subtract cave
  const startD = R - 6, endD = R - 20;
  const sx = CAVE_DIR[0] * startD, sy = CAVE_DIR[1] * startD, sz = CAVE_DIR[2] * startD;
  const ex = CAVE_DIR[0] * endD, ey = CAVE_DIR[1] * endD, ez = CAVE_DIR[2] * endD;
  const lx = ex - sx, ly = ey - sy, lz = ez - sz;
  const lenSq = lx * lx + ly * ly + lz * lz;
  for (let x = -maxR; x <= maxR; x++)
    for (let y = -maxR; y <= maxR; y++)
      for (let z = -maxR; z <= maxR; z++) {
        const dx = x - sx, dy = y - sy, dz = z - sz;
        const t = Math.max(0, Math.min(1, (dx * lx + dy * ly + dz * lz) / lenSq));
        const px = sx + t * lx, py = sy + t * ly, pz = sz + t * lz;
        if ((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 < 18) solidMap.delete(`${x},${y},${z}`);
      }

  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const key of solidMap) {
    const [x, y, z] = key.split(",").map(Number);
    let exp = false;
    for (const [dx, dy, dz] of dirs) {
      if (!solidMap.has(`${x + dx},${y + dy},${z + dz}`)) { exp = true; break; }
    }
    if (!exp) continue;

    const dist = Math.sqrt(x*x+y*y+z*z);
    const nx = x / dist, ny = y / dist, nz = z / dist;
    const h = terrainHeight(nx, ny, nz);
    const n = hash(x, y, z);
    const internal = (R + h - dist) > 1.2;
    const colorSunny = internal ? (n > 0.5 ? C.stone2 : C.stoneDeep) : baseColor(h, n, nx, ny, nz, dist);
    data.push({ pos:[x,y,z], colorSunny, colorWeather: colorSunny, cluster: noise3d(x*0.15, y*0.15, z*0.15), isTree:false, h, n, dist });
    occ.add(key);
  }

  const addTree = (x:number,y:number,z:number,col:THREE.Color) => {
    const rx=Math.round(x), ry=Math.round(y), rz=Math.round(z);
    const key=`${rx},${ry},${rz}`;
    if(occ.has(key)) return;
    occ.add(key);
    data.push({ pos:[rx,ry,rz], colorSunny:col, colorWeather:col, cluster:-1, isTree:true, h:99, n:0.5, dist:Math.sqrt(rx*rx+ry*ry+rz*rz) });
  };

  // Árvores pequenas, médias e arbustos espalhados pela grama
  let treeCount = 0;
  let bushCount = 0;
  const fruitColor = new THREE.Color("#ef4444"); // frutas vermelhas
  const berryColor = new THREE.Color("#a855f7"); // frutas roxas

  for (let i = 0; i < data.length; i += 25) {
    const v = data[i];
    const isGrass = v.colorSunny === C.grass1 || v.colorSunny === C.grass2 || v.colorSunny === C.grass3;
    if (!isGrass) continue;
    const [px, py, pz] = v.pos;
    const n = hash(px, py, pz);
    const dist = Math.sqrt(px*px+py*py+pz*pz);
    const ux = px / dist, uy = py / dist, uz = pz / dist;

    if (n > 0.96 && treeCount < 200) {
      // Árvore pequena ou média (altura varia de 2 a 5)
      const th = 2 + Math.floor(n * 4);
      const crownR = th > 3 ? 3 : 2; // copa maior para árvores mais altas

      for (let t = 1; t <= th; t++) addTree(px+ux*t, py+uy*t, pz+uz*t, C.trunk);

      const cx = px + ux * (th + 1), cy = py + uy * (th + 1), cz = pz + uz * (th + 1);
      for (let dx=-crownR; dx<=crownR; dx++)
      for (let dy=-crownR; dy<=crownR; dy++)
      for (let dz=-crownR; dz<=crownR; dz++) {
        if (dx*dx+dy*dy+dz*dz <= crownR*crownR && hash(dx+px,dy+py,dz+pz) > 0.2) {
          const ln = hash(dx*3+px, dy*3+py, dz*3+pz);
          addTree(cx+dx, cy+dy, cz+dz, ln > 0.5 ? C.leaf1 : C.leaf2);
        }
      }
      treeCount++;

    } else if (n > 0.93 && n <= 0.96 && bushCount < 120) {
      // Arbusto frutífero (baixo e largo, com frutas coloridas)
      const cx = px + ux * 1.5, cy = py + uy * 1.5, cz = pz + uz * 1.5;
      const bushR = 2;
      for (let dx=-bushR; dx<=bushR; dx++)
      for (let dy=-bushR; dy<=bushR; dy++)
      for (let dz=-bushR; dz<=bushR; dz++) {
        const dd = dx*dx+dy*dy+dz*dz;
        if (dd <= bushR*bushR + 1 && hash(dx+px*2,dy+py*2,dz+pz*2) > 0.25) {
          const fn = hash(dx+px, dy+py*3, dz+pz);
          let col: THREE.Color;
          if (fn > 0.88) col = fruitColor;       // fruta vermelha
          else if (fn > 0.82) col = berryColor;   // fruta roxa
          else col = fn > 0.5 ? C.leaf1 : C.leafBright;
          addTree(cx+dx, cy+dy, cz+dz, col);
        }
      }
      // Tronquinho curto
      addTree(px+ux, py+uy, pz+uz, C.trunkDark);
      bushCount++;
    }
  }

  // Deku tree
  const [tx,ty,tz] = TREE_DIR;
  const hT = terrainHeight(tx,ty,tz);
  const bx = tx*(R+hT), by = ty*(R+hT), bz = tz*(R+hT);
  const trunkH = 30;
  for (let i=0; i<=trunkH; i++) {
    const cx=bx+tx*i, cy=by+ty*i, cz=bz+tz*i;
    const progress = i/trunkH;
    let radius:number;
    if(progress<0.15) radius = 8 - progress*12;
    else if(progress<0.6) radius = 6.2 - ((progress-0.15)/0.45)*2.5;
    else radius = 3.7 + ((progress-0.6)/0.4)*1.5;
    const r=Math.max(2,Math.round(radius));
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++) for(let dz=-r;dz<=r;dz++) {
      if(dx*dx+dy*dy+dz*dz<=r*r) {
        const n=hash(dx+i*7,dy+i*3,dz+i*11);
        addTree(cx+dx,cy+dy,cz+dz,n>0.7?C.bark:n>0.25?C.trunk:C.trunkDark);
      }
    }
  }

  // roots
  for(let r=0;r<6;r++) {
    const ang=(r/6)*Math.PI*2+0.3;
    const perpX=Math.cos(ang), perpZ=Math.sin(ang);
    for(let seg=0;seg<10;seg++) {
      const spread=seg*2.5, drop=seg*0.8;
      const rx=bx+perpX*spread-tx*drop;
      const ry=by+perpZ*spread*0.3-ty*drop;
      const rz=bz+perpZ*spread-tz*drop;
      const rr=seg<4?3:seg<7?2:1;
      for(let dx=-rr;dx<=rr;dx++) for(let dy=-rr;dy<=rr;dy++) for(let dz=-rr;dz<=rr;dz++) {
        if(dx*dx+dy*dy+dz*dz<=rr*rr) addTree(rx+dx,ry+dy,rz+dz,C.trunkDark);
      }
    }
  }

  // few heavy branches
  for(let br=0;br<3;br++) {
    const ang=(br/3)*Math.PI*2+1.0;
    const startI=22+br*2;
    const scx=bx+tx*startI, scy=by+ty*startI, scz=bz+tz*startI;
    let tipX=scx, tipY=scy, tipZ=scz;
    for(let j=0;j<10;j++) {
      tipX=scx+Math.cos(ang)*j*1.8+tx*j*0.6;
      tipY=scy+Math.sin(ang)*j*0.3+ty*j*0.8;
      tipZ=scz+Math.sin(ang)*j*1.8+tz*j*0.6;
      const brR=j<3?2:1;
      for(let dx=-brR;dx<=brR;dx++) for(let dy=-brR;dy<=brR;dy++) for(let dz=-brR;dz<=brR;dz++) {
        if(dx*dx+dy*dy+dz*dz<=brR*brR) addTree(tipX+dx,tipY+dy,tipZ+dz,C.trunk);
      }
    }
    for(let lx=-5;lx<=5;lx++) for(let ly=-5;ly<=5;ly++) for(let lz=-5;lz<=5;lz++) {
      if(lx*lx+ly*ly+lz*lz<22 && hash(lx+br*11,ly+br*7,lz+br*3)>0.2) {
        addTree(tipX+lx,tipY+ly,tipZ+lz,hash(lx,ly,lz)>0.5?C.leaf1:C.leaf2);
      }
    }
  }

  // main canopy
  const topX=bx+tx*(trunkH+3), topY=by+ty*(trunkH+3), topZ=bz+tz*(trunkH+3);
  const crownRadiusH = 16, crownRadiusV = 6;
  for(let lx=-crownRadiusH;lx<=crownRadiusH;lx++)
  for(let ly=-crownRadiusH;ly<=crownRadiusH;ly++)
  for(let lz=-crownRadiusH;lz<=crownRadiusH;lz++) {
    const radial = lx*tx + ly*ty + lz*tz;
    const tangX = lx - radial*tx;
    const tangY = ly - radial*ty;
    const tangZ = lz - radial*tz;
    const tangDist = Math.sqrt(tangX*tangX+tangY*tangY+tangZ*tangZ);
    const ellipse = (tangDist/crownRadiusH)**2 + (radial/crownRadiusV)**2;
    if(ellipse<=1 && hash(lx+99,ly+33,lz+77)>0.12) {
      const n=hash(lx*3+1,ly*3+2,lz*3+3);
      addTree(topX+lx,topY+ly,topZ+lz,n>0.6?C.leafBright:n>0.35?C.leaf1:n>0.15?C.leaf2:C.leaf3);
    }
  }

  return data;
}

function WeatherFX() {
  const { weather } = useGameState();
  const rainRef = useRef<THREE.Points>(null!);
  const snowRef = useRef<THREE.Points>(null!);
  const spread = R * 3;

  const rainGeo = useMemo(() => {
    const p = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      p[i*3] = (Math.random()-0.5)*spread;
      p[i*3+1] = Math.random()*spread-spread/3;
      p[i*3+2] = (Math.random()-0.5)*spread;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p,3));
    return g;
  }, [spread]);

  const snowGeo = useMemo(() => {
    const p = new Float32Array(1200 * 3);
    for (let i = 0; i < 1200; i++) {
      p[i*3] = (Math.random()-0.5)*spread;
      p[i*3+1] = Math.random()*spread-spread/3;
      p[i*3+2] = (Math.random()-0.5)*spread;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p,3));
    return g;
  }, [spread]);

  useFrame((_,delta) => {
    const isRain = weather === "rain" || weather === "storm";
    const isSnow = weather === "snow";

    if(rainRef.current) {
      const mat = rainRef.current.material as THREE.PointsMaterial;
      mat.opacity += ((isRain ? 0.55 : 0) - mat.opacity) * delta * 2;
      mat.size = weather === "storm" ? 0.6 : 0.35;
      if(isRain) {
        const pos = rainRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const speed = weather === "storm" ? 70 : 35;
        const wind = weather === "storm" ? delta * 12 : delta * 2;
        for(let i=0;i<pos.count;i++) {
          pos.setY(i, pos.getY(i)-delta*speed);
          pos.setX(i, pos.getX(i)+wind);
          if(pos.getY(i)<-spread/2) { pos.setY(i, spread/2); pos.setX(i,(Math.random()-0.5)*spread); }
        }
        pos.needsUpdate = true;
      }
    }

    if(snowRef.current) {
      const mat = snowRef.current.material as THREE.PointsMaterial;
      mat.opacity += ((isSnow ? 0.7 : 0) - mat.opacity) * delta * 2;
      if(isSnow) {
        const pos = snowRef.current.geometry.attributes.position as THREE.BufferAttribute;
        for(let i=0;i<pos.count;i++) {
          pos.setY(i, pos.getY(i)-delta*8);
          pos.setX(i, pos.getX(i)+Math.sin(pos.getY(i)*0.1+i)*delta*1.5);
          if(pos.getY(i)<-spread/2) { pos.setY(i, spread/2); pos.setX(i,(Math.random()-0.5)*spread); }
        }
        pos.needsUpdate = true;
      }
    }
  });

  return <>
    <points ref={rainRef} geometry={rainGeo}><pointsMaterial color="#7dd3fc" size={0.35} transparent opacity={0} depthWrite={false}/></points>
    <points ref={snowRef} geometry={snowGeo}><pointsMaterial color="#e0f2fe" size={1.2} transparent opacity={0} depthWrite={false}/></points>
  </>;
}

function PlanetBody() {
  const { weather } = useGameState();
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const voxels = useMemo(() => generatePlanet(), []);
  const queueRef = useRef<number[]>([]);
  const processedRef = useRef(0);
  const activeTransitionRef = useRef(false);
  const lastWeather = useRef<WeatherType>("sunny");

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

  useEffect(() => {
    if (lastWeather.current === weather) return;
    lastWeather.current = weather;

    for (let i = 0; i < voxels.length; i++) {
      const v = voxels[i];
      if (v.isTree) continue;
      v.colorWeather = targetWeatherColor(v.pos[0], v.pos[1], v.pos[2], v.h, v.n, v.dist, weather);
    }

    const queue = voxels
      .map((v, i) => ({ i, c: v.cluster }))
      .filter((v) => voxels[v.i].cluster !== -1)
      .sort((a, b) => a.c - b.c)
      .map((v) => v.i);

    queueRef.current = queue;
    processedRef.current = 0;
    activeTransitionRef.current = true;
  }, [weather, voxels]);

  useFrame(() => {
    if (!meshRef.current || !activeTransitionRef.current) return;

    const queue = queueRef.current;
    const start = processedRef.current;
    const batchSize = 35; // ~15s para 20k+ blocos
    const end = Math.min(start + batchSize, queue.length);

    for (let q = start; q < end; q++) {
      const idx = queue[q];
      meshRef.current.setColorAt(idx, voxels[idx].colorWeather);
    }
    meshRef.current.instanceColor!.needsUpdate = true;
    processedRef.current = end;

    if (end >= queue.length) {
      activeTransitionRef.current = false;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
      <meshStandardMaterial roughness={0.8} flatShading />
    </instancedMesh>
  );
}

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
  const { weatherPanelOpen, diaryOpen, weather, cameraView } = useGameState();
  const orbitEnabled = cameraView === "orbit" && !weatherPanelOpen && !diaryOpen;

  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 40, 160], fov: 45 }} dpr={[1, 1.5]}>
        <Atmosphere />
        <ambientLight intensity={0.4} />
        <Sun />
        <Rotator><PlanetBody /></Rotator>
        <Player />
        <WeatherFX />
        <Stars radius={300} count={6000} factor={7} fade />
        {weather === "sunny" && <Sparkles count={80} scale={R*3} size={3} speed={0.4} color="#fde68a" />}
        <OrbitControls enabled={orbitEnabled} enablePan={false} minDistance={80} maxDistance={280} />
      </Canvas>
    </div>
  );
}
