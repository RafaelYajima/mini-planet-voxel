"use client";

import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameState } from "@/context/GameContext";
import { getTerrainHeight } from "./Island";

const keys: Record<string, boolean> = {};

export default function Player() {
  const { cameraView, entered, weatherPanelOpen, diaryOpen } = useGameState();
  const { camera, gl } = useThree();

  const pos = useRef(new THREE.Vector3(0, 10, 0));
  const yaw = useRef(0);
  const pitch = useRef(-0.2);
  const velocity = useRef(new THREE.Vector3());
  const meshRef = useRef<THREE.Group>(null!);
  
  // Damping states
  const camPosSmooth = useRef(new THREE.Vector3());
  const camTargetSmooth = useRef(new THREE.Vector3());

  const SPEED = 12;
  const MOUSE_SENS = 0.0025;

  const requestLock = useCallback(() => {
    if (cameraView === "orbit" || !entered) return;
    gl.domElement.requestPointerLock();
  }, [gl, cameraView, entered]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const onUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= e.movementX * MOUSE_SENS;
      pitch.current -= e.movementY * MOUSE_SENS;
      pitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 3, pitch.current));
    };
    
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    document.addEventListener("mousemove", onMouseMove);
    gl.domElement.addEventListener("mousedown", requestLock);

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      document.removeEventListener("mousemove", onMouseMove);
      gl.domElement.removeEventListener("mousedown", requestLock);
    };
  }, [gl, requestLock]);

  useFrame((state, delta) => {
    if (!entered || weatherPanelOpen || diaryOpen || cameraView === "orbit") return;

    const p = pos.current;
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(-Math.cos(yaw.current), 0, Math.sin(yaw.current));

    // Movimento com aceleração
    const input = new THREE.Vector3();
    if (keys["w"]) input.add(forward);
    if (keys["s"]) input.sub(forward);
    if (keys["a"]) input.sub(right);
    if (keys["d"]) input.add(right);
    
    if (input.lengthSq() > 0) input.normalize();
    velocity.current.lerp(input.multiplyScalar(SPEED), delta * 10);
    p.add(velocity.current.clone().multiplyScalar(delta));

    // Terreno e colisão simples
    const h = getTerrainHeight(p.x, p.z);
    p.y = THREE.MathUtils.lerp(p.y, Math.max(h, -0.6), 0.2);

    // Mesh
    if (meshRef.current) {
      meshRef.current.position.copy(p);
      meshRef.current.rotation.y = yaw.current;
      // Balanço sutil ao andar
      const speedFactor = velocity.current.length();
      if (speedFactor > 0.1) {
        meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 10) * 0.05;
        meshRef.current.position.y += Math.abs(Math.sin(state.clock.elapsedTime * 10)) * 0.1;
      }
    }

    // Câmera Suavizada
    if (cameraView === "third") {
      const distance = 8;
      const height = 4;
      const camX = p.x + Math.sin(yaw.current) * distance * Math.cos(pitch.current);
      const camY = p.y + height + Math.sin(pitch.current) * distance;
      const camZ = p.z + Math.cos(yaw.current) * distance * Math.cos(pitch.current);
      
      const targetPos = new THREE.Vector3(camX, Math.max(camY, h + 2), camZ);
      camPosSmooth.current.lerp(targetPos, 0.15);
      camera.position.copy(camPosSmooth.current);
      
      const targetLookAt = p.clone().add(new THREE.Vector3(0, 1.5, 0));
      camTargetSmooth.current.lerp(targetLookAt, 0.2);
      camera.lookAt(camTargetSmooth.current);

    } else if (cameraView === "first") {
      camera.position.set(p.x, p.y + 1.6, p.z);
      const lookDir = new THREE.Vector3(-Math.sin(yaw.current), Math.sin(pitch.current), -Math.cos(yaw.current));
      camera.lookAt(p.clone().add(lookDir.multiplyScalar(10)));
    }
  });

  return (
    <group ref={meshRef} visible={cameraView !== "first"}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.8, 4, 8]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[0.5, 0.45, 0.4]} />
        <meshStandardMaterial color="#fcd34d" />
      </mesh>
    </group>
  );
}
