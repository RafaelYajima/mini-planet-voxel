"use client";

import { useGameState, useGameDispatch } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";
import { MapPin, X } from "lucide-react";

const WEATHERS: { type: WeatherType; label: string; emoji: string; active: string }[] = [
  { type: "sunny", label: "Ensolarado", emoji: "☀️", active: "border-yellow-400/60 bg-yellow-500/15 text-yellow-200 shadow-[0_0_12px_rgba(250,204,21,0.2)]" },
  { type: "rain",  label: "Chuva",      emoji: "🌧️", active: "border-sky-400/60 bg-sky-500/15 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.2)]" },
  { type: "snow",  label: "Nevasca",    emoji: "❄️", active: "border-blue-300/60 bg-blue-400/15 text-blue-100 shadow-[0_0_12px_rgba(147,197,253,0.2)]" },
  { type: "fog",   label: "Névoa",      emoji: "🌫️", active: "border-slate-300/60 bg-slate-400/15 text-slate-200 shadow-[0_0_12px_rgba(148,163,184,0.15)]" },
  { type: "storm", label: "Tempestade", emoji: "⛈️", active: "border-violet-400/60 bg-violet-500/15 text-violet-200 shadow-[0_0_12px_rgba(167,139,250,0.2)]" },
];

export default function WeatherPanel() {
  const { weather, hour, realWeather } = useGameState();
  const dispatch = useGameDispatch();

  const pad = (n: number) => String(n).padStart(2, "0");

  // Ícone de período do dia
  const periodIcon =
    hour >= 6 && hour < 12 ? "🌅" :
    hour >= 12 && hour < 18 ? "☀️" :
    hour >= 18 && hour < 21 ? "🌆" : "🌙";

  return (
    <div
      className="pointer-events-auto slide-in-right absolute right-4 top-16 z-30 w-72 rounded-2xl border border-white/10 bg-[#0a0c14]/95 backdrop-blur-xl p-5 shadow-2xl"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
          ⚡ Modo Deus
        </h3>
        <button
          onClick={() => dispatch({ type: "TOGGLE_WEATHER_PANEL" })}
          className="p-1.5 rounded-lg hover:bg-white/10 transition text-slate-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Slider de hora ── */}
      <div className="mb-5 bg-white/[0.03] rounded-xl p-3 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Hora do dia</span>
          <span className="flex items-center gap-1.5 text-lg font-mono font-bold text-white">
            {periodIcon} {pad(hour)}:00
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={hour}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onInput={(e) => {
            const val = parseInt(e.currentTarget.value, 10);
            dispatch({ type: "SET_HOUR", payload: val });
          }}
          onChange={(e) => {
            const val = parseInt(e.currentTarget.value, 10);
            dispatch({ type: "SET_HOUR", payload: val });
          }}
          className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-800 touch-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400
            [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(56,189,248,0.5)] [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-sky-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
        />

        <div className="flex justify-between text-[9px] text-slate-600 mt-2 font-medium px-0.5">
          <span>🌙 00h</span>
          <span>🌅 06h</span>
          <span>☀️ 12h</span>
          <span>🌆 18h</span>
          <span>🌙 23h</span>
        </div>
      </div>

      {/* ── Toggles de clima ── */}
      <div className="mb-4">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 block">
          Clima
        </span>
        <div className="grid grid-cols-2 gap-2">
          {WEATHERS.map((w) => {
            const isActive = weather === w.type;
            return (
              <button
                key={w.type}
                onClick={() => dispatch({ type: "SET_WEATHER", payload: w.type })}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-200
                  ${isActive
                    ? w.active
                    : "border-white/5 bg-white/[0.03] text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"}`}
              >
                <span className="text-base">{w.emoji}</span>
                <span>{w.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sincronizar com clima real ── */}
      <button
        onClick={() => dispatch({ type: "TOGGLE_REAL_WEATHER" })}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200
          ${realWeather
            ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
            : "border-white/8 bg-white/[0.03] text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"}`}
      >
        <MapPin className="w-3.5 h-3.5" />
        {realWeather ? "✦ Clima Real Ativo" : "Sincronizar Clima Real"}
      </button>
    </div>
  );
}
