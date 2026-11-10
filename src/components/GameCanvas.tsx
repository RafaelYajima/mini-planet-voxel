"use client";

import dynamic from "next/dynamic";
import { useGameState } from "@/context/GameContext";
import LoadingScreen from "./LoadingScreen";
import HUD from "./hud/HUD";

const VoxelPlanet = dynamic(() => import("./VoxelPlanet"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#05070f]" />,
});

export default function GameCanvas() {
  const { entered, weatherPanelOpen, diaryOpen } = useGameState();
  const lockCanvas = weatherPanelOpen || diaryOpen;

  return (
    <div className="fixed inset-0">
      {/* Canvas 3D — desabilitado enquanto paineis estao abertos */}
      <div className={lockCanvas ? "absolute inset-0 pointer-events-none" : "absolute inset-0"}>
        <VoxelPlanet />
      </div>

      {/* HUD sobreposta */}
      {entered && <HUD />}

      {/* Loading Screen */}
      {!entered && <LoadingScreen />}
    </div>
  );
}
