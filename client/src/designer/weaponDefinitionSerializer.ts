import { HoldableObjectType, ShootingWeaponType, LauncherType } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { ALL_SHOOTING_WEAPONS } from "@/game/weapons/WeaponCatalog";

export function isShootingWeaponType(type: HoldableObjectType): type is ShootingWeaponType {
  return ALL_SHOOTING_WEAPONS.includes(type as ShootingWeaponType);
}

export function formatRatioPosition(pos: Vector2 | null): string {
  if (pos === null) return 'null';
  return `{ x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)} }`;
}

function buildSharedFields(type: HoldableObjectType): string {
  return [
    `  name: "${type.name}",`,
    `  size: ${type.size},`,
    `  svgPath: "${type.svgPath}",`,
    `  primaryHoldRatioPosition: ${formatRatioPosition(type.primaryHoldRatioPosition)},`,
    `  secondaryHoldRatioPosition: ${formatRatioPosition(type.secondaryHoldRatioPosition)},`,
  ].join('\n');
}

function buildGunFields(type: ShootingWeaponType): string {
  return [
    `  damage: ${type.damage},`,
    `  fireInterval: ${type.fireInterval},`,
    `  bulletSpeed: ${type.bulletSpeed},`,
    `  bulletSize: ${type.bulletSize},`,
    `  capacity: ${type.capacity},`,
    `  autoFiringType: '${type.autoFiringType}',`,
  ].join('\n');
}

function buildLauncherFields(type: LauncherType): string {
  return [
    `  rocketType: "${type.rocketType}",`,
    `  capacity: ${type.capacity},`,
    `  reloadAnimationDuration: ${type.reloadAnimationDuration},`,
  ].join('\n');
}

export function buildWeaponDefinition(type: HoldableObjectType): string {
  const shared = buildSharedFields(type);

  if (isShootingWeaponType(type)) {
    return `{\n${buildGunFields(type)}\n${shared}\n}`;
  }

  return `{\n${buildLauncherFields(type as LauncherType)}\n${shared}\n}`;
}
