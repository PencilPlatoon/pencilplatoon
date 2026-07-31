import { ShootingWeapon } from "./ShootingWeapon";
import { LaunchingWeapon } from "./LaunchingWeapon";
import { Grenade } from "@/game/entities/Grenade";
import { Rocket } from "@/game/entities/Rocket";
import { Holder, ShootingWeaponType } from "@/game/types/interfaces";
import { WEBLEY_REVOLVER, ALL_LAUNCHERS, ALL_GRENADES } from "./WeaponCatalog";

export const cycleIndex = (current: number, length: number): number =>
  (current + 1) % length;

export class Arsenal {
  /** Guns the player has collected; the player starts with only the Webley. */
  ownedShootingWeapons: ShootingWeapon[];
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
    this.ownedShootingWeapons = [];
    this.heldShootingWeapon = null!;
    this.heldLaunchingWeapon = null!;
    this.heldGrenade = null!;
    this.createDefaultWeapons();
  }

  switchToNextWeapon(): void {
    this.currentWeaponIndex = cycleIndex(this.currentWeaponIndex, this.ownedShootingWeapons.length);
    this.heldShootingWeapon = this.ownedShootingWeapons[this.currentWeaponIndex];
  }

  /** Whether a gun of this type is already in the player's inventory. */
  ownsShootingWeapon(type: ShootingWeaponType): boolean {
    return this.ownedShootingWeapons.some(weapon => weapon.type === type);
  }

  /** Add a newly acquired gun to the inventory and switch to it, keeping its remaining ammo. */
  addShootingWeapon(weapon: ShootingWeapon): void {
    this.ownedShootingWeapons.push(weapon);
    this.currentWeaponIndex = this.ownedShootingWeapons.length - 1;
    this.heldShootingWeapon = weapon;
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
    this.ownedShootingWeapons = [new ShootingWeapon(WEBLEY_REVOLVER)];
    this.heldShootingWeapon = this.ownedShootingWeapons[0];
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

