import { useEffect, useRef, useState } from 'react';
import { Player } from '../game/Player';
import { ShootingWeapon } from '../game/ShootingWeapon';
import { LaunchingWeapon } from '../game/LaunchingWeapon';
import { Vector2, Vector2Utils } from '../game/Vector2';
import { MoveableControl, WeaponPositionControl, SecondaryHandControl, ControlId, DesignerModePositions } from '../designer';
import { HumanFigure } from '../figures/HumanFigure';
import { Button } from './ui/button';
import { WeaponIcon } from './WeaponIcon';
import { WeaponDefinitionBox, WeaponDefinitionBoxRef } from './WeaponDefinitionBox';
import { X } from 'lucide-react';

const { CANVAS_WIDTH, CANVAS_HEIGHT, FIGURE_CENTER_X, FIGURE_CENTER_Y } = DesignerModePositions;

export function DesignerMode({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedWeaponIndex, setSelectedWeaponIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<'gun' | 'launcher'>('gun');
  const [draggedControl, setDraggedControl] = useState<ControlId | null>(null);
  const [hoveredControl, setHoveredControl] = useState<ControlId | null>(null);
  const playerRef = useRef<Player | null>(null);
  const controlsRef = useRef<MoveableControl[]>([]);
  const weaponDefinitionBoxRef = useRef<WeaponDefinitionBoxRef>(null);
  
  // Refs to store current state for access from render loop
  const draggedControlRef = useRef<ControlId | null>(null);
  const hoveredControlRef = useRef<ControlId | null>(null);
  const dragOffsetRef = useRef<Vector2 | null>(null);

  const allWeapons = selectedCategory === 'gun' ? ShootingWeapon.ALL_WEAPONS : LaunchingWeapon.ALL_LAUNCHERS;
  
  const detectControlUnderMouse = (mousePos: Vector2): MoveableControl | null => {
    if (!playerRef.current) return null;
    
    for (const control of controlsRef.current) {
      if (control.isMouseWithin(mousePos)) {
        return control;
      }
    }
    
    return null;
  };

  useEffect(() => {
    // Enable debug mode
    window.__DEBUG_MODE__ = true;

    // Create player (aimAngle defaults to 0 for horizontal weapon)
    // Move player up by 50% of figure height
    const playerY = FIGURE_CENTER_Y + (HumanFigure.FIGURE_HEIGHT / 2);
    const player = new Player(FIGURE_CENTER_X, playerY);
    playerRef.current = player;

    // Create controls with player reference
    controlsRef.current = [
      new WeaponPositionControl(player),
      new SecondaryHandControl(player)
    ];

    return () => {
      window.__DEBUG_MODE__ = false;
    };
  }, []);

  useEffect(() => {
    if (!playerRef.current) return;

    const player = playerRef.current as any;

    if (selectedCategory === 'gun') {
      // Update player's selected category so correct object renders/positions
      player.selectedWeaponCategory = 'gun';
      player.arsenal.currentWeaponIndex = selectedWeaponIndex;
      const newWeapon = new ShootingWeapon(ShootingWeapon.ALL_WEAPONS[selectedWeaponIndex]);
      player.arsenal.heldShootingWeapon = newWeapon;
      newWeapon.waitForLoaded().then(() => {
        weaponDefinitionBoxRef.current?.updateDefinition();
      });
    } else {
      player.selectedWeaponCategory = 'launcher';
      player.arsenal.currentLauncherIndex = selectedWeaponIndex;
      const newLauncher = new LaunchingWeapon(LaunchingWeapon.ALL_LAUNCHERS[selectedWeaponIndex]);
      player.arsenal.heldLaunchingWeapon = newLauncher;
      // Ensure launcher attaches to player for transforms
      player.arsenal.heldLaunchingWeapon.holder = playerRef.current;
      newLauncher.waitForLoaded().then(() => {
        weaponDefinitionBoxRef.current?.updateDefinition();
      });
    }
  }, [selectedWeaponIndex, selectedCategory]);

  // Keep refs in sync with state
  useEffect(() => {
    draggedControlRef.current = draggedControl;
  }, [draggedControl]);

  useEffect(() => {
    hoveredControlRef.current = hoveredControl;
  }, [hoveredControl]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playerRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Get fresh state values from refs
      const currentHoveredControl = hoveredControlRef.current;
      
      ctx.save();
      DesignerModePositions.applyGameTransform(ctx);

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Draw background
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (playerRef.current) {
        // Debug mode is enabled, so player will render in dark pink and weapons will show bounding boxes
        playerRef.current.render(ctx, { skipHealthBar: true });

        for (const control of controlsRef.current) {
          const pos = control.getAbsPosition();
          if (pos) {
            const position = DesignerModePositions.gameToTransformedCanvas(pos);
            const isHovered = currentHoveredControl === control.id;
            control.render({ ctx, position, isHovered });
          }
        }

      }

      ctx.restore();

      requestAnimationFrame(render);
    };

    render();
  }, [selectedWeaponIndex, allWeapons]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!playerRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mousePos = DesignerModePositions.screenToGame({ x: e.clientX, y: e.clientY }, rect);
    
    // Update hover state
    if (!draggedControl) {
      const controlUnderMouse = detectControlUnderMouse(mousePos);
      setHoveredControl(controlUnderMouse?.id || null);
    }
    
    // Handle dragging
    if (draggedControl) {
      updateControlPosition(mousePos);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!playerRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mousePos = DesignerModePositions.screenToGame({ x: e.clientX, y: e.clientY }, rect);

    const controlUnderMouse = detectControlUnderMouse(mousePos);
    if (controlUnderMouse) {
      // Calculate and store the offset from mouse to control center
      const controlPos = controlUnderMouse.getAbsPosition();
      if (controlPos) {
        dragOffsetRef.current = Vector2Utils.subtract(mousePos, controlPos);
        setDraggedControl(controlUnderMouse.id);
      }
    }
  };

  const updateControlPosition = (mousePos: Vector2) => {
    if (!playerRef.current || !draggedControl || !dragOffsetRef.current) return;

    // Find and update the dragged control
    const control = controlsRef.current.find(c => c.id === draggedControl);
    if (control) {
      // Apply the stored offset to maintain relative position
      const controlPos = Vector2Utils.subtract(mousePos, dragOffsetRef.current);
      control.updateAbsPosition(controlPos);
      weaponDefinitionBoxRef.current?.updateDefinition();
    }
  };

  const handleMouseUp = () => {
    setDraggedControl(null);
    dragOffsetRef.current = null;
  };

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
              onClick={() => { setSelectedCategory('gun'); setSelectedWeaponIndex(0); }}
            >Guns</Button>
            <Button
              variant={selectedCategory === 'launcher' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => { setSelectedCategory('launcher'); setSelectedWeaponIndex(0); }}
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

