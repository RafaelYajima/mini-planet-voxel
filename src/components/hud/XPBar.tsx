"use client";

import { useGameState, useGameDispatch } from "@/context/GameContext";
import { Star } from "lucide-react";

export default function XPBar() {
  const { level, xp, xpToNext } = useGameState();
  const dispatch = useGameDispatch();
  const pct = Math.min((xp / xpToNext) * 100, 100);

  return (
    <div className="flex items-center gap-2">
      {/* Nível */}
      <button
        onClick={() => dispatch({ type: "GAIN_XP", payload: 10 })}
        title="[DEV] +10 XP"
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/30 hover:bg-amber-500/30 transition shrink-0"
      >
        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
      </button>

      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400">
            Nível {level}
          </span>
          <span className="text-[9px] text-slate-500">
            {xp}/{xpToNext} XP
          </span>
        </div>

        {/* Barra */}
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
