"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import {
  gameReducer,
  initialState,
  type GameState,
  type GameAction,
} from "@/store/gameStore";

const GameStateCtx    = createContext<GameState>(initialState);
const GameDispatchCtx = createContext<Dispatch<GameAction>>(() => {});

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Persiste progresso no LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("mpv_save");
    if (saved) {
      try {
        const { level, xp, xpToNext } = JSON.parse(saved);
        if (level > 1 || xp > 0) {
          dispatch({ type: "GAIN_XP", payload: 0 }); // sem-op para não quebrar estado
          // Aplica save manualmente (simplificado)
          localStorage.setItem("mpv_save", JSON.stringify({ level, xp, xpToNext }));
        }
      } catch { /* ignora save corrompido */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "mpv_save",
      JSON.stringify({ level: state.level, xp: state.xp, xpToNext: state.xpToNext })
    );
  }, [state.level, state.xp, state.xpToNext]);

  return (
    <GameStateCtx.Provider value={state}>
      <GameDispatchCtx.Provider value={dispatch}>
        {children}
      </GameDispatchCtx.Provider>
    </GameStateCtx.Provider>
  );
}

export const useGameState    = () => useContext(GameStateCtx);
export const useGameDispatch = () => useContext(GameDispatchCtx);
