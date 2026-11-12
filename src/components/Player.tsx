"use client";

import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";

const R = 40;

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
function norm(v: [number,number,number]): [number,number,number] {
  const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d,v[1]/d,v[2]/d];
}
function dot3(a: [number,number,number], b: [number,number,number]) {
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}

const HOLE_DIR = norm([-0.78, 0.08, -0.62]);
const LAKE_DIR = norm([0.2, -0.6, -0.4]);
const MTN_1 = norm([0.75, 0.55, -0.30]);
const MTN_2 = norm([-0.50, 0.65, 0.50]);
const MTN_3 = norm([0.10, -0.80, 0.55]);

function terrainHeight(nx:number, ny:number, nz:number): number {
  const dir:[number,number,number]=[nx,ny,nz];
  const hills = (fbm(nx*2.5, ny*2.5, nz*2.5, 4)-0.3)*8;
  const smallPeaks = Math.pow(Math.max(0, fbm(nx*5, ny*5, nz*5, 2)-0.4), 2)*15;
  const infl = (target: [number,number,number], thr: number) => {
    const d = dot3(dir, target); if (d <= thr) return 0; const t = (d - thr) / (1 - thr); return t * t;
  };
  const mountains = infl(MTN_1, 0.94) * 22 + infl(MTN_2, 0.95) * 16 + infl(MTN_3, 0.96) * 12;
  const dH=dot3(dir,HOLE_DIR);
  let crater=0;
  if(dH>0.96) crater=-14;
  else if(dH>0.88) { const t=(dH-0.88)/(0.96-0.88); crater=-14*(t*t*(3-2*t)); }
  const dL=dot3(dir,LAKE_DIR);
  let lake=0;
  if(dL>0.94) lake=-6;
  else if(dL>0.86) { const t=(dL-0.86)/(0.94-0.86); lake=-6*(t*t*(3-2*t)); }
  return hills + smallPeaks + mountains + crater + lake;
}

const keys: Record<string, boolean> = {};

export default function Player() {
  const { cameraView, entered, weatherPanelOpen, diaryOpen } = useGameState();
  const { camera, scene } = useThree();

  const playerPos = useRef(new THREE.Vector3(0, 0, 48)); // R=40 + altura
  const playerDir = useRef(new THREE.Vector3(1, 0, 0)); // Direção atual do modelo (suave)
  const targetDir = useRef(new THREE.Vector3(1, 0, 0)); // Direção desejada do input (WASD)
  
  const meshRef = useRef<THREE.Group>(null!);
  const raycaster = useRef(new THREE.Raycaster());

  // Configurações do Personagem
  const moveSpeed = 6;
  const turnSpeed = 8;
  const playerHeight = 0.3;  // quase tocando o bloco (o mesh compensa visualmente)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { 
      window.removeEventListener("keydown", onKeyDown); 
      window.removeEventListener("keyup", onKeyUp); 
    };
  }, []);

  useFrame((_, delta) => {
    if (!entered || weatherPanelOpen || diaryOpen || cameraView === "orbit") return;

    const pos = playerPos.current;
    
    // "Up" é a direção saindo do centro (0,0,0) para a posição atual
    const up = pos.clone().normalize();

    // Encontra o InstancedMesh do planeta para o Raycast
    const planetMesh = scene.getObjectByName("planetInstancedMesh") as THREE.InstancedMesh;
    
    // Input em 8 direções
    let moveF = 0, moveR = 0;
    if (keys["w"] || keys["arrowup"]) moveF += 1;
    if (keys["s"] || keys["arrowdown"]) moveF -= 1;
    if (keys["a"] || keys["arrowleft"]) moveR -= 1;
    if (keys["d"] || keys["arrowright"]) moveR += 1;

    // A direção de movimento deve ser sempre relativa à CÂMERA
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    camForward.sub(up.clone().multiplyScalar(camForward.dot(up))).normalize();
    
    // Se a câmera estiver olhando diretamente pra baixo, camForward zera. Fallback:
    if (camForward.lengthSq() < 0.01) {
      camForward.copy(playerDir.current);
    }
    
    const camRight = new THREE.Vector3().crossVectors(camForward, up).normalize();

    if (moveF !== 0 || moveR !== 0) {
      const inputDir = camForward.clone().multiplyScalar(moveF).add(camRight.clone().multiplyScalar(moveR)).normalize();
      
      // Posição candidata (onde o personagem QUER ir)
      const candidatePos = pos.clone().add(inputDir.clone().multiplyScalar(moveSpeed * delta));
      
      // Checa a altura do terreno na posição candidata
      const candDist = candidatePos.length();
      const cnx = candidatePos.x / candDist, cny = candidatePos.y / candDist, cnz = candidatePos.z / candDist;
      const candSurfaceH = R + terrainHeight(cnx, cny, cnz);
      
      // Checa a altura do terreno na posição atual
      const curDist = pos.length();
      const curNx = pos.x / curDist, curNy = pos.y / curDist, curNz = pos.z / curDist;
      const curSurfaceH = R + terrainHeight(curNx, curNy, curNz);
      
      // Diferença de altura entre destino e posição atual
      const heightDiff = candSurfaceH - curSurfaceH;
      
      // Se a subida for muito íngreme (parede), bloqueia o movimento
      // Permite subir rampas de até ~2 blocos de degrau
      if (heightDiff < 2.5) {
        pos.copy(candidatePos);
      }
      // Se bloqueou, o personagem simplesmente não se move (bate na parede)
      
      targetDir.current.copy(inputDir);
    }

    // Rotação suave
    playerDir.current.lerp(targetDir.current, delta * turnSpeed).normalize();

    // ─── PISADA NO CHÃO (instantâneo, sem flutuar) ───
    const pDist = pos.length();
    const pnx = pos.x / pDist, pny = pos.y / pDist, pnz = pos.z / pDist;
    const surfaceH = R + terrainHeight(pnx, pny, pnz);
    const targetDist = surfaceH + playerHeight;
    
    // Snap instantâneo pro chão — sem lerp lento que causa flutuação
    pos.normalize().multiplyScalar(targetDist);

    // ─── ATUALIZA MESH ───
    if (meshRef.current) {
      meshRef.current.position.copy(pos);
      
      // Orientação: "pé" aponta pro centro, "frente" aponta pra playerDir
      const lookTarget = pos.clone().add(playerDir.current);
      meshRef.current.up.copy(up);
      meshRef.current.lookAt(lookTarget);
    }

    // ─── CÂMERA ───
    // Forward tangencial (perpendicular a up) para a câmera
    const fwd = playerDir.current.clone();
    fwd.sub(up.clone().multiplyScalar(fwd.dot(up))).normalize();

    if (cameraView === "third") {
      // Posição ideal da câmera: atrás e acima do personagem
      const behind = fwd.clone().multiplyScalar(-5);
      const above = up.clone().multiplyScalar(3);
      const idealCamPos = pos.clone().add(behind).add(above);
      
      // Checa a altura do terreno na posição da câmera
      // Se a câmera ficar enterrada no chão, sobe ela
      const camPosDist = idealCamPos.length();
      const camNx = idealCamPos.x / camPosDist;
      const camNy = idealCamPos.y / camPosDist;
      const camNz = idealCamPos.z / camPosDist;
      const camTerrainH = R + terrainHeight(camNx, camNy, camNz);
      const minCamDist = camTerrainH + 1.5; // câmera nunca abaixo de 1.5 bloco do chão
      
      if (camPosDist < minCamDist) {
        // Câmera ia enterrar no chão — sobe ela
        idealCamPos.normalize().multiplyScalar(minCamDist);
      }

      camera.position.lerp(idealCamPos, Math.min(delta * 12, 1));

      // Foco: um pouco à frente do personagem, na altura dele
      const focusPoint = pos.clone()
        .add(fwd.clone().multiplyScalar(3))
        .add(up.clone().multiplyScalar(0.3));

      camera.up.copy(up);
      camera.lookAt(focusPoint);

    } else if (cameraView === "first") {
      // 1ª pessoa: olhos do personagem
      const eyeHeight = up.clone().multiplyScalar(0.6);
      camera.position.copy(pos.clone().add(eyeHeight));

      // Olha pra frente acompanhando a inclinação do terreno
      // Calcula a altura do terreno 5 blocos à frente
      const aheadPos = pos.clone().add(fwd.clone().multiplyScalar(5));
      const aheadDist = aheadPos.length();
      const anx = aheadPos.x / aheadDist, any2 = aheadPos.y / aheadDist, anz = aheadPos.z / aheadDist;
      const aheadTerrainH = R + terrainHeight(anx, any2, anz);
      const aheadUp = aheadPos.clone().normalize();
      
      // Ponto de foco na superfície à frente
      const lookPoint = aheadUp.clone().multiplyScalar(aheadTerrainH + 0.5);

      camera.up.copy(up);
      camera.lookAt(lookPoint);
    }
  });

  const showMesh = cameraView !== "first";

  return (
    <group ref={meshRef} visible={showMesh} scale={0.4}>
      {/* Corpo */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[1, 1.4, 0.8]} />
        <meshStandardMaterial color="#3b82f6" flatShading />
      </mesh>
      {/* Cabeça */}
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#fcd34d" flatShading />
      </mesh>
      {/* Pernas */}
      <mesh position={[-0.25, 0, 0]}>
        <boxGeometry args={[0.4, 0.8, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" flatShading />
      </mesh>
      <mesh position={[0.25, 0, 0]}>
        <boxGeometry args={[0.4, 0.8, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" flatShading />
      </mesh>
      {/* Braços */}
      <mesh position={[-0.7, 0.9, 0]}>
        <boxGeometry args={[0.3, 1.0, 0.4]} />
        <meshStandardMaterial color="#3b82f6" flatShading />
      </mesh>
      <mesh position={[0.7, 0.9, 0]}>
        <boxGeometry args={[0.3, 1.0, 0.4]} />
        <meshStandardMaterial color="#3b82f6" flatShading />
      </mesh>
    </group>
  );
}
