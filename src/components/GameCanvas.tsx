"use client";

import dynamic from "next/dynamic";
import { useGameState } from "@/context/GameContext";
import LoadingScreen from "./LoadingScreen";
import HUD from "./hud/HUD";

const Island = dynamic(() => import("./Island"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#87ceeb]" />,
});

export default function GameCanvas() {
  const { entered, weatherPanelOpen, diaryOpen } = useGameState();
  const lockCanvas = weatherPanelOpen || diaryOpen;

  return (
    <div className="fixed inset-0">
      <div className={lockCanvas ? "absolute inset-0 pointer-events-none" : "absolute inset-0"}>
        <Island />
      </div>

      {entered && <HUD />}
      {!entered && <LoadingScreen />}
    </div>
  );
}
