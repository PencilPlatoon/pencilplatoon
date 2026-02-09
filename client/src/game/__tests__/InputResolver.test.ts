import { describe, it, expect } from "vitest";
import { resolveInput, EMPTY_INPUT, PlayerInput } from "../InputResolver";

describe("resolveInput", () => {
  const emptyKeys = new Set<string>();

  it("returns all false when no keys pressed and no mobile input", () => {
    const result = resolveInput(emptyKeys, EMPTY_INPUT);
    expect(result).toEqual(EMPTY_INPUT);
  });

  describe("keyboard input", () => {
    it("maps KeyA to left", () => {
      const result = resolveInput(new Set(["KeyA"]), EMPTY_INPUT);
      expect(result.left).toBe(true);
      expect(result.right).toBe(false);
    });

    it("maps ArrowLeft to left", () => {
      const result = resolveInput(new Set(["ArrowLeft"]), EMPTY_INPUT);
      expect(result.left).toBe(true);
    });

    it("maps KeyD to right", () => {
      const result = resolveInput(new Set(["KeyD"]), EMPTY_INPUT);
      expect(result.right).toBe(true);
    });

    it("maps ArrowRight to right", () => {
      const result = resolveInput(new Set(["ArrowRight"]), EMPTY_INPUT);
      expect(result.right).toBe(true);
    });

    it("maps KeyW to up", () => {
      const result = resolveInput(new Set(["KeyW"]), EMPTY_INPUT);
      expect(result.up).toBe(true);
    });

    it("maps ArrowUp to up", () => {
      const result = resolveInput(new Set(["ArrowUp"]), EMPTY_INPUT);
      expect(result.up).toBe(true);
    });

    it("maps KeyS to down", () => {
      const result = resolveInput(new Set(["KeyS"]), EMPTY_INPUT);
      expect(result.down).toBe(true);
    });

    it("maps ArrowDown to down", () => {
      const result = resolveInput(new Set(["ArrowDown"]), EMPTY_INPUT);
      expect(result.down).toBe(true);
    });

    it("maps Space to jump", () => {
      const result = resolveInput(new Set(["Space"]), EMPTY_INPUT);
      expect(result.jump).toBe(true);
    });

    it("maps KeyJ to triggerPressed", () => {
      const result = resolveInput(new Set(["KeyJ"]), EMPTY_INPUT);
      expect(result.triggerPressed).toBe(true);
    });

    it("maps KeyI to aimUp", () => {
      const result = resolveInput(new Set(["KeyI"]), EMPTY_INPUT);
      expect(result.aimUp).toBe(true);
    });

    it("maps KeyK to aimDown", () => {
      const result = resolveInput(new Set(["KeyK"]), EMPTY_INPUT);
      expect(result.aimDown).toBe(true);
    });

    it("handles multiple simultaneous keys", () => {
      const result = resolveInput(new Set(["KeyA", "Space", "KeyJ"]), EMPTY_INPUT);
      expect(result.left).toBe(true);
      expect(result.jump).toBe(true);
      expect(result.triggerPressed).toBe(true);
      expect(result.right).toBe(false);
    });
  });

  describe("mobile input", () => {
    it("passes through mobile input fields", () => {
      const mobile: PlayerInput = {
        left: true, right: false, up: false, down: true,
        jump: true, triggerPressed: false, aimUp: false, aimDown: true,
      };
      const result = resolveInput(emptyKeys, mobile);
      expect(result.left).toBe(true);
      expect(result.down).toBe(true);
      expect(result.jump).toBe(true);
      expect(result.aimDown).toBe(true);
      expect(result.right).toBe(false);
      expect(result.triggerPressed).toBe(false);
    });
  });

  describe("combined keyboard + mobile (OR logic)", () => {
    it("keyboard true OR mobile false = true", () => {
      const result = resolveInput(new Set(["KeyA"]), EMPTY_INPUT);
      expect(result.left).toBe(true);
    });

    it("keyboard false OR mobile true = true", () => {
      const mobile: PlayerInput = { ...EMPTY_INPUT, right: true };
      const result = resolveInput(emptyKeys, mobile);
      expect(result.right).toBe(true);
    });

    it("both keyboard and mobile true = true", () => {
      const mobile: PlayerInput = { ...EMPTY_INPUT, jump: true };
      const result = resolveInput(new Set(["Space"]), mobile);
      expect(result.jump).toBe(true);
    });
  });
});
