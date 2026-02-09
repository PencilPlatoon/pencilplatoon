import { describe, it, expect } from "vitest";
import { cycleIndex } from "../Arsenal";

describe("cycleIndex", () => {
  it("advances index by one", () => {
    expect(cycleIndex(0, 3)).toBe(1);
    expect(cycleIndex(1, 3)).toBe(2);
  });

  it("wraps around to zero at the end", () => {
    expect(cycleIndex(2, 3)).toBe(0);
  });

  it("works with a single-element array", () => {
    expect(cycleIndex(0, 1)).toBe(0);
  });
});
