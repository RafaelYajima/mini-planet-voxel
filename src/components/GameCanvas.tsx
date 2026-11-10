"use client";

import dynamic from "next/dynamic";
import { useGameState } from "@/context/GameContext";
import LoadingScreen from "./LoadingScreen";
import HUD from "./hud/HUD";

// Canvas WebGL só existe no browser
const VoxelPlanet = dynamic(() => import("./VoxelPlanet"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#05070f]" />,
});

export default function GameCanvas() {
  const { entered } = useGameState();

  return (
    <div className="fixed inset-0">
      {/* Planeta 3D sempre montado em background */}
      <VoxelPlanet />

      {/* HUD sobreposta */}
      {entered && <HUD />}

      {/* Loading Screen por cima de tudo */}
      {!entered && <LoadingScreen />}
    </div>
  );
}
