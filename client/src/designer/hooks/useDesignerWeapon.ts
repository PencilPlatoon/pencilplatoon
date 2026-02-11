import { useEffect, useRef, useState } from 'react';
import { Player } from '@/game/entities/Player';
import { ShootingWeapon } from '@/game/weapons/ShootingWeapon';
import { LaunchingWeapon } from '@/game/weapons/LaunchingWeapon';
import { HoldableObjectType } from '@/game/types/interfaces';
import { ALL_SHOOTING_WEAPONS, ALL_LAUNCHERS } from '@/game/weapons/WeaponCatalog';
import { HumanFigure } from '@/rendering/HumanFigure';
import { MoveableControl } from '../MoveableControl';
import { WeaponPositionControl } from '../WeaponPositionControl';
import { SecondaryHandControl } from '../SecondaryHandControl';
import { MuzzlePositionControl } from '../MuzzlePositionControl';
import { EjectionPortControl } from '../EjectionPortControl';
import { DesignerModePositions } from '../DesignerModePositions';

const { FIGURE_CENTER_X, FIGURE_CENTER_Y } = DesignerModePositions;

export function useDesignerWeapon(onWeaponLoaded: () => void) {
  const [selectedWeaponIndex, setSelectedWeaponIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<'gun' | 'launcher'>('gun');
  const playerRef = useRef<Player | null>(null);
  const controlsRef = useRef<MoveableControl[]>([]);

  const allWeapons: HoldableObjectType[] = selectedCategory === 'gun' ? ALL_SHOOTING_WEAPONS : ALL_LAUNCHERS;

  useEffect(() => {
    window.__DEBUG_MODE__ = true;

    const playerY = FIGURE_CENTER_Y + (HumanFigure.FIGURE_HEIGHT / 2);
    const player = new Player(FIGURE_CENTER_X, playerY);
    playerRef.current = player;

    controlsRef.current = [
      new WeaponPositionControl(player),
      new SecondaryHandControl(player),
      new MuzzlePositionControl(player),
      new EjectionPortControl(player)
    ];

    return () => {
      window.__DEBUG_MODE__ = false;
    };
  }, []);

  useEffect(() => {
    if (!playerRef.current) return;
    const player = playerRef.current;

    player.setSelectedWeaponCategory(selectedCategory);

    if (selectedCategory === 'gun') {
      player.arsenal.currentWeaponIndex = selectedWeaponIndex;
      const newWeapon = new ShootingWeapon(ALL_SHOOTING_WEAPONS[selectedWeaponIndex]);
      player.arsenal.heldShootingWeapon = newWeapon;
      newWeapon.waitForLoaded().then(onWeaponLoaded);
    } else {
      player.arsenal.currentLauncherIndex = selectedWeaponIndex;
      const newLauncher = new LaunchingWeapon(ALL_LAUNCHERS[selectedWeaponIndex]);
      player.arsenal.heldLaunchingWeapon = newLauncher;
      player.arsenal.heldLaunchingWeapon.holder = playerRef.current;
      newLauncher.waitForLoaded().then(onWeaponLoaded);
    }
  }, [selectedWeaponIndex, selectedCategory]);

  const selectCategory = (category: 'gun' | 'launcher') => {
    setSelectedCategory(category);
    setSelectedWeaponIndex(0);
  };

  return {
    selectedWeaponIndex,
    setSelectedWeaponIndex,
    selectedCategory,
    selectCategory,
    allWeapons,
    playerRef,
    controlsRef,
  };
}
