import { useEffect, useRef, useState } from "react";
import GameCanvas from "./GameCanvas";
import GameUI from "./GameUI";
import MobileControls from "./MobileControls";
import { DesignerMode } from "./DesignerMode";
import { GameEngine } from "../game/GameEngine";
import { useGameStore } from "../lib/stores/useGameStore";
import { useAudio } from "../lib/stores/useAudio";
import { useIsMobile } from "../hooks/use-is-mobile";

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const [isGameInitialized, setIsGameInitialized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDesignerMode, setIsDesignerMode] = useState(false);
  const { phase, start, end, debugMode, restart, seed } = useGameStore();
  const { backgroundMusic, isMusicMuted } = useAudio();
  const isMobile = useIsMobile();

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
      gameEngineRef.current.startGame(seed);
      setIsPaused(false);
      start();
      gameEngineRef.current.start();
    }
  };

  const handleRestartLevel = () => {
    if (gameEngineRef.current) {
      restart();
      gameEngineRef.current.restartLevel(seed);
      setIsPaused(false);
      start();
      gameEngineRef.current.start();
    }
  };

  const handleRestartGame = () => {
    if (gameEngineRef.current) {
      restart();
      gameEngineRef.current.restartGame(seed);
      setIsPaused(false);
      start();
      gameEngineRef.current.start();
    }
  };

  const handleNextLevel = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.nextLevel(seed);
      setIsPaused(false);
      start();
      gameEngineRef.current.start();
    }
  };

  const handleMobileInput = (input: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    jump: boolean;
    triggerPressed: boolean;
    aimUp: boolean;
    aimDown: boolean;
  }) => {
    if (gameEngineRef.current) {
      gameEngineRef.current.updateMobileInput(input);
    }
  };

  const handleSwitchWeapon = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.switchWeapon();
    }
  };

  const handleReload = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.reloadWeapon();
    }
  };

  const handlePause = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.togglePause();
      setIsPaused(gameEngineRef.current.getPaused());
    }
  };

  const handleEnterDesigner = () => {
    setIsDesignerMode(true);
  };

  const handleExitDesigner = () => {
    setIsDesignerMode(false);
  };

  if (isDesignerMode) {
    return <DesignerMode onExit={handleExitDesigner} />;
  }

  return (
    <div className="relative w-full h-full">
      <GameCanvas ref={canvasRef} />
      <GameUI
        phase={phase}
        onStart={handleStartGame}
        onRestartLevel={handleRestartLevel}
        onRestartGame={handleRestartGame}
        onNextLevel={handleNextLevel}
        onSwitchWeapon={handleSwitchWeapon}
        onReload={handleReload}
        onPause={handlePause}
        onEnterDesigner={handleEnterDesigner}
        isPaused={isPaused}
        isInitialized={isGameInitialized}
      />
      {isMobile && phase === "playing" && (
        <MobileControls onInput={handleMobileInput} />
      )}
    </div>
  );
}
