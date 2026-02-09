import { describe, it, expect } from "vitest";
import { calculateThrowPower, GameEngine } from "@/game/GameEngine";

describe("calculateThrowPower", () => {
  const MAX = GameEngine.MAX_CHARGE_TIME_MS;

  it("returns 0 for 0 charge time", () => {
    expect(calculateThrowPower(0, MAX)).toBe(0);
  });

  it("returns 0.5 at half the max charge time", () => {
    expect(calculateThrowPower(MAX / 2, MAX)).toBeCloseTo(0.5);
  });

  it("returns 1.0 at exactly max charge time", () => {
    expect(calculateThrowPower(MAX, MAX)).toBe(1.0);
  });

  it("clamps at 1.0 when charge time exceeds max", () => {
    expect(calculateThrowPower(MAX * 2, MAX)).toBe(1.0);
    expect(calculateThrowPower(MAX * 10, MAX)).toBe(1.0);
  });

  it("scales linearly between 0 and 1", () => {
    const quarter = calculateThrowPower(MAX * 0.25, MAX);
    const half = calculateThrowPower(MAX * 0.5, MAX);
    const threeQuarter = calculateThrowPower(MAX * 0.75, MAX);
    expect(quarter).toBeCloseTo(0.25);
    expect(half).toBeCloseTo(0.5);
    expect(threeQuarter).toBeCloseTo(0.75);
  });

  it("works with a custom max charge time", () => {
    expect(calculateThrowPower(500, 2000)).toBeCloseTo(0.25);
    expect(calculateThrowPower(2000, 2000)).toBe(1.0);
    expect(calculateThrowPower(3000, 2000)).toBe(1.0);
  });
});
