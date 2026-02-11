import { useRef, useState, useCallback, useEffect } from 'react';
import { DesignerModePositions } from './index';
import { isShootingWeaponType } from './index';
import { Button } from '@/components/ui/button';
import { WeaponIcon } from './WeaponIcon';
import { WeaponDefinitionBox, WeaponDefinitionBoxRef } from './WeaponDefinitionBox';
import { SoundSelector } from './SoundSelector';
import { useDesignerWeapon } from './hooks/useDesignerWeapon';
import { useControlDrag } from './hooks/useControlDrag';
import { useDesignerCanvas } from './hooks/useDesignerCanvas';
import { ShootingWeaponType } from '@/game/types/interfaces';
import { X } from 'lucide-react';

const { CANVAS_WIDTH, CANVAS_HEIGHT } = DesignerModePositions;

function useCoverScale(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(width / CANVAS_WIDTH, height / CANVAS_HEIGHT));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  return scale;
}

export function DesignerMode({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const weaponDefinitionBoxRef = useRef<WeaponDefinitionBoxRef>(null);
  const [assignedSound, setAssignedSound] = useState<string | null>(null);
  const coverScale = useCoverScale(canvasContainerRef);

  const onWeaponLoaded = () => weaponDefinitionBoxRef.current?.updateDefinition();
  const onControlMoved = () => weaponDefinitionBoxRef.current?.updateDefinition();

  const {
    selectedWeaponIndex,
    setSelectedWeaponIndex,
    selectedCategory,
    selectCategory,
    allWeapons,
    playerRef,
    controlsRef,
  } = useDesignerWeapon(onWeaponLoaded);

  // Sync assignedSound when weapon changes
  useEffect(() => {
    const weaponType = allWeapons[selectedWeaponIndex];
    if (weaponType && isShootingWeaponType(weaponType)) {
      setAssignedSound((weaponType as ShootingWeaponType).soundEffect ?? null);
    } else {
      setAssignedSound(null);
    }
  }, [selectedWeaponIndex, allWeapons]);

  const handleAssignSound = useCallback((filename: string | null) => {
    const weaponType = allWeapons[selectedWeaponIndex];
    if (weaponType && isShootingWeaponType(weaponType)) {
      (weaponType as ShootingWeaponType).soundEffect = filename ?? undefined;
      setAssignedSound(filename);
      weaponDefinitionBoxRef.current?.updateDefinition();
    }
  }, [allWeapons, selectedWeaponIndex]);

  const {
    hoveredControlRef,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
  } = useControlDrag(canvasRef, playerRef, controlsRef, onControlMoved);

  useDesignerCanvas(canvasRef, playerRef, controlsRef, hoveredControlRef, [selectedWeaponIndex, allWeapons]);

  return (
    <div className="fixed inset-0 bg-gray-100 flex flex-col">
      {/* Header with weapon selection */}
      <div className="bg-white border-b border-gray-300 shadow-md">
        <div className="flex items-center justify-between px-4 py-2">
          <h1 className="text-gray-800 text-xl font-bold">
            Weapon Designer Mode
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-800 hover:bg-gray-300"
            onClick={onExit}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Scrollable weapon selection with category buttons */}
        <div className="flex items-start gap-4 px-4 pb-4">
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant={selectedCategory === 'gun' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => selectCategory('gun')}
            >Guns</Button>
            <Button
              variant={selectedCategory === 'launcher' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => selectCategory('launcher')}
            >Launchers</Button>
          </div>
          <div className="overflow-x-auto flex-1">
            <div className="flex gap-4" style={{ minWidth: 'fit-content' }}>
              {allWeapons.map((weaponType, index) => (
                <WeaponIcon
                  key={index}
                  weaponType={weaponType}
                  isSelected={index === selectedWeaponIndex}
                  onClick={() => setSelectedWeaponIndex(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Canvas + side panels */}
      <div ref={canvasContainerRef} className="flex-1 relative min-h-0 overflow-hidden">
        {/* Canvas covers full area, centered in viewport */}
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          tabIndex={0}
          className="absolute left-1/2"
          style={{ top: '75%', transform: `translate(-50%, -50%) scale(${coverScale})` }}
        />

        {/* Sound selector floating on top */}
        <div className="absolute inset-y-0 left-0 z-10">
          <SoundSelector assignedSound={assignedSound} onAssign={handleAssignSound} />
        </div>

        {/* Weapon definition box floating at bottom right */}
        <div className="absolute bottom-0 right-0 z-10">
          <WeaponDefinitionBox ref={weaponDefinitionBoxRef} playerRef={playerRef} />
        </div>
      </div>
    </div>
  );
}
