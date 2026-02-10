import { useRef } from 'react';
import { DesignerModePositions } from './index';
import { Button } from '@/components/ui/button';
import { WeaponIcon } from './WeaponIcon';
import { WeaponDefinitionBox, WeaponDefinitionBoxRef } from './WeaponDefinitionBox';
import { useDesignerWeapon } from './hooks/useDesignerWeapon';
import { useControlDrag } from './hooks/useControlDrag';
import { useDesignerCanvas } from './hooks/useDesignerCanvas';
import { X } from 'lucide-react';

const { CANVAS_WIDTH, CANVAS_HEIGHT } = DesignerModePositions;

export function DesignerMode({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const weaponDefinitionBoxRef = useRef<WeaponDefinitionBoxRef>(null);

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

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          tabIndex={0}
          className="border-2 border-gray-300 shadow-lg"
        />
      </div>

      {/* Weapon definition text box */}
      <WeaponDefinitionBox ref={weaponDefinitionBoxRef} playerRef={playerRef} />

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 text-gray-800 text-sm bg-white p-4 rounded border border-gray-300 shadow-lg max-w-md">
        <p className="font-bold mb-2">Instructions:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Use Guns/Launchers to select category</li>
          <li>Click weapons at top to switch</li>
          <li>Drag red square (weapon position) to adjust primary hold</li>
          <li>Drag green square (secondary hand) to adjust secondary hold</li>
          <li>Copy weapon definition from text box (lower right)</li>
        </ul>
      </div>
    </div>
  );
}
