import { describe, it, expect } from "vitest";
import { isShootingWeaponType, formatRatioPosition, buildWeaponDefinition } from "../weaponDefinitionSerializer";
import { ALL_SHOOTING_WEAPONS, ALL_LAUNCHERS } from "@/game/weapons/WeaponCatalog";

describe("isShootingWeaponType", () => {
  it("returns true for all shooting weapon types", () => {
    for (const weapon of ALL_SHOOTING_WEAPONS) {
      expect(isShootingWeaponType(weapon)).toBe(true);
    }
  });

  it("returns false for launcher types", () => {
    for (const launcher of ALL_LAUNCHERS) {
      expect(isShootingWeaponType(launcher)).toBe(false);
    }
  });
});

describe("formatRatioPosition", () => {
  it("formats a Vector2 to 2 decimal places", () => {
    expect(formatRatioPosition({ x: 0.123, y: 0.456 })).toBe("{ x: 0.12, y: 0.46 }");
  });

  it("formats integer values", () => {
    expect(formatRatioPosition({ x: 0, y: 1 })).toBe("{ x: 0.00, y: 1.00 }");
  });

  it("formats null as 'null'", () => {
    expect(formatRatioPosition(null)).toBe("null");
  });
});

describe("buildWeaponDefinition", () => {
  it("includes shared fields for a gun", () => {
    const weapon = ALL_SHOOTING_WEAPONS[0]; // Webley
    const result = buildWeaponDefinition(weapon);
    expect(result).toContain(`name: "${weapon.name}"`);
    expect(result).toContain(`size: ${weapon.size}`);
    expect(result).toContain(`svgPath: "${weapon.svgPath}"`);
    expect(result).toContain("primaryHoldRatioPosition:");
    expect(result).toContain("secondaryHoldRatioPosition:");
  });

  it("includes gun-specific fields", () => {
    const weapon = ALL_SHOOTING_WEAPONS[0];
    const result = buildWeaponDefinition(weapon);
    expect(result).toContain(`damage: ${weapon.damage}`);
    expect(result).toContain(`fireInterval: ${weapon.fireInterval}`);
    expect(result).toContain(`bulletSpeed: ${weapon.bulletSpeed}`);
    expect(result).toContain(`bulletSize: ${weapon.bulletSize}`);
    expect(result).toContain(`capacity: ${weapon.capacity}`);
    expect(result).toContain(`autoFiringType: '${weapon.autoFiringType}'`);
  });

  it("includes launcher-specific fields", () => {
    const launcher = ALL_LAUNCHERS[0];
    const result = buildWeaponDefinition(launcher);
    expect(result).toContain(`rocketType: "${launcher.rocketType}"`);
    expect(result).toContain(`capacity: ${launcher.capacity}`);
    expect(result).toContain(`reloadAnimationDuration: ${launcher.reloadAnimationDuration}`);
  });

  it("does not include gun fields for launcher", () => {
    const launcher = ALL_LAUNCHERS[0];
    const result = buildWeaponDefinition(launcher);
    expect(result).not.toContain("fireInterval:");
    expect(result).not.toContain("bulletSpeed:");
    expect(result).not.toContain("autoFiringType:");
  });

  it("does not include launcher fields for gun", () => {
    const weapon = ALL_SHOOTING_WEAPONS[0];
    const result = buildWeaponDefinition(weapon);
    expect(result).not.toContain("rocketType:");
    expect(result).not.toContain("reloadAnimationDuration:");
  });

  it("includes casingCategory when present", () => {
    const weapon = ALL_SHOOTING_WEAPONS[0]; // Webley has casingCategory: 'pistol'
    const result = buildWeaponDefinition(weapon);
    expect(result).toContain("casingCategory: 'pistol'");
  });

  it("omits casingCategory when absent", () => {
    // RIFLE_A_MAIN_OFFENSIVE (index 1) has no casingCategory
    const weapon = ALL_SHOOTING_WEAPONS[1];
    const result = buildWeaponDefinition(weapon);
    expect(result).not.toContain("casingCategory:");
  });

  it("includes ejectionPortRatioPosition when present", () => {
    const weapon = { ...ALL_SHOOTING_WEAPONS[0], ejectionPortRatioPosition: { x: 0.65, y: 0.40 } };
    // Temporarily add to catalog for isShootingWeaponType check
    ALL_SHOOTING_WEAPONS.push(weapon);
    try {
      const result = buildWeaponDefinition(weapon);
      expect(result).toContain("ejectionPortRatioPosition: { x: 0.65, y: 0.40 }");
    } finally {
      ALL_SHOOTING_WEAPONS.pop();
    }
  });

  it("omits ejectionPortRatioPosition when absent", () => {
    const weapon = ALL_SHOOTING_WEAPONS[0];
    const result = buildWeaponDefinition(weapon);
    expect(result).not.toContain("ejectionPortRatioPosition:");
  });
});
