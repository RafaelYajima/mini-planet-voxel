"use client";

import { useGameState, useGameDispatch } from "@/context/GameContext";
import { X, BookOpen, Lock } from "lucide-react";

const SECRETS = [
  {
    id: 1,
    planet: "Oásis Vibrante",
    hint: "Tente molhar o que está seco durante o crepúsculo...",
    discovered: false,
  },
  {
    id: 2,
    planet: "Oásis Vibrante",
    hint: "O que acontece quando a nevasca toca a areia do sul?",
    discovered: false,
  },
  {
    id: 3,
    planet: "Ecossistema Escasso",
    hint: "A tempestade revela o que o sol esconde nas pedras...",
    discovered: false,
  },
  {
    id: 4,
    planet: "Núcleo Synthwave",
    hint: "???",
    discovered: false,
    locked: true,
  },
];

export default function DiaryPanel() {
  const { level } = useGameState();
  const dispatch  = useGameDispatch();

  return (
    <div
      className="pointer-events-auto slide-in-right absolute right-4 top-16 z-30 w-72 rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-md shadow-2xl overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Capa do livro */}
      <div className="bg-gradient-to-br from-amber-900/40 to-amber-950/60 border-b border-amber-700/20 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-amber-200">Diário de Descobertas</h3>
          </div>
          <button
            onClick={() => dispatch({ type: "TOGGLE_DIARY" })}
            className="p-1 rounded-lg hover:bg-white/10 transition text-amber-400/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-amber-500/70 mt-1">
          {SECRETS.filter(s => s.discovered).length} de {SECRETS.length} segredos encontrados
        </p>
      </div>

      {/* Páginas */}
      <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
        {SECRETS.map((s) => (
          <div
            key={s.id}
            className={`rounded-xl border p-3 ${
              s.locked && level < 5
                ? "border-slate-700/30 bg-slate-900/30"
                : s.discovered
                  ? "border-amber-400/20 bg-amber-400/5"
                  : "border-white/5 bg-white/5"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  {s.planet}
                </p>
                {s.locked && level < 5 ? (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Lock className="w-3 h-3" />
                    <span className="text-xs italic">Requer Nível 5 para revelar</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic leading-relaxed">
                    "{s.hint}"
                  </p>
                )}
              </div>
              <div className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${
                s.discovered ? "border-amber-400 bg-amber-400/20" : "border-slate-700"
              }`}>
                {s.discovered && <span className="text-[8px]">✦</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 px-4 py-3">
        <p className="text-[9px] text-slate-600 italic text-center">
          "O planeta guarda mais segredos do que parece..."
        </p>
      </div>
    </div>
  );
}
