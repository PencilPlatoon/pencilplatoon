import { describe, it, expect } from "vitest";
import { ACTION_TO_INPUT_KEY, MobileInput } from "../MobileControls";

const ALL_TOUCH_ACTIONS = ["left", "right", "jump", "shoot", "aimUp", "aimDown"];

describe("ACTION_TO_INPUT_KEY", () => {
  it("maps all touch actions to valid input keys", () => {
    for (const action of ALL_TOUCH_ACTIONS) {
      expect(ACTION_TO_INPUT_KEY[action]).toBeDefined();
    }
  });

  it("maps each action to the correct input key", () => {
    expect(ACTION_TO_INPUT_KEY["left"]).toBe("left");
    expect(ACTION_TO_INPUT_KEY["right"]).toBe("right");
    expect(ACTION_TO_INPUT_KEY["jump"]).toBe("jump");
    expect(ACTION_TO_INPUT_KEY["shoot"]).toBe("triggerPressed");
    expect(ACTION_TO_INPUT_KEY["aimUp"]).toBe("aimUp");
    expect(ACTION_TO_INPUT_KEY["aimDown"]).toBe("aimDown");
  });

  it("maps to keys that exist on MobileInput", () => {
    const sampleInput: MobileInput = {
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false,
      triggerPressed: false,
      aimUp: false,
      aimDown: false,
    };
    for (const key of Object.values(ACTION_TO_INPUT_KEY)) {
      expect(key in sampleInput).toBe(true);
    }
  });
});
