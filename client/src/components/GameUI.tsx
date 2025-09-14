import { GamePhase } from "../lib/stores/useGameStore";
import { useAudio } from "../lib/stores/useAudio";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { useGameStore } from "../lib/stores/useGameStore";

interface GameUIProps {
  phase: GamePhase;
  onStart: () => void;
  onRestartLevel: () => void;
  onRestartGame: () => void;
  onNextLevel: () => void;
  onSwitchWeapon?: () => void;
  onReload?: () => void;
  onPause?: () => void;
  isPaused?: boolean;
  isInitialized: boolean;
}

export default function GameUI({ phase, onStart, onRestartLevel, onRestartGame, onNextLevel, onSwitchWeapon, onReload, onPause, isPaused, isInitialized }: GameUIProps) {
  const { isSoundMuted, isMusicMuted, toggleSoundMute, toggleMusicMute } = useAudio();
  const debugMode = useGameStore((state) => state.debugMode);
  const toggleDebugMode = useGameStore((state) => state.toggleDebugMode);
  const seed = useGameStore((state) => state.seed);
  const setSeed = useGameStore((state) => state.setSeed);
  const generateRandomSeed = useGameStore((state) => state.generateRandomSeed);

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
              <p>C to switch weapon, R to reload</p>
            </div>
            <Button onClick={onStart} variant="default" className="w-full mb-4 border border-primary">
              Start Game
            </Button>
            {CheckboxGroup}
            
            {/* Seed Input Section */}
            <div className="mb-4 text-left">
              <label htmlFor="seed-input" className="block text-sm font-medium text-gray-700 mb-2">
                Random Seed
              </label>
              <div className="flex gap-2">
                <Input
                  id="seed-input"
                  type="number"
                  value={seed}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value)) {
                      setSeed(value);
                    }
                  }}
                  className="flex-1"
                  placeholder="Enter seed number"
                />
                <Button
                  onClick={generateRandomSeed}
                  variant="outline"
                  size="sm"
                  className="px-3"
                  title="Generate new random seed"
                >
                  🎲
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Same seed = same level layout every time
              </p>
            </div>

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
            <div className="text-xs text-gray-500 mb-4">
              Seed: {seed}
            </div>
            <Button onClick={onNextLevel} variant="default" className="w-full mb-4 border border-primary">
              Next Level
            </Button>
            <Button 
              onClick={onRestartLevel} 
              variant="outline" 
              className="w-full mb-4"
            >
              Replay Level
            </Button>
            <Button 
              onClick={onRestartGame} 
              variant="outline" 
              className="w-full mb-4"
            >
              Restart Game From Beginning
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
            <div className="text-xs text-gray-500 mb-4">
              Seed: {seed}
            </div>
            <Button onClick={onRestartLevel} variant="default" className="w-full mb-4 border border-primary">
              Replay Level
            </Button>
            <Button onClick={onRestartGame} variant="outline" className="w-full mb-4">
              Restart Game From Beginning
            </Button>
            {CheckboxGroup}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Playing phase - show minimal UI
  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
      <div className="text-xs text-gray-500 bg-white bg-opacity-80 px-2 py-1 rounded">
        Seed: {seed}
      </div>
      {MusicIconCheckbox}
      {SoundIconCheckbox}
      {onPause && (
        <Button 
          onClick={onPause} 
          variant="outline" 
          size="sm"
          className="text-xs px-2 py-1"
        >
          {isPaused ? "▶️ Resume" : "⏸️ Pause"}
        </Button>
      )}
      {onSwitchWeapon && (
        <Button 
          onClick={onSwitchWeapon} 
          variant="outline" 
          size="sm"
          className="text-xs px-2 py-1"
        >
          🔄 Weapon
        </Button>
      )}
      {onReload && (
        <Button 
          onClick={onReload} 
          variant="outline" 
          size="sm"
          className="text-xs px-2 py-1"
        >
          🔄 Reload
        </Button>
      )}
    </div>
  );
}
