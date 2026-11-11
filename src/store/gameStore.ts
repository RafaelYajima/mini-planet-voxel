"use client";
/**
 * gameStore.ts — estado global do jogo via React Context + useReducer.
 * Sem dependências externas (Zustand, Redux, etc.).
 */

export type WeatherType = "sunny" | "rain" | "snow" | "fog" | "storm";
export type ZoomLevel   = "macro" | "normal" | "micro";
export type CameraView  = "orbit" | "third" | "first";

export interface GameState {
  // Progressão
  level: number;
  xp: number;
  xpToNext: number;

  // Clima
  weather: WeatherType;
  hour: number;        // 0–23
  realWeather: boolean;

  // Câmera
  zoom: ZoomLevel;
  zenMode: boolean;

  // UI
  weatherPanelOpen: boolean;
  diaryOpen: boolean;
  entered: boolean;
  cameraView: CameraView;
}

export type GameAction =
  | { type: "ENTER" }
  | { type: "SET_WEATHER"; payload: WeatherType }
  | { type: "SET_HOUR"; payload: number }
  | { type: "TOGGLE_REAL_WEATHER" }
  | { type: "SET_ZOOM"; payload: ZoomLevel }
  | { type: "TOGGLE_ZEN" }
  | { type: "TOGGLE_WEATHER_PANEL" }
  | { type: "TOGGLE_DIARY" }
  | { type: "GAIN_XP"; payload: number }
  | { type: "TOGGLE_CAMERA_VIEW" };

export function xpForLevel(level: number) {
  return level * 100;
}

export const initialState: GameState = {
  level: 1,
  xp: 0,
  xpToNext: xpForLevel(1),
  weather: "sunny",
  hour: 12,
  realWeather: false,
  zoom: "normal",
  zenMode: false,
  weatherPanelOpen: false,
  diaryOpen: false,
  entered: false,
  cameraView: "orbit" as CameraView,
};

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "ENTER":
      return { ...state, entered: true };

    case "SET_WEATHER":
      return { ...state, weather: action.payload, realWeather: false };

    case "SET_HOUR":
      return { ...state, hour: Math.floor(action.payload) };

    case "TOGGLE_REAL_WEATHER":
      return { ...state, realWeather: !state.realWeather };

    case "SET_ZOOM":
      return { ...state, zoom: action.payload };

    case "TOGGLE_ZEN":
      return {
        ...state,
        zenMode: !state.zenMode,
        zoom: !state.zenMode ? "macro" : "normal",
        weatherPanelOpen: false,
        diaryOpen: false,
      };

    case "TOGGLE_WEATHER_PANEL":
      return { ...state, weatherPanelOpen: !state.weatherPanelOpen, diaryOpen: false };

    case "TOGGLE_DIARY":
      return { ...state, diaryOpen: !state.diaryOpen, weatherPanelOpen: false };

    case "GAIN_XP": {
      const newXp = state.xp + action.payload;
      if (newXp >= state.xpToNext) {
        const newLevel = state.level + 1;
        return {
          ...state,
          level: newLevel,
          xp: newXp - state.xpToNext,
          xpToNext: xpForLevel(newLevel),
        };
      }
      return { ...state, xp: newXp };
    }

    case "TOGGLE_CAMERA_VIEW": {
      const views: CameraView[] = ["orbit", "third", "first"];
      const idx = views.indexOf(state.cameraView);
      return { ...state, cameraView: views[(idx + 1) % views.length] };
    }

    default:
      return state;
  }
}
