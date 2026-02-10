import { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Player } from '@/game/entities/Player';
import { buildWeaponDefinition } from './weaponDefinitionSerializer';

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
    setDefinition(buildWeaponDefinition(playerRef.current.getHeldObject().type));
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
