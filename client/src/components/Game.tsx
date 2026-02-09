import { useEffect, useRef, useState } from "react";
import GameCanvas from "./GameCanvas";
import GameUI from "./GameUI";
import MobileControls from "./MobileControls";
import { DesignerMode } from "@/designer/DesignerMode";
import { GameEngine } from "@/game/GameEngine";
import { useGameStore } from "@/stores/useGameStore";
import { useAudio } from "@/stores/useAudio";
import { useIsMobile } from "@/hooks/useIsMobile";

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



  const executeGameAction = (action: (engine: GameEngine) => void) => {
    if (!gameEngineRef.current) return;
    action(gameEngineRef.current);
    setIsPaused(false);
    start();
    gameEngineRef.current.start();
  };

  const handleStartGame = () => executeGameAction(engine => engine.startGame(seed));
  const handleRestartLevel = () => executeGameAction(engine => { restart(); engine.restartLevel(seed); });
  const handleRestartGame = () => executeGameAction(engine => { restart(); engine.restartGame(seed); });
  const handleNextLevel = () => executeGameAction(engine => engine.nextLevel(seed));

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
