import { ShootingWeapon } from "./ShootingWeapon";
import { LaunchingWeapon } from "./LaunchingWeapon";
import { Grenade } from "./Grenade";
import { Rocket } from "./Rocket";
import { Holder } from "./types";
import { ALL_SHOOTING_WEAPONS, ALL_LAUNCHERS, ALL_GRENADES } from "./WeaponCatalog";

export const cycleIndex = (current: number, length: number): number =>
  (current + 1) % length;

export class Arsenal {
  heldShootingWeapon: ShootingWeapon;
  heldLaunchingWeapon: LaunchingWeapon;
  heldGrenade: Grenade;
  reloadingRocket: Rocket | null = null; // Rocket being loaded during reload animation
  currentWeaponIndex: number;
  currentLauncherIndex: number;
  currentGrenadeIndex: number;
  grenadeCount: number;
  maxGrenades: number;
  rocketCount: number;

  constructor() {
    this.grenadeCount = 50;
    this.maxGrenades = 50;
    this.rocketCount = 3;

    // Assign defaults; createDefaultWeapons will overwrite these
    this.currentWeaponIndex = 0;
    this.currentLauncherIndex = 0;
    this.currentGrenadeIndex = 0;
    this.heldShootingWeapon = null!;
    this.heldLaunchingWeapon = null!;
    this.heldGrenade = null!;
    this.createDefaultWeapons();
  }

  switchToNextWeapon(): void {
    this.currentWeaponIndex = cycleIndex(this.currentWeaponIndex, ALL_SHOOTING_WEAPONS.length);
    this.heldShootingWeapon = new ShootingWeapon(ALL_SHOOTING_WEAPONS[this.currentWeaponIndex]);
  }

  switchToNextLauncher(): void {
    this.currentLauncherIndex = cycleIndex(this.currentLauncherIndex, ALL_LAUNCHERS.length);
    this.heldLaunchingWeapon = new LaunchingWeapon(ALL_LAUNCHERS[this.currentLauncherIndex]);
  }

  switchToNextGrenade(): void {
    this.currentGrenadeIndex = cycleIndex(this.currentGrenadeIndex, ALL_GRENADES.length);
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, ALL_GRENADES[this.currentGrenadeIndex]);
  }

  reset(): void {
    this.grenadeCount = this.maxGrenades;
    this.rocketCount = 3;
    this.reloadingRocket = null;
    this.createDefaultWeapons();
  }

  private createDefaultWeapons(): void {
    this.currentWeaponIndex = 0;
    this.currentLauncherIndex = 0;
    this.currentGrenadeIndex = 0;
    this.heldShootingWeapon = new ShootingWeapon(ALL_SHOOTING_WEAPONS[0]);
    this.heldLaunchingWeapon = new LaunchingWeapon(ALL_LAUNCHERS[0]);
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, ALL_GRENADES[0]);
  }

  startReloadingRocket(player: Holder): void {
    const rocketType = this.heldLaunchingWeapon.rocketType;
    // During reload, player holds the rocket
    this.reloadingRocket = new Rocket(0, 0, { x: 0, y: 0 }, rocketType, player);
  }

  transferRocketToLauncher(): void {
    if (this.reloadingRocket) {
      // Transfer ownership to the launcher
      this.reloadingRocket.holder = this.heldLaunchingWeapon;
      this.heldLaunchingWeapon.loadRocket(this.reloadingRocket);
      this.reloadingRocket = null;
    }
  }
}

