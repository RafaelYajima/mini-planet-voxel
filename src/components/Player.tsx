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
  const yaw = useRef(0);   // horizontal (mouse X)
  const pitch = useRef(-0.2); // vertical (mouse Y) — leve inclinação pra baixo
  const meshRef = useRef<THREE.Group>(null!);
  const isLocked = useRef(false);

  const SPEED = 8;
  const MOUSE_SENS = 0.002;
  const PLAYER_HEIGHT = 1.8;
  const EYE_HEIGHT = 1.6;
  const CAM_DISTANCE = 6;
  const CAM_HEIGHT = 3;

  // Pointer Lock para mouse look
  const requestLock = useCallback(() => {
    if (cameraView === "orbit") return;
    gl.domElement.requestPointerLock();
  }, [gl, cameraView]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const onUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= e.movementX * MOUSE_SENS;
      pitch.current -= e.movementY * MOUSE_SENS;
      pitch.current = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 3, pitch.current));
    };
    const onLockChange = () => {
      isLocked.current = document.pointerLockElement === gl.domElement;
    };
    const onClick = () => requestLock();

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    gl.domElement.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      gl.domElement.removeEventListener("click", onClick);
    };
  }, [gl, requestLock]);

  useFrame((_, delta) => {
    if (!entered || weatherPanelOpen || diaryOpen || cameraView === "orbit") return;

    const p = pos.current;

    // Forward e Right baseados no yaw (horizontal)
    const forward = new THREE.Vector3(
      -Math.sin(yaw.current), 0, -Math.cos(yaw.current)
    ).normalize();
    const right = new THREE.Vector3(
      -Math.cos(yaw.current), 0, Math.sin(yaw.current)
    ).normalize();

    // WASD move na direção que o jogador olha
    const moveDir = new THREE.Vector3(0, 0, 0);
    if (keys["w"] || keys["arrowup"]) moveDir.add(forward);
    if (keys["s"] || keys["arrowdown"]) moveDir.sub(forward);
    if (keys["a"] || keys["arrowleft"]) moveDir.sub(right);
    if (keys["d"] || keys["arrowright"]) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      p.add(moveDir.multiplyScalar(SPEED * delta));
    }

    // Clamp à ilha
    const maxDist = 85;
    const dist2d = Math.sqrt(p.x * p.x + p.z * p.z);
    if (dist2d > maxDist) {
      p.x *= maxDist / dist2d;
      p.z *= maxDist / dist2d;
    }

    // Gravidade: snap no terreno
    const groundH = getTerrainHeight(p.x, p.z);
    const waterLevel = -0.5;
    p.y = Math.max(groundH, waterLevel) + PLAYER_HEIGHT * 0.05;

    // Atualiza Modelo
    if (meshRef.current) {
      meshRef.current.position.set(p.x, p.y, p.z);
      meshRef.current.rotation.set(0, yaw.current, 0);
    }

    // Câmera
    if (cameraView === "third") {
      // 3ª pessoa: câmera atrás do jogador com mouse controlando ângulo
      const camX = p.x + Math.sin(yaw.current) * CAM_DISTANCE * Math.cos(pitch.current);
      const camY = p.y + CAM_HEIGHT + Math.sin(pitch.current) * CAM_DISTANCE;
      const camZ = p.z + Math.cos(yaw.current) * CAM_DISTANCE * Math.cos(pitch.current);

      // Garante câmera acima do chão
      const camGroundH = getTerrainHeight(camX, camZ);
      const finalCamY = Math.max(camY, camGroundH + 1.5);

      camera.position.lerp(new THREE.Vector3(camX, finalCamY, camZ), 0.15);
      camera.lookAt(p.x, p.y + 1, p.z);

    } else if (cameraView === "first") {
      // 1ª pessoa: nos olhos
      camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);

      // Direção de visão baseada em yaw + pitch
      const lookX = p.x - Math.sin(yaw.current) * 10;
      const lookY = p.y + EYE_HEIGHT + Math.sin(pitch.current) * 10;
      const lookZ = p.z - Math.cos(yaw.current) * 10;
      camera.lookAt(lookX, lookY, lookZ);
    }
  });

  const visible = cameraView !== "first";

  return (
    <group ref={meshRef} visible={visible}>
      {/* Corpo */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.35]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      {/* Cabeça */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#fcd34d" />
      </mesh>
      {/* Pernas */}
      <mesh position={[-0.12, 0.15, 0]} castShadow>
        <boxGeometry args={[0.2, 0.35, 0.25]} />
        <meshStandardMaterial color="#1e3a5f" />
      </mesh>
      <mesh position={[0.12, 0.15, 0]} castShadow>
        <boxGeometry args={[0.2, 0.35, 0.25]} />
        <meshStandardMaterial color="#1e3a5f" />
      </mesh>
      {/* Braços */}
      <mesh position={[-0.35, 0.65, 0]} castShadow>
        <boxGeometry args={[0.15, 0.5, 0.2]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0.35, 0.65, 0]} castShadow>
        <boxGeometry args={[0.15, 0.5, 0.2]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
    </group>
  );
}
