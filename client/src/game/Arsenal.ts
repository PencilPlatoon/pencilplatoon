import { ShootingWeapon } from "./ShootingWeapon";
import { LaunchingWeapon } from "./LaunchingWeapon";
import { Grenade } from "./Grenade";
import { Rocket } from "./Rocket";
import { Holder } from "./types";

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
    this.currentWeaponIndex = 0;
    this.currentLauncherIndex = 0;
    this.currentGrenadeIndex = 0;
    this.grenadeCount = 50;
    this.maxGrenades = 50;
    this.rocketCount = 3;

    this.heldShootingWeapon = new ShootingWeapon(ShootingWeapon.ALL_WEAPONS[0]);
    this.heldLaunchingWeapon = new LaunchingWeapon(LaunchingWeapon.ALL_LAUNCHERS[0]);
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, Grenade.ALL_GRENADES[0]);
  }

  switchToNextWeapon(): void {
    this.currentWeaponIndex = (this.currentWeaponIndex + 1) % ShootingWeapon.ALL_WEAPONS.length;
    this.heldShootingWeapon = new ShootingWeapon(ShootingWeapon.ALL_WEAPONS[this.currentWeaponIndex]);
  }

  switchToNextLauncher(): void {
    this.currentLauncherIndex = (this.currentLauncherIndex + 1) % LaunchingWeapon.ALL_LAUNCHERS.length;
    this.heldLaunchingWeapon = new LaunchingWeapon(LaunchingWeapon.ALL_LAUNCHERS[this.currentLauncherIndex]);
  }

  switchToNextGrenade(): void {
    this.currentGrenadeIndex = (this.currentGrenadeIndex + 1) % Grenade.ALL_GRENADES.length;
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, Grenade.ALL_GRENADES[this.currentGrenadeIndex]);
  }

  reset(): void {
    this.currentWeaponIndex = 0;
    this.currentLauncherIndex = 0;
    this.currentGrenadeIndex = 0;
    this.grenadeCount = this.maxGrenades;
    this.rocketCount = 3;
    this.heldShootingWeapon = new ShootingWeapon(ShootingWeapon.ALL_WEAPONS[0]);
    this.heldLaunchingWeapon = new LaunchingWeapon(LaunchingWeapon.ALL_LAUNCHERS[0]);
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, Grenade.ALL_GRENADES[0]);
    this.reloadingRocket = null;
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

