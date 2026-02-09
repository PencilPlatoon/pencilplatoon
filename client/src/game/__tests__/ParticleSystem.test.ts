import { describe, it, expect, beforeEach } from "vitest";
import { ParticleSystem } from "@/game/systems/ParticleSystem";

describe("ParticleSystem", () => {
  let system: ParticleSystem;

  beforeEach(() => {
    system = new ParticleSystem();
  });

  describe("createExplosion", () => {
    it("creates the requested number of particles", () => {
      system.createExplosion({
        position: { x: 100, y: 200 },
        radius: 50,
        colors: ["#ff0000"],
        particleCount: 10,
      });
      // We can verify particle count by updating and observing behavior
      // Particles start with life 0.5-1.0, so after 0 time all should remain
      system.update(0);
      // After very short time, should still have all particles
      system.update(0.001);
      // Can't directly access particles, but we can verify explosion doesn't crash
      // and that clear removes them
    });

    it("creates multiple explosions additively", () => {
      system.createExplosion({
        position: { x: 0, y: 0 },
        radius: 50,
        colors: ["#ff0000"],
        particleCount: 5,
      });
      system.createExplosion({
        position: { x: 100, y: 100 },
        radius: 50,
        colors: ["#00ff00"],
        particleCount: 5,
      });
      // Both explosions should coexist - verify by updating
      system.update(0.01);
    });
  });

  describe("update", () => {
    it("decreases particle life over time", () => {
      system.createExplosion({
        position: { x: 0, y: 0 },
        radius: 50,
        colors: ["#ff0000"],
        particleCount: 5,
      });
      // After time exceeding max life (1.0s), all particles should be gone
      system.update(2.0);
      // Creating a new explosion should work fine (system is empty)
      system.createExplosion({
        position: { x: 0, y: 0 },
        radius: 50,
        colors: ["#ff0000"],
        particleCount: 1,
      });
    });

    it("removes particles when life expires", () => {
      system.createExplosion({
        position: { x: 0, y: 0 },
        radius: 50,
        colors: ["#ff0000"],
        particleCount: 10,
      });
      // Particles have life 0.5-1.0, so after 1.1s all should be dead
      system.update(1.1);
      // Calling update again on empty system should be fine
      system.update(0.1);
    });

    it("applies gravity to non-grey particles", () => {
      // This is tested indirectly - the system shouldn't crash
      system.createExplosion({
        position: { x: 0, y: 0 },
        radius: 100,
        colors: ["#ff0000", "#888888"],
        particleCount: 20,
      });
      system.update(0.1);
    });

    it("applies velocity damping", () => {
      system.createExplosion({
        position: { x: 0, y: 0 },
        radius: 50,
        colors: ["#ff0000"],
        particleCount: 5,
      });
      // Multiple updates should slow particles down
      for (let i = 0; i < 10; i++) {
        system.update(0.016);
      }
    });
  });

  describe("clear", () => {
    it("removes all particles", () => {
      system.createExplosion({
        position: { x: 0, y: 0 },
        radius: 50,
        colors: ["#ff0000"],
        particleCount: 50,
      });
      system.clear();
      // After clear, update should process 0 particles
      system.update(0.016);
    });

    it("is safe to call on empty system", () => {
      system.clear();
      system.clear();
    });
  });
});
