import { describe, it, expect } from "vitest";
import { ALL_SHOOTING_WEAPONS } from "@/game/weapons/WeaponCatalog";

describe("WeaponCatalog recoil", () => {
  it("all shooting weapons have recoil configured", () => {
    for (const weapon of ALL_SHOOTING_WEAPONS) {
      expect(weapon.recoil, `${weapon.name} should have recoil defined`).toBeDefined();
      expect(weapon.recoil, `${weapon.name} should have positive recoil`).toBeGreaterThan(0);
    }
  });

  it("recoil values are within reasonable range", () => {
    for (const weapon of ALL_SHOOTING_WEAPONS) {
      expect(weapon.recoil, `${weapon.name} recoil too low`).toBeGreaterThan(0);
      expect(weapon.recoil, `${weapon.name} recoil too high`).toBeLessThanOrEqual(0.2);
    }
  });
});
