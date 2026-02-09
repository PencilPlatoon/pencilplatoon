import { describe, it, expect, beforeEach } from "vitest";
import {
  SeededRandom,
  setGlobalSeed,
  getGlobalSeededRandom,
  seededRandom,
  seededRandomInt,
  seededRandomChoice,
  seededRandomBoolean,
} from "../utils";

describe("SeededRandom", () => {
  describe("determinism", () => {
    it("produces the same sequence for the same seed", () => {
      const a = new SeededRandom(42);
      const b = new SeededRandom(42);
      const seqA = Array.from({ length: 10 }, () => a.next());
      const seqB = Array.from({ length: 10 }, () => b.next());
      expect(seqA).toEqual(seqB);
    });

    it("produces different sequences for different seeds", () => {
      const a = new SeededRandom(1);
      const b = new SeededRandom(2);
      const seqA = Array.from({ length: 5 }, () => a.next());
      const seqB = Array.from({ length: 5 }, () => b.next());
      expect(seqA).not.toEqual(seqB);
    });
  });

  describe("next()", () => {
    it("returns values in [0, 1)", () => {
      const rng = new SeededRandom(99);
      for (let i = 0; i < 100; i++) {
        const v = rng.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe("random(min, max)", () => {
    it("returns values within the specified range", () => {
      const rng = new SeededRandom(7);
      for (let i = 0; i < 100; i++) {
        const v = rng.random(10, 20);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThanOrEqual(20);
      }
    });

    it("returns min when range is zero", () => {
      const rng = new SeededRandom(7);
      expect(rng.random(5, 5)).toBe(5);
    });
  });

  describe("randomInt(min, max)", () => {
    it("returns integers within the specified range (inclusive)", () => {
      const rng = new SeededRandom(11);
      const seen = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const v = rng.randomInt(1, 3);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(3);
        expect(Number.isInteger(v)).toBe(true);
        seen.add(v);
      }
      // With 200 draws from {1,2,3}, all values should appear
      expect(seen).toEqual(new Set([1, 2, 3]));
    });
  });

  describe("randomChoice(array)", () => {
    it("returns an element from the array", () => {
      const rng = new SeededRandom(55);
      const items = ["a", "b", "c"];
      for (let i = 0; i < 50; i++) {
        expect(items).toContain(rng.randomChoice(items));
      }
    });

    it("returns the only element for a single-element array", () => {
      const rng = new SeededRandom(55);
      expect(rng.randomChoice([42])).toBe(42);
    });
  });

  describe("randomBoolean(probability)", () => {
    it("returns only true with probability 1", () => {
      const rng = new SeededRandom(10);
      for (let i = 0; i < 20; i++) {
        expect(rng.randomBoolean(1)).toBe(true);
      }
    });

    it("returns only false with probability 0", () => {
      const rng = new SeededRandom(10);
      for (let i = 0; i < 20; i++) {
        expect(rng.randomBoolean(0)).toBe(false);
      }
    });

    it("returns both true and false with default 0.5", () => {
      const rng = new SeededRandom(77);
      const results = Array.from({ length: 100 }, () => rng.randomBoolean());
      expect(results).toContain(true);
      expect(results).toContain(false);
    });
  });
});

describe("global seeded random", () => {
  beforeEach(() => {
    setGlobalSeed(42);
  });

  it("setGlobalSeed resets the sequence", () => {
    const first = seededRandom(0, 100);
    setGlobalSeed(42);
    const second = seededRandom(0, 100);
    expect(first).toBe(second);
  });

  it("getGlobalSeededRandom returns the instance", () => {
    const rng = getGlobalSeededRandom();
    expect(rng).toBeInstanceOf(SeededRandom);
  });

  it("seededRandom returns values in range", () => {
    const v = seededRandom(10, 20);
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(20);
  });

  it("seededRandomInt returns integers in range", () => {
    const v = seededRandomInt(1, 5);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(5);
    expect(Number.isInteger(v)).toBe(true);
  });

  it("seededRandomChoice returns array element", () => {
    expect(["x", "y", "z"]).toContain(seededRandomChoice(["x", "y", "z"]));
  });

  it("seededRandomBoolean returns a boolean", () => {
    expect(typeof seededRandomBoolean()).toBe("boolean");
  });
});
