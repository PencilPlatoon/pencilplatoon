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

function buildGunFields(type: ShootingWeaponType): string[] {
  const fields = [
    `  name: "${type.name}",`,
    `  damage: ${type.damage},`,
    `  fireInterval: ${type.fireInterval},`,
    `  bulletSpeed: ${type.bulletSpeed},`,
    `  bulletSize: ${type.bulletSize},`,
    `  size: ${type.size},`,
    `  svgPath: "${type.svgPath}",`,
    `  primaryHoldRatioPosition: ${formatRatioPosition(type.primaryHoldRatioPosition)},`,
    `  secondaryHoldRatioPosition: ${formatRatioPosition(type.secondaryHoldRatioPosition)},`,
    `  muzzleRatioPosition: ${formatRatioPosition(type.muzzleRatioPosition)},`,
    `  capacity: ${type.capacity},`,
    `  autoFiringType: '${type.autoFiringType}',`,
  ];
  if (type.soundEffect) fields.push(`  soundEffect: "${type.soundEffect}",`);
  if (type.pelletCount !== undefined) fields.push(`  pelletCount: ${type.pelletCount},`);
  if (type.spreadAngle !== undefined) fields.push(`  spreadAngle: ${type.spreadAngle},`);
  if (type.damageDropoff !== undefined) fields.push(`  damageDropoff: { effectiveRange: ${type.damageDropoff.effectiveRange}, minDamageRatio: ${type.damageDropoff.minDamageRatio} },`);
  if (type.casingCategory !== undefined) fields.push(`  casingCategory: '${type.casingCategory}',`);
  if (type.ejectionPortRatioPosition !== undefined) fields.push(`  ejectionPortRatioPosition: ${formatRatioPosition(type.ejectionPortRatioPosition)},`);
  return fields;
}

function buildLauncherFields(type: LauncherType): string[] {
  return [
    `  name: "${type.name}",`,
    `  rocketType: "${type.rocketType}",`,
    `  capacity: ${type.capacity},`,
    `  reloadAnimationDuration: ${type.reloadAnimationDuration},`,
    `  size: ${type.size},`,
    `  svgPath: "${type.svgPath}",`,
    `  primaryHoldRatioPosition: ${formatRatioPosition(type.primaryHoldRatioPosition)},`,
    `  secondaryHoldRatioPosition: ${formatRatioPosition(type.secondaryHoldRatioPosition)},`,
    `  muzzleRatioPosition: ${formatRatioPosition(type.muzzleRatioPosition)},`,
  ];
}

export function buildWeaponDefinition(type: HoldableObjectType): string {
  const fields = isShootingWeaponType(type)
    ? buildGunFields(type)
    : buildLauncherFields(type as LauncherType);
  return `{\n${fields.join('\n')}\n}`;
}
