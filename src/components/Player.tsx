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

function terrainHeight(nx:number, ny:number, nz:number): number {
  const dir:[number,number,number]=[nx,ny,nz];
  const hills = (fbm(nx*2.5, ny*2.5, nz*2.5, 4)-0.3)*8;
  const smallPeaks = Math.pow(Math.max(0, fbm(nx*5, ny*5, nz*5, 2)-0.4), 2)*15;
  const dH=dot3(dir,HOLE_DIR);
  let crater=0;
  if(dH>0.96) crater=-14;
  else if(dH>0.88) { const t=(dH-0.88)/(0.96-0.88); crater=-14*(t*t*(3-2*t)); }
  const dL=dot3(dir,LAKE_DIR);
  let lake=0;
  if(dL>0.94) lake=-6;
  else if(dL>0.86) { const t=(dL-0.86)/(0.94-0.86); lake=-6*(t*t*(3-2*t)); }
  return hills + smallPeaks + crater + lake;
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
  const moveSpeed = 6;       // bem mais lento = planeta parece gigante
  const turnSpeed = 8;
  const playerHeight = 1.0;  // mais perto do chão

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
      // Vetor de input relativo à câmera
      const inputDir = camForward.clone().multiplyScalar(moveF).add(camRight.clone().multiplyScalar(moveR)).normalize();
      
      // Move a posição
      pos.add(inputDir.clone().multiplyScalar(moveSpeed * delta));
      
      // Atualiza a direção alvo para onde o personagem quer olhar
      targetDir.current.copy(inputDir);
    }

    // Rotação suave do modelo em direção ao targetDir
    playerDir.current.lerp(targetDir.current, delta * turnSpeed).normalize();

    // ─── PISADA NO CHÃO (Raycaster Otimizado) ───
    if (planetMesh) {
      // Raio do topo do mundo (R+30) até o centro
      const rayOrigin = pos.clone().normalize().multiplyScalar(R + 30);
      const rayDir = up.clone().negate(); // aponta pro centro
      
      raycaster.current.set(rayOrigin, rayDir);
      const intersects = raycaster.current.intersectObject(planetMesh);
      
      let hitFloor = false;
      // Precisamos pegar a primeira intersecção que NÃO seja folha de árvore
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        
        // Pega a cor instanciada naquele hit
        const color = new THREE.Color();
        if (hit.instanceId !== undefined) {
          planetMesh.getColorAt(hit.instanceId, color);
          // Ignora a cor verde das folhas (C.leaf1, leaf2, leaf3, leafBright)
          // Simplificação: se for muito verde, provavelmente é folha
          if (color.g > color.r * 1.5 && color.g > color.b * 1.5 && hit.point.length() > R + 6) {
            continue; // É árvore, o raio passa direto
          }
        }
        
        // Se chegou aqui, bateu no chão ou no tronco
        const targetDist = hit.point.length() + playerHeight;
        
        // Suaviza a subida para não "quicar" nos degraus dos voxels
        const currentDist = pos.length();
        const newDist = THREE.MathUtils.lerp(currentDist, targetDist, delta * 15);
        
        pos.normalize().multiplyScalar(newDist);
        hitFloor = true;
        break;
      }
      
      if (!hitFloor) {
        // Fallback: matemática pura do terreno se o raycast falhar
        const nx = pos.x/pos.length(), ny = pos.y/pos.length(), nz = pos.z/pos.length();
        const fallbackDist = R + terrainHeight(nx, ny, nz) + playerHeight;
        pos.normalize().multiplyScalar(THREE.MathUtils.lerp(pos.length(), fallbackDist, delta * 15));
      }
    }

    // ─── ATUALIZA MESH ───
    if (meshRef.current) {
      meshRef.current.position.copy(pos);
      
      // Orientação: "pé" aponta pro centro, "frente" aponta pra playerDir
      const lookTarget = pos.clone().add(playerDir.current);
      meshRef.current.up.copy(up);
      meshRef.current.lookAt(lookTarget);
    }

    // ─── CÂMERA ───
    if (cameraView === "third") {
      // 3ª pessoa: mais baixa e mais próxima, olhando levemente pra baixo
      const behind = playerDir.current.clone().multiplyScalar(-6);  // perto das costas
      const above = up.clone().multiplyScalar(3);                    // pouco acima
      const targetCamPos = pos.clone().add(behind).add(above);
      camera.position.lerp(targetCamPos, delta * 6);
      // Olha um pouco à frente e abaixo do personagem (não no centro dele)
      const lookTarget = pos.clone().add(playerDir.current.clone().multiplyScalar(3));
      camera.lookAt(lookTarget);
      camera.up.copy(up);
    } else if (cameraView === "first") {
      // 1ª pessoa: nos olhos, olhando levemente pra baixo pra ver o chão
      const eyeOffset = up.clone().multiplyScalar(0.8);
      camera.position.copy(pos.clone().add(eyeOffset));
      // Olha pra frente mas um pouco pra baixo
      const lookDir = playerDir.current.clone().multiplyScalar(8);
      const lookDown = up.clone().multiplyScalar(-0.5);
      const lookPoint = pos.clone().add(lookDir).add(lookDown).add(eyeOffset);
      camera.lookAt(lookPoint);
      camera.up.copy(up);
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
