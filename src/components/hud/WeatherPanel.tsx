"use client";

import { useGameState, useGameDispatch } from "@/context/GameContext";
import type { WeatherType } from "@/store/gameStore";
import { MapPin, X } from "lucide-react";

const WEATHERS: { type: WeatherType; label: string; emoji: string; color: string }[] = [
  { type: "sunny", label: "Ensolarado", emoji: "☀️", color: "border-yellow-400/50 bg-yellow-400/10 text-yellow-300" },
  { type: "rain",  label: "Chuva",      emoji: "🌧️", color: "border-sky-400/50 bg-sky-400/10 text-sky-300" },
  { type: "snow",  label: "Nevasca",    emoji: "❄️", color: "border-blue-300/50 bg-blue-300/10 text-blue-200" },
  { type: "fog",   label: "Névoa",      emoji: "🌫️", color: "border-slate-400/50 bg-slate-400/10 text-slate-300" },
  { type: "storm", label: "Tempestade", emoji: "⛈️", color: "border-violet-400/50 bg-violet-400/10 text-violet-300" },
];

export default function WeatherPanel() {
  const { weather, hour, realWeather } = useGameState();
  const dispatch = useGameDispatch();

  const pad = (n: number) => String(n).padStart(2, "0");
  const timeLabel = `${pad(hour)}:00`;

  return (
    <div className="slide-in-right absolute right-4 top-16 z-30 w-64 rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-md p-4 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">
          Modo Deus · Clima
        </h3>
        <button
          onClick={() => dispatch({ type: "TOGGLE_WEATHER_PANEL" })}
          className="p-1 rounded-lg hover:bg-white/10 transition text-slate-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Slider de hora */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
          <span>Hora do dia</span>
          <span className="text-slate-300 font-mono font-bold">{timeLabel}</span>
        </div>
        <input
          type="range" min={0} max={23} value={hour}
          onChange={(e) => dispatch({ type: "SET_HOUR", payload: Number(e.target.value) })}
          className="w-full h-1.5 rounded-full accent-sky-400 cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-slate-600 mt-1">
          <span>🌙 00h</span>
          <span>🌅 06h</span>
          <span>☀️ 12h</span>
          <span>🌆 18h</span>
          <span>🌙 23h</span>
        </div>
      </div>

      {/* Toggles de clima */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {WEATHERS.map((w) => (
          <button
            key={w.type}
            onClick={() => dispatch({ type: "SET_WEATHER", payload: w.type })}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all
              ${weather === w.type
                ? w.color + " scale-105 shadow-lg"
                : "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <span>{w.emoji}</span>
            <span>{w.label}</span>
          </button>
        ))}
      </div>

      {/* Sincronizar com clima real */}
      <button
        onClick={() => dispatch({ type: "TOGGLE_REAL_WEATHER" })}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all
          ${realWeather
            ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
            : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}
      >
        <MapPin className="w-3.5 h-3.5" />
        {realWeather ? "Clima Real Ativo" : "Sincronizar com Clima Real"}
      </button>
    </div>
  );
}
