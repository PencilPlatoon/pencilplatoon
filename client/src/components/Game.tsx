import { useEffect, useRef, useState } from "react";
import GameCanvas from "./GameCanvas";
import GameUI from "./GameUI";
import { GameEngine } from "../game/GameEngine";
import { useGameStore } from "../lib/stores/useGameStore";
import { useAudio } from "../lib/stores/useAudio";

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const [isGameInitialized, setIsGameInitialized] = useState(false);
  const { phase, start, end, debugMode, restart } = useGameStore();
  const { backgroundMusic, isMusicMuted } = useAudio();

  useEffect(() => {
    if (canvasRef.current && !gameEngineRef.current) {
      gameEngineRef.current = new GameEngine(canvasRef.current);
      setIsGameInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (phase === "playing" && backgroundMusic && !isMusicMuted) {
      backgroundMusic.play().catch(console.log);
    } else if (backgroundMusic) {
      backgroundMusic.pause();
    }
  }, [phase, backgroundMusic, isMusicMuted]);

  useEffect(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.setDebugMode(debugMode);
    }
    window.__DEBUG_MODE__ = debugMode;
  }, [debugMode]);

  const handleStartGame = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.start();
      start();
    }
  };

  const handleRestartLevel = () => {
    if (gameEngineRef.current) {
      restart();
      gameEngineRef.current.restartLevel();
      start();
      gameEngineRef.current.start();
    }
  };

  const handleRestartGame = () => {
    if (gameEngineRef.current) {
      restart();
      gameEngineRef.current.restartGame();
      start();
      gameEngineRef.current.start();
    }
  };

  const handleNextLevel = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.nextLevel();
      start();
      gameEngineRef.current.start();
    }
  };

  return (
    <div className="relative w-full h-full">
      <GameCanvas ref={canvasRef} />
      <GameUI
        phase={phase}
        onStart={handleStartGame}
        onRestartLevel={handleRestartLevel}
        onRestartGame={handleRestartGame}
        onNextLevel={handleNextLevel}
        isInitialized={isGameInitialized}
      />
    </div>
  );
}
