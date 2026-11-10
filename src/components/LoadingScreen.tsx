"use client";

import { useEffect, useState } from "react";
import { useGameDispatch } from "@/context/GameContext";

const BLOCKS = [
  { color: "bg-emerald-500", delay: "0ms",   x: "left-[38%]", y: "top-[52%]" },
  { color: "bg-green-600",   delay: "80ms",  x: "left-[42%]", y: "top-[48%]" },
  { color: "bg-emerald-400", delay: "160ms", x: "left-[46%]", y: "top-[52%]" },
  { color: "bg-sky-500",     delay: "240ms", x: "left-[42%]", y: "top-[56%]" },
  { color: "bg-green-700",   delay: "320ms", x: "left-[38%]", y: "top-[60%]" },
  { color: "bg-emerald-300", delay: "400ms", x: "left-[46%]", y: "top-[60%]" },
  { color: "bg-sky-400",     delay: "480ms", x: "left-[50%]", y: "top-[48%]" },
  { color: "bg-green-500",   delay: "560ms", x: "left-[50%]", y: "top-[56%]" },
  { color: "bg-emerald-600", delay: "640ms", x: "left-[34%]", y: "top-[56%]" },
];

export default function LoadingScreen() {
  const dispatch = useGameDispatch();
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(interval); setReady(true); return 100; }
        return p + 2;
      });
    }, 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070f] select-none">
      {/* Estrelas de fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() > 0.8 ? 2 : 1,
              height: Math.random() > 0.8 ? 2 : 1,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.6 + 0.1,
            }}
          />
        ))}
      </div>

      {/* Blocos voxel se montando */}
      <div className="relative w-48 h-48 mb-8">
        {BLOCKS.map((b, i) => (
          <div
            key={i}
            className={`block-rise absolute w-7 h-7 rounded-sm shadow-lg ${b.color} ${b.x} ${b.y}`}
            style={{ animationDelay: b.delay, opacity: 0 }}
          />
        ))}
        {/* Sombra do planeta */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-3 bg-black/30 rounded-full blur-md" />
      </div>

      {/* Título */}
      <h1 className="text-2xl font-bold tracking-widest uppercase mb-1 text-slate-100">
        Mini-planet Voxel
      </h1>
      <p className="text-xs text-slate-500 mb-8 tracking-wider">
        🎧 Use fones de ouvido para uma melhor experiência
      </p>

      {/* Barra de progresso */}
      <div className="w-56 h-1.5 bg-slate-800 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Botão de entrada */}
      {ready ? (
        <button
          onClick={() => dispatch({ type: "ENTER" })}
          className="mt-2 px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-xl text-sm tracking-wide transition-all duration-200 shadow-[0_0_24px_rgba(52,211,153,0.4)] hover:shadow-[0_0_32px_rgba(52,211,153,0.6)] hover:scale-105 active:scale-95"
        >
          Entrar no Planeta ✦
        </button>
      ) : (
        <p className="text-xs text-slate-600 tracking-widest">
          {progress < 50 ? "Gerando terreno..." : progress < 85 ? "Plantando árvores..." : "Ajustando clima..."}
        </p>
      )}
    </div>
  );
}
