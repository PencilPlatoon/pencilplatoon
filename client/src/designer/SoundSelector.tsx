import { useState, useRef } from 'react';
import { Volume2, Square, Link } from 'lucide-react';

interface SoundSelectorProps {
  assignedSound: string | null;
  onAssign: (filename: string | null) => void;
}

const SOUND_FILES = [
  "ak-47-type-ii-3-round-burst-with-echo.mp3",
  "ak-47-type-ii-cocking-the-gun-mechanism.mp3",
  "ak-47-type-ii-empty-magazine.mp3",
  "ak-47-type-ii-firing-a-six-shot-burst.mp3",
  "ak-47-type-ii-firing-in-the-distance.mp3",
  "ak-47-type-ii-loading-one-bullet.mp3",
  "ak-47-type-ii-sniper-rifle-shot-with-echo.mp3",
  "ak-47-type-ii-switching-a-setting-on-the-gun.mp3",
  "ak47_1.mp3",
  "background.mp3",
  "benelli-nova-cocking-the-gun.mp3",
  "benelli-nova-firing-the-gun.mp3",
  "carl-gustaf-m-45-kpist-m-45-firing-a-shot.mp3",
  "charles-daly-601-cocking-the-mechanisim.mp3",
  "charles-daly-601-firing-a-shot.mp3",
  "charles-daly-601-loading-a-shell.mp3",
  "colt-m1911-wwi-spec-click-click-cocking-the-gun.mp3",
  "high-standard-h-dm-integrally-suppressed-firing-a-shot.mp3",
  "hit.mp3",
  "mosin-nagant-91-30-sniper-closing-the-bolt.mp3",
  "mosin-nagant-91-30-sniper-firing-the-gun.mp3",
  "mosin-nagant-91-30-sniper-opening-the-bolt.mp3",
  "ppsh-41-firing-a-3-shot-burst.mp3",
  "ppsh-41-firing-a-shot.mp3",
  "ppsh-41-firing-the-gun.mp3",
  "ruger-10-22-firing-the-gun-and-hitting-something.mp3",
  "ruger-10-22-some-kind-of-lever.mp3",
  "s-w-642-firing-the-gun.mp3",
  "s-w-642-spinning-the-cylinder.mp3",
  "savage-model-10-family-representative-firing-a-shot-with-echo.mp3",
  "savage-model-10-family-representative-some-kind-of-lever.mp3",
  "sks-carbine-cocking-the-gun.mp3",
  "sks-carbine-firing-a-shot.mp3",
  "type-99-rifle-closing-the-bolt.mp3",
  "type-99-rifle-empty-gun-sound.mp3",
  "type-99-rifle-firing-a-shot.mp3",
  "type-99-rifle-loading-bullets-into-the-gun.mp3",
  "type-99-rifle-opening-the-bolt.mp3",
  "winchester-model-1894-cocking-the-gun.mp3",
  "winchester-model-1894-firing-the-gun.mp3",
  "winchester-model-1894-open-lever-and-load-round.mp3",
];

function formatSoundName(filename: string): string {
  return filename.replace(/\.mp3$/, '');
}

export function SoundSelector({ assignedSound, onAssign }: SoundSelectorProps) {
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSound = (filename: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingFile === filename) {
      setPlayingFile(null);
      return;
    }

    const audio = new Audio(`sounds/${filename}`);
    audio.addEventListener('ended', () => setPlayingFile(null));
    audio.play();
    audioRef.current = audio;
    setPlayingFile(filename);
  };

  const handleAssign = (filename: string) => {
    onAssign(assignedSound === filename ? null : filename);
  };

  return (
    <div className="w-80 h-full bg-white border-r border-gray-300 flex flex-col min-h-0">
      <p className="font-bold text-gray-800 text-sm px-3 py-2 border-b border-gray-200 shrink-0">Sounds</p>
      <div className="overflow-y-auto">
        {SOUND_FILES.map((filename) => {
          const isAssigned = assignedSound === filename;
          const isPlaying = playingFile === filename;
          return (
            <div
              key={filename}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs ${
                isAssigned ? 'bg-green-50 text-green-800' : isPlaying ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <button onClick={() => playSound(filename)} className="shrink-0 hover:text-blue-600" title="Preview">
                {isPlaying
                  ? <Square className="h-3.5 w-3.5 fill-current" />
                  : <Volume2 className="h-3.5 w-3.5" />
                }
              </button>
              <span className="truncate flex-1">{formatSoundName(filename)}</span>
              <button
                onClick={() => handleAssign(filename)}
                className={`shrink-0 p-0.5 rounded ${isAssigned ? 'text-green-700 hover:text-green-900' : 'text-gray-400 hover:text-gray-700'}`}
                title={isAssigned ? 'Unassign sound' : 'Assign to weapon'}
              >
                <Link className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
