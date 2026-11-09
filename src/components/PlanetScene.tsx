"use client";

import dynamic from "next/dynamic";

// O canvas WebGL só existe no browser — importamos sem SSR.
const VoxelPlanet = dynamic(() => import("./VoxelPlanet"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400" />
    </div>
  ),
});

export default function PlanetScene() {
  return <VoxelPlanet />;
}
