import { WeaponType } from "./types";

export class Weapon {
  static RIFLE: WeaponType = {
    name: "Rifle",
    damage: 25,
    fireRate: 200,
    bulletSpeed: 800,
    bulletColor: "orange"
  };

  static MACHINE_GUN: WeaponType = {
    name: "Machine Gun",
    damage: 15,
    fireRate: 100,
    bulletSpeed: 700,
    bulletColor: "yellow"
  };

  static SNIPER: WeaponType = {
    name: "Sniper",
    damage: 50,
    fireRate: 1000,
    bulletSpeed: 1200,
    bulletColor: "red"
  };

  static PISTOL: WeaponType = {
    name: "Pistol",
    damage: 20,
    fireRate: 300,
    bulletSpeed: 600,
    bulletColor: "orange"
  };
}
