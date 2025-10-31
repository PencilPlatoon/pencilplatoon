import { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Player } from '../game/Player';

export interface WeaponDefinitionBoxRef {
  updateDefinition: () => void;
}

export const WeaponDefinitionBox = forwardRef<
  WeaponDefinitionBoxRef,
  { playerRef: React.RefObject<Player | null> }
>(({ playerRef }, ref) => {
  const [definition, setDefinition] = useState('');

  const updateWeaponDefinition = () => {
    if (!playerRef.current) return;
    
    // Grab currently held object to support both guns and launchers
    const held = (playerRef.current as any).getHeldObject?.() || playerRef.current.arsenal.heldShootingWeapon;
    const type = held.type;

    // Detect gun vs launcher by presence of gun-specific fields
    const isGun = typeof type.damage === 'number' && typeof type.fireInterval === 'number';

    const definitionText = isGun
      ? `{
  name: "${type.name}",
  damage: ${type.damage},
  fireInterval: ${type.fireInterval},
  bulletSpeed: ${type.bulletSpeed},
  bulletSize: ${type.bulletSize},
  size: ${type.size},
  svgPath: "${type.svgPath}",
  primaryHoldRatioPosition: { x: ${type.primaryHoldRatioPosition.x.toFixed(2)}, y: ${type.primaryHoldRatioPosition.y.toFixed(2)} },
  secondaryHoldRatioPosition: ${type.secondaryHoldRatioPosition !== null ? `{ x: ${type.secondaryHoldRatioPosition.x.toFixed(2)}, y: ${type.secondaryHoldRatioPosition.y.toFixed(2)} }` : 'null'},
  capacity: ${type.capacity},
  autoFiringType: '${type.autoFiringType}',
}`
      : `{
  name: "${type.name}",
  rocketType: "${type.rocketType}",
  capacity: ${type.capacity},
  reloadAnimationDuration: ${type.reloadAnimationDuration},
  size: ${type.size},
  svgPath: "${type.svgPath}",
  primaryHoldRatioPosition: { x: ${type.primaryHoldRatioPosition.x.toFixed(2)}, y: ${type.primaryHoldRatioPosition.y.toFixed(2)} },
  secondaryHoldRatioPosition: ${type.secondaryHoldRatioPosition !== null ? `{ x: ${type.secondaryHoldRatioPosition.x.toFixed(2)}, y: ${type.secondaryHoldRatioPosition.y.toFixed(2)} }` : 'null'}
}`;

    setDefinition(definitionText);
  };

  useImperativeHandle(ref, () => ({
    updateDefinition: updateWeaponDefinition
  }));

  useEffect(() => {
    updateWeaponDefinition();
  }, []);

  return (
    <div className="absolute bottom-4 right-4 w-[28.75rem] h-64 bg-white border border-gray-300 rounded p-4 shadow-lg">
      <textarea
        value={definition}
        readOnly
        className="w-full h-full bg-transparent text-gray-800 font-mono text-xs resize-none focus:outline-none"
        style={{ userSelect: 'text' }}
      />
    </div>
  );
});

WeaponDefinitionBox.displayName = 'WeaponDefinitionBox';
