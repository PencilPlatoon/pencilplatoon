import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type GamePhase = "ready" | "playing" | "ended" | "levelComplete";

interface GameState {
  phase: GamePhase;
  score: number;
  enemiesKilled: number;
  currentLevel: number;
  
  // Debug mode
  debugMode: boolean;
  toggleDebugMode: () => void;
  
  // Actions
  start: () => void;
  restart: () => void;
  end: () => void;
  completeLevel: () => void;
  nextLevel: () => void;
  addScore: (points: number) => void;
  incrementEnemiesKilled: () => void;
}

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set) => ({
    phase: "ready",
    score: 0,
    enemiesKilled: 0,
    currentLevel: 1,
    debugMode: false,
    toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
    
    start: () => {
      set((state) => {
        if (state.phase === "ready" || state.phase === "levelComplete") {
          console.log("[useGameStore] phase -> playing");
          return { phase: "playing" };
        }
        return {};
      });
    },
    
    restart: () => {
      set(() => { 
        console.log("[useGameStore] phase -> ready (restart)");
        return { 
          phase: "ready",
          score: 0,
          enemiesKilled: 0,
          currentLevel: 1
        };
      });
    },
    
    end: () => {
      set((state) => {
        if (state.phase === "playing") {
          console.log("[useGameStore] phase -> ended");
          return { phase: "ended" };
        }
        return {};
      });
    },

    completeLevel: () => {
      set((state) => {
        if (state.phase === "playing") {
          console.log("[useGameStore] phase -> levelComplete");
          return { phase: "levelComplete" };
        }
        return {};
      });
    },

    nextLevel: () => {
      set((state) => ({
        currentLevel: state.currentLevel + 1,
        phase: "ready"
      }));
    },

    addScore: (points: number) => {
      set((state) => ({
        score: state.score + points
      }));
    },

    incrementEnemiesKilled: () => {
      set((state) => ({
        enemiesKilled: state.enemiesKilled + 1
      }));
    }
  }))
);
