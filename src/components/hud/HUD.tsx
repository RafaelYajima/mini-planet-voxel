"use client";

import { useGameState, useGameDispatch } from "@/context/GameContext";
import XPBar       from "./XPBar";
import WeatherPanel from "./WeatherPanel";
import DiaryPanel   from "./DiaryPanel";
import {
  BookOpen, Cloud, Maximize2, Minimize2,
  ScanEye, ZoomIn, ZoomOut, Boxes,
} from "lucide-react";
import type { ZoomLevel } from "@/store/gameStore";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

const WEATHER_EMOJI: Record<string, string> = {
  sunny: "☀️", rain: "🌧️", snow: "❄️", fog: "🌫️", storm: "⛈️",
};

/** Impede que eventos de arraste/clique cheguem ao Canvas 3D */
function blockCanvas(e: ReactPointerEvent | ReactMouseEvent | ReactTouchEvent) {
  e.stopPropagation();
}

export default function HUD() {
  const state    = useGameState();
  const dispatch = useGameDispatch();

  const { zenMode, weatherPanelOpen, diaryOpen, weather, zoom, level } = state;

  return (
    <>
      {/* ══════════ ZEN MODE overlay ══════════ */}
      {zenMode && (
        <button
          onClick={() => dispatch({ type: "TOGGLE_ZEN" })}
          className="fixed bottom-6 right-6 z-40 px-4 py-2 rounded-xl border border-white/10 bg-slate-950/50 backdrop-blur text-xs text-slate-400 hover:text-white transition"
        >
          Sair do Modo Zen
        </button>
      )}

      {/* ══════════ HUD principal (oculto no Zen) ══════════ */}
      <div
        className={`fixed inset-0 pointer-events-none z-20 zen-fade ${
          zenMode ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* ── BARRA SUPERIOR ── */}
        <div
          className="pointer-events-auto absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-slate-950/60 backdrop-blur-md border-b border-white/5"
          onPointerDown={blockCanvas}
          onMouseDown={blockCanvas}
          onTouchStart={blockCanvas}
        >
          {/* Esquerda: Logo + Nível + XP */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-2">
              <Boxes className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-bold tracking-widest uppercase text-slate-200 hidden sm:block">
                Mini-planet Voxel
              </span>
            </div>
            <XPBar />
          </div>

          {/* Direita: botões de ação */}
          <div className="flex items-center gap-2">
            {/* Clima */}
            <button
              onClick={() => dispatch({ type: "TOGGLE_WEATHER_PANEL" })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition
                ${weatherPanelOpen
                  ? "border-sky-400/50 bg-sky-400/10 text-sky-300"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <span className="text-sm">{WEATHER_EMOJI[weather]}</span>
              <Cloud className="w-3.5 h-3.5" />
            </button>

            {/* Diário */}
            <button
              onClick={() => dispatch({ type: "TOGGLE_DIARY" })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition
                ${diaryOpen
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Diário</span>
            </button>

            {/* Zen */}
            <button
              onClick={() => dispatch({ type: "TOGGLE_ZEN" })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-xs font-medium transition"
            >
              <ScanEye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Zen</span>
            </button>
          </div>
        </div>

        {/* ── CONTROLES DE ZOOM (direita, meio) ── */}
        <div
          className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2"
          onPointerDown={blockCanvas}
          onMouseDown={blockCanvas}
          onTouchStart={blockCanvas}
        >
          {(["macro", "normal", "micro"] as ZoomLevel[]).map((z) => {
            const icons = { macro: Maximize2, normal: Minimize2, micro: ZoomIn };
            const labels = { macro: "Macro", normal: "Normal", micro: "Micro" };
            const Icon = icons[z];
            return (
              <button
                key={z}
                onClick={() => dispatch({ type: "SET_ZOOM", payload: z })}
                title={labels[z]}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition
                  ${zoom === z
                    ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                    : "border-white/8 bg-slate-950/60 text-slate-500 hover:text-slate-200 hover:bg-white/10"}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
          <button
            onClick={() => dispatch({ type: "TOGGLE_ZEN" })}
            title="Modo Zen"
            className="w-9 h-9 rounded-xl border border-white/8 bg-slate-950/60 text-slate-500 hover:text-slate-200 hover:bg-white/10 flex items-center justify-center transition mt-1"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* ── BARRA INFERIOR (Planet Info + Portal) ── */}
        <div
          className="pointer-events-auto absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-slate-950/60 backdrop-blur-md border-t border-white/5"
          onPointerDown={blockCanvas}
          onMouseDown={blockCanvas}
          onTouchStart={blockCanvas}
        >
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Planeta Atual</p>
            <p className="text-sm font-semibold text-slate-200">🌿 Oásis Vibrante</p>
          </div>

          <div className="flex items-center gap-3">
            {level >= 5 ? (
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold transition shadow-[0_0_20px_rgba(167,139,250,0.4)]">
                ✦ Ir para o Portal
              </button>
            ) : (
              <div className="flex flex-col items-end">
                <p className="text-[9px] text-slate-500">Portal bloqueado</p>
                <p className="text-xs text-slate-400 font-medium">Nível {level}/5 para avançar</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Painéis flutuantes ── */}
        {weatherPanelOpen && <WeatherPanel />}
        {diaryOpen        && <DiaryPanel />}
      </div>
    </>
  );
}
