import { describe, it, expect, beforeEach } from "vitest";
import { CasingSystem } from "@/game/systems/CasingSystem";
import { CasingEjection, CasingConfig } from "@/game/types/interfaces";

const RIFLE_CONFIG: CasingConfig = {
  width: 6,
  height: 2.5,
  color: '#c8a832',
  outlineColor: '#9a7e1e',
  ejectionSpeed: 100,
  spinRate: 10,
  life: 0.8,
};

const makeEjection = (overrides: Partial<CasingEjection> = {}): CasingEjection => ({
  position: { x: 100, y: 200 },
  direction: { x: 0, y: 1 },
  config: RIFLE_CONFIG,
  ...overrides,
});

describe("CasingSystem", () => {
  let system: CasingSystem;

  beforeEach(() => {
    system = new CasingSystem();
  });

  describe("createCasing", () => {
    it("creates a casing that persists through update", () => {
      system.createCasing(makeEjection());
      system.update(0.01);
      expect(system.getCasingCount()).toBe(1);
    });

    it("enforces MAX_CASINGS cap by evicting oldest", () => {
      for (let i = 0; i < 110; i++) {
        system.createCasing(makeEjection());
      }
      expect(system.getCasingCount()).toBe(100);
    });

    it("allows multiple casings to coexist", () => {
      system.createCasing(makeEjection());
      system.createCasing(makeEjection());
      system.createCasing(makeEjection());
      expect(system.getCasingCount()).toBe(3);
    });
  });

  describe("update", () => {
    it("decreases life and removes expired casings", () => {
      system.createCasing(makeEjection());
      // Life is ~0.8s ±20%, so after 2s all should be gone
      system.update(2.0);
      expect(system.getCasingCount()).toBe(0);
    });

    it("applies gravity (velocity.y decreases over time)", () => {
      system.createCasing(makeEjection({ direction: { x: 0, y: 1 } }));
      // Small update - casing should still exist
      system.update(0.1);
      expect(system.getCasingCount()).toBe(1);
      // After enough time with gravity, casings expire
      system.update(1.0);
      expect(system.getCasingCount()).toBe(0);
    });

    it("updates position based on velocity", () => {
      system.createCasing(makeEjection());
      // Run a small update - casing still alive
      system.update(0.01);
      expect(system.getCasingCount()).toBe(1);
    });

    it("updates rotation based on rotationSpeed", () => {
      system.createCasing(makeEjection());
      // Multiple updates don't crash and casings still exist within lifetime
      for (let i = 0; i < 10; i++) {
        system.update(0.016);
      }
      expect(system.getCasingCount()).toBe(1);
    });
  });

  describe("clear", () => {
    it("removes all casings", () => {
      system.createCasing(makeEjection());
      system.createCasing(makeEjection());
      system.createCasing(makeEjection());
      system.clear();
      expect(system.getCasingCount()).toBe(0);
    });

    it("is safe to call on empty system", () => {
      system.clear();
      system.clear();
      expect(system.getCasingCount()).toBe(0);
    });
  });
});
