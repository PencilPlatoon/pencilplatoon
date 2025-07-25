import { GamePhase } from "../lib/stores/useGameStore";
import { useAudio } from "../lib/stores/useAudio";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { useGameStore } from "../lib/stores/useGameStore";

interface GameUIProps {
  phase: GamePhase;
  onStart: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
  isInitialized: boolean;
}

export default function GameUI({ phase, onStart, onRestart, onNextLevel, isInitialized }: GameUIProps) {
  const { isSoundMuted, isMusicMuted, toggleSoundMute, toggleMusicMute } = useAudio();
  const debugMode = useGameStore((state) => state.debugMode);
  const toggleDebugMode = useGameStore((state) => state.toggleDebugMode);

  const SoundCheckbox = (
    <div className="flex items-center justify-center gap-2 mb-2">
      <Checkbox id="sound-toggle" checked={!isSoundMuted} onCheckedChange={toggleSoundMute} />
      <label htmlFor="sound-toggle" className="text-sm text-gray-800 select-none cursor-pointer">Sound Effects</label>
    </div>
  );
  const MusicCheckbox = (
    <div className="flex items-center justify-center gap-2 mb-2">
      <Checkbox id="music-toggle" checked={!isMusicMuted} onCheckedChange={toggleMusicMute} />
      <label htmlFor="music-toggle" className="text-sm text-gray-800 select-none cursor-pointer">Music</label>
    </div>
  );
  const DebugCheckbox = (
    <div className="flex items-center justify-center gap-2 mb-2">
      <Checkbox id="debug-mode" checked={debugMode} onCheckedChange={toggleDebugMode} />
      <label htmlFor="debug-mode" className="text-sm text-gray-800 select-none cursor-pointer">Debug Mode</label>
    </div>
  );

  const SoundIconCheckbox = (
    <div className="flex items-center justify-center">
      <Checkbox id="sound-toggle-icon" checked={!isSoundMuted} onCheckedChange={toggleSoundMute} />
      <label htmlFor="sound-toggle-icon" className="ml-2 text-lg select-none cursor-pointer">{isSoundMuted ? "🔇" : "🔊"}</label>
    </div>
  );
  const MusicIconCheckbox = (
    <div className="flex items-center justify-center">
      <Checkbox id="music-toggle-icon" checked={!isMusicMuted} onCheckedChange={toggleMusicMute} />
      <label htmlFor="music-toggle-icon" className="ml-2 text-lg select-none cursor-pointer">🎵</label>
    </div>
  );

  const CheckboxGroup = (
    <div className="flex flex-col items-start mx-auto mb-2" style={{width: 'fit-content'}}>
      {SoundCheckbox}
      {MusicCheckbox}
      {DebugCheckbox}
    </div>
  );

  if (!isInitialized) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <div className="text-lg font-bold mb-2">Loading...</div>
            <div className="text-sm text-gray-600 mb-4">Initializing game engine</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <h1 className="text-2xl font-bold mb-4 text-black">Pencil Platoon</h1>
            <div className="text-sm text-gray-600 mb-6">
              <p>Use WASD or Arrow Keys to move</p>
              <p>Space to jump</p>
              <p>J to shoot, I/K to aim up/down</p>
            </div>
            <Button onClick={onStart} variant="default" className="w-full mb-4 border border-primary">
              Start Game
            </Button>
            {CheckboxGroup}
            <div className="mt-8 text-xs text-gray-500">
              <div>Developed by Garrett Jones</div>
              <div className="mt-1">Artwork by Juancho Jones</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "levelComplete") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold mb-4 text-black">Level Complete!</h2>
            <div className="text-sm text-gray-600 mb-6">
              <p>Well done! You reached the end of the level.</p>
              <p>Ready for the next challenge?</p>
            </div>
            <Button onClick={onNextLevel} variant="default" className="w-full mb-4 border border-primary">
              Next Level
            </Button>
            <Button 
              onClick={onRestart} 
              variant="outline" 
              className="w-full mb-4"
            >
              Restart Game
            </Button>
            {CheckboxGroup}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold mb-4 text-black">Game Over</h2>
            <Button onClick={onRestart} variant="default" className="w-full mb-4 border border-primary">
              Play Again
            </Button>
            {CheckboxGroup}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Playing phase - show minimal UI
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
      {MusicIconCheckbox}
      {SoundIconCheckbox}
    </div>
  );
}
