import { ShootingWeaponType, GrenadeType, RocketType, LauncherType } from "@/game/types/interfaces";

// ── Shooting Weapons ──────────────────────────────────────────────

export const WEBLEY_REVOLVER: ShootingWeaponType = {
  name: "Webley",
  damage: 20,
  fireInterval: 300,
  bulletSpeed: 600,
  bulletSize: 2,
  size: 20,
  svgPath: "svg/webley.svg",
  primaryHoldRatioPosition: { x: 0.17, y: 0.52 },
  secondaryHoldRatioPosition: null,
  muzzleRatioPosition: { x: 1.00, y: 0.70 },
  capacity: 7,
  autoFiringType: 'semi-auto',
};

export const RIFLE_A_MAIN_OFFENSIVE: ShootingWeaponType = {
  name: "Rifle a main offensive",
  damage: 30,
  fireInterval: 200,
  bulletSpeed: 800,
  bulletSize: 3,
  size: 50,
  svgPath: "svg/rifle-a-main-offensive.svg",
  primaryHoldRatioPosition: { x: 0.32, y: 0.36 },
  secondaryHoldRatioPosition: { x: 0.63, y: 0.35 },
  muzzleRatioPosition: { x: 1.00, y: 0.56 },
  capacity: 30,
  autoFiringType: 'auto',
}

export const FNAF_BATTLE_RIFLE: ShootingWeaponType = {
  name: "FNAF Battle Rifle",
  damage: 25,
  fireInterval: 150,
  bulletSpeed: 800,
  bulletSize: 3,
  size: 70,
  svgPath: "svg/fnaf-battle-rifle.svg",
  primaryHoldRatioPosition: { x: 0.35, y: 0.38 },
  secondaryHoldRatioPosition: { x: 0.59, y: 0.35 },
  muzzleRatioPosition: { x: 1.00, y: 0.42 },
  capacity: 20,
  autoFiringType: 'auto',
}

export const AK200_ASSAULT_RIFLE: ShootingWeaponType = {
  name: "AK-200 Assault Rifle",
  damage: 20,
  fireInterval: 150,
  bulletSpeed: 800,
  bulletSize: 3,
  size: 70,
  svgPath: "svg/ak-200.svg",
  primaryHoldRatioPosition: { x: 0.39, y: 0.37 },
  secondaryHoldRatioPosition: { x: 0.64, y: 0.46 },
  muzzleRatioPosition: { x: 0.99, y: 0.53 },
  capacity: 32,
  autoFiringType: 'auto',
};

export const M9_JOHNSON: ShootingWeaponType = {
  name: "M9 Johnson",
  damage: 45,
  fireInterval: 500,
  bulletSpeed: 800,
  bulletSize: 3,
  size: 70,
  svgPath: "svg/m9-johnson.svg",
  primaryHoldRatioPosition: { x: 0.36, y: 0.40 },
  secondaryHoldRatioPosition: { x: 0.56, y: 0.39 },
  muzzleRatioPosition: { x: 1.00, y: 0.44 },
  capacity: 10,
  autoFiringType: 'semi-auto',
};

export const M7_CARBINE: ShootingWeaponType = {
  name: "M7 Carbine",
  damage: 36,
  fireInterval: 300,
  bulletSpeed: 800,
  bulletSize: 3,
  size: 70,
  svgPath: "svg/m7-carbine.svg",
  primaryHoldRatioPosition: { x: 0.40, y: 0.72 },
  secondaryHoldRatioPosition: { x: 0.66, y: 0.47 },
  muzzleRatioPosition: { x: 1.00, y: 0.75 },
  capacity: 15,
  autoFiringType: 'semi-auto',
};

export const HARMANN_AND_WOLFFS_BOLT_ACTION_RIFLE: ShootingWeaponType = {
  name: "Harmann and Wolffs Bolt Action Rifle",
  damage: 20,
  fireInterval: 750,
  bulletSpeed: 800,
  bulletSize: 3,
  size: 70,
  svgPath: "svg/harmann-and-wolffs-bolt-action-rifle.svg",
  primaryHoldRatioPosition: { x: 0.45, y: 0.42 },
  secondaryHoldRatioPosition: { x: 0.62, y: 0.44 },
  muzzleRatioPosition: { x: 1.00, y: 0.44 },
  capacity: 5,
  autoFiringType: 'semi-auto',
};

export const M270_BREACHER_SHOTGUN: ShootingWeaponType = {
  name: "M270 Breacher",
  damage: 90,
  fireInterval: 1000,
  bulletSpeed: 600,
  bulletSize: 4,
  size: 50,
  svgPath: "svg/m270-breacher.svg",
  primaryHoldRatioPosition: { x: 0.42, y: 0.51 },
  secondaryHoldRatioPosition: { x: 0.72, y: 0.46 },
  muzzleRatioPosition: { x: 1.00, y: 0.74 },
  capacity: 8,
  autoFiringType: 'semi-auto',
  pelletCount: 6,
  spreadAngle: 0.26,
  damageDropoff: { effectiveRange: 200, minDamageRatio: 0.1 },
};

export const R_200_SHOTGUN: ShootingWeaponType = {
  name: "R-200",
  damage: 60,
  fireInterval: 1000,
  bulletSpeed: 600,
  bulletSize: 4,
  size: 60,
  svgPath: "svg/r-200.svg",
  primaryHoldRatioPosition: { x: 0.13, y: 0.42 },
  secondaryHoldRatioPosition: { x: 0.47, y: 0.38 },
  muzzleRatioPosition: { x: 1.00, y: 0.70 },
  capacity: 15,
  autoFiringType: 'semi-auto',
  pelletCount: 5,
  spreadAngle: 0.21,
  damageDropoff: { effectiveRange: 200, minDamageRatio: 0.1 },
};

export const MR_27_DRUMBEAT_SHOTGUN: ShootingWeaponType = {
  name: "MR-27 Drumbeat",
  damage: 160,
  fireInterval: 1500,
  bulletSpeed: 600,
  bulletSize: 4,
  size: 80,
  svgPath: "svg/mr-27-drumbeat.svg",
  primaryHoldRatioPosition: { x: 0.25, y: 0.48 },
  secondaryHoldRatioPosition: { x: 0.43, y: 0.18 },
  muzzleRatioPosition: { x: 0.98, y: 0.69 },
  capacity: 30,
  autoFiringType: 'semi-auto',
  pelletCount: 8,
  spreadAngle: 0.31,
  damageDropoff: { effectiveRange: 200, minDamageRatio: 0.1 },
};

export const PTS_27_ANTITANK_GUN: ShootingWeaponType = {
  name: "PTS-27 Antitank Gun",
  damage: 60,
  fireInterval: 2000,
  bulletSpeed: 1000,
  bulletSize: 5,
  size: 70,
  svgPath: "svg/pts-27.svg",
  primaryHoldRatioPosition: { x: 0.23, y: 0.33 },
  secondaryHoldRatioPosition: { x: 0.42, y: 0.41 },
  muzzleRatioPosition: { x: 1.00, y: 0.44 },
  capacity: 12,
  autoFiringType: 'semi-auto',
};

export const BROWNING_MK3_MACHINE_GUN: ShootingWeaponType = {
  name: "Browning Mk3",
  damage: 15,
  fireInterval: 100,
  bulletSpeed: 700,
  bulletSize: 3,
  size: 60,
  svgPath: "svg/browning-mk3.svg",
  primaryHoldRatioPosition: { x: 0.29, y: 0.30 },
  secondaryHoldRatioPosition: { x: 0.54, y: 0.44 },
  muzzleRatioPosition: { x: 1.0, y: 0.5 },
  capacity: 100,
  autoFiringType: 'auto',
};

export const VP_37_SUBMACHINE_GUN: ShootingWeaponType = {
  name: "VP-37",
  damage: 7,
  fireInterval: 50,
  bulletSpeed: 700,
  bulletSize: 3,
  size: 45,
  svgPath: "svg/vp-37.svg",
  primaryHoldRatioPosition: { x: 0.43, y: 0.35 },
  secondaryHoldRatioPosition: { x: 0.64, y: 0.39 },
  muzzleRatioPosition: { x: 1.00, y: 0.67 },
  capacity: 20,
  autoFiringType: 'auto',
};

export const MK_200_SNIPER_RIFLE: ShootingWeaponType = {
  name: "MK. 200 Sniper Rifle",
  damage: 36,
  fireInterval: 500,
  bulletSpeed: 1200,
  bulletSize: 3,
  size: 70,
  svgPath: "svg/mk-200.svg",
  primaryHoldRatioPosition: { x: 0.30, y: 0.47 },
  secondaryHoldRatioPosition: { x: 0.53, y: 0.54 },
  muzzleRatioPosition: { x: 0.99, y: 0.62 },
  capacity: 6,
  autoFiringType: 'semi-auto',
};

export const ALL_SHOOTING_WEAPONS: ShootingWeaponType[] = [
  WEBLEY_REVOLVER,
  RIFLE_A_MAIN_OFFENSIVE,
  FNAF_BATTLE_RIFLE,
  AK200_ASSAULT_RIFLE,
  M9_JOHNSON,
  M7_CARBINE,
  HARMANN_AND_WOLFFS_BOLT_ACTION_RIFLE,
  M270_BREACHER_SHOTGUN,
  R_200_SHOTGUN,
  MR_27_DRUMBEAT_SHOTGUN,
  PTS_27_ANTITANK_GUN,
  BROWNING_MK3_MACHINE_GUN,
  VP_37_SUBMACHINE_GUN,
  MK_200_SNIPER_RIFLE,
];

// ── Grenades ──────────────────────────────────────────────────────

export const HAND_GRENADE: GrenadeType = {
  name: "Hand Grenade",
  damage: 150,
  explosionRadius: 200,
  explosionDelay: 3,
  size: 10,
  svgPath: "svg/grenade.svg",
  primaryHoldRatioPosition: { x: 0.5, y: 0.5 },
  secondaryHoldRatioPosition: null,
  muzzleRatioPosition: { x: 1.0, y: 0.5 },
};

export const ALL_GRENADES: GrenadeType[] = [
  HAND_GRENADE,
];

// ── Rockets ───────────────────────────────────────────────────────

export const STANDARD_ROCKET: RocketType = {
  name: "RPG-8 Rocket",
  damage: 150,
  explosionRadius: 250,
  speed: 400,
  size: 40,
  svgPath: "svg/rpg-8-rocket.svg",
};

export const ALL_ROCKETS: RocketType[] = [
  STANDARD_ROCKET,
];

// ── Launchers ─────────────────────────────────────────────────────

export const RPG_8: LauncherType = {
  name: "RPG-8",
  rocketType: "RPG-8 Rocket",
  capacity: 1,
  reloadAnimationDuration: 2500,
  size: 50,
  svgPath: "svg/rpg-8.svg",
  primaryHoldRatioPosition: { x: 0.5, y: 0.5 },
  secondaryHoldRatioPosition: { x: 0.7, y: 0.4 },
  muzzleRatioPosition: { x: 1.0, y: 0.5 },
};

export const ALL_LAUNCHERS: LauncherType[] = [
  RPG_8,
];
