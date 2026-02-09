import { describe, it, expect } from "vitest";
import { LEVEL_DEFINITIONS, LEVEL_ORDER } from "../LevelConfig";

describe("LevelConfig", () => {
  it("LEVEL_ORDER references valid definitions", () => {
    for (const name of LEVEL_ORDER) {
      expect(LEVEL_DEFINITIONS[name]).toBeDefined();
    }
  });

  it("has three levels", () => {
    expect(LEVEL_ORDER).toHaveLength(3);
  });

  it("each level has valid terrain config", () => {
    for (const name of LEVEL_ORDER) {
      const config = LEVEL_DEFINITIONS[name];
      expect(config.terrain.amplitude).toBeGreaterThan(0);
      expect(config.terrain.frequency).toBeGreaterThan(0);
      expect(config.terrain.roughness).toBeGreaterThanOrEqual(0);
    }
  });

  it("each level has positive enemy count", () => {
    for (const name of LEVEL_ORDER) {
      expect(LEVEL_DEFINITIONS[name].enemiesPerScreen).toBeGreaterThan(0);
    }
  });

  it("difficulty increases across levels", () => {
    const enemyCounts = LEVEL_ORDER.map(name => LEVEL_DEFINITIONS[name].enemiesPerScreen);
    for (let i = 1; i < enemyCounts.length; i++) {
      expect(enemyCounts[i]).toBeGreaterThanOrEqual(enemyCounts[i - 1]);
    }
  });
});
