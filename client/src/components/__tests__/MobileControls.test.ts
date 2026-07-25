import { describe, it, expect } from "vitest";
import {
  ACTION_TO_INPUT_KEY,
  EMPTY_INPUT,
  MobileInput,
  TouchButton,
  buttonScale,
  createTouchButtons,
  findButtonAt,
  inputFromHeldActions,
} from "@/components/MobileControlsLayout";

const ALL_TOUCH_ACTIONS = ["left", "right", "jump", "shoot", "aimUp", "aimDown"];

/** Portrait phone, short landscape phone, small window, tablet. */
const VIEWPORTS = [
  { width: 390, height: 760 },
  { width: 667, height: 375 },
  { width: 320, height: 480 },
  { width: 768, height: 1024 },
];

const byAction = (buttons: TouchButton[], action: string): TouchButton => {
  const button = buttons.find((b) => b.action === action);
  if (!button) throw new Error(`no button ${action}`);
  return button;
};

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
    const sampleInput: MobileInput = { ...EMPTY_INPUT };
    for (const key of Object.values(ACTION_TO_INPUT_KEY)) {
      expect(key in sampleInput).toBe(true);
    }
  });
});

describe("createTouchButtons", () => {
  it("creates one button per action", () => {
    const buttons = createTouchButtons(390, 760);
    expect(buttons.map((b) => b.action).sort()).toEqual([...ALL_TOUCH_ACTIONS].sort());
  });

  it.each(VIEWPORTS)("keeps every button fully on screen at $width x $height", (viewport) => {
    for (const button of createTouchButtons(viewport.width, viewport.height)) {
      expect(button.cx - button.radius, `${button.action} off left`).toBeGreaterThanOrEqual(0);
      expect(button.cx + button.radius, `${button.action} off right`).toBeLessThanOrEqual(viewport.width);
      expect(button.cy - button.radius, `${button.action} off top`).toBeGreaterThanOrEqual(0);
      expect(button.cy + button.radius, `${button.action} off bottom`).toBeLessThanOrEqual(viewport.height);
    }
  });

  it.each(VIEWPORTS)("keeps hit targets from overlapping at $width x $height", (viewport) => {
    const buttons = createTouchButtons(viewport.width, viewport.height);
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i];
        const b = buttons[j];
        const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        // Neighbours are laid out exactly tangent, so allow for float drift.
        expect(distance, `${a.action} overlaps ${b.action}`).toBeGreaterThanOrEqual(
          a.hitRadius + b.hitRadius - 1e-6
        );
      }
    }
  });

  it("puts movement bottom left and shooting bottom right", () => {
    const buttons = createTouchButtons(390, 760);
    const left = byAction(buttons, "left");
    const right = byAction(buttons, "right");
    const shoot = byAction(buttons, "shoot");

    expect(left.cx).toBeLessThan(right.cx);
    expect(right.cx).toBeLessThan(390 / 2);
    expect(shoot.cx).toBeGreaterThan(390 / 2);
    expect(left.cy).toBeGreaterThan(760 / 2);
  });

  it("stacks jump above the movement row", () => {
    const buttons = createTouchButtons(390, 760);
    const jump = byAction(buttons, "jump");
    const left = byAction(buttons, "left");

    expect(jump.cy + jump.radius).toBeLessThan(left.cy - left.radius);
    expect(jump.cx).toBeCloseTo((left.cx + byAction(buttons, "right").cx) / 2);
  });

  it("stacks aim up above aim down, beside the shoot button", () => {
    const buttons = createTouchButtons(390, 760);
    const aimUp = byAction(buttons, "aimUp");
    const aimDown = byAction(buttons, "aimDown");
    const shoot = byAction(buttons, "shoot");

    expect(aimUp.cy).toBeLessThan(aimDown.cy);
    expect(aimUp.cx).toBeCloseTo(aimDown.cx);
    expect(aimUp.cx).toBeLessThan(shoot.cx);
  });

  it.each(VIEWPORTS)(
    "keeps every button clear of the top-half HUD at $width x $height",
    (viewport) => {
      for (const button of createTouchButtons(viewport.width, viewport.height)) {
        expect(
          button.cy - button.hitRadius,
          `${button.action} reaches into the HUD`
        ).toBeGreaterThan(viewport.height / 2);
      }
    }
  );

  it("makes shoot the largest button", () => {
    const buttons = createTouchButtons(390, 760);
    const shoot = byAction(buttons, "shoot");
    for (const button of buttons) {
      expect(shoot.radius).toBeGreaterThanOrEqual(button.radius);
    }
  });

  it("scales buttons down on small viewports", () => {
    const small = createTouchButtons(320, 480);
    const large = createTouchButtons(768, 1024);
    expect(byAction(small, "shoot").radius).toBeLessThan(byAction(large, "shoot").radius);
  });
});

describe("buttonScale", () => {
  it("is driven by the smaller viewport dimension", () => {
    expect(buttonScale(1200, 380)).toBeCloseTo(buttonScale(380, 1200));
  });

  it("clamps to a usable range at extreme sizes", () => {
    expect(buttonScale(120, 120)).toBeGreaterThanOrEqual(0.7);
    expect(buttonScale(4000, 4000)).toBeLessThanOrEqual(1.15);
  });
});

describe("findButtonAt", () => {
  const buttons = createTouchButtons(390, 760);
  const shoot = byAction(buttons, "shoot");

  it("finds the button under a touch at its center", () => {
    expect(findButtonAt(buttons, shoot.cx, shoot.cy)?.action).toBe("shoot");
  });

  it("finds a button touched just inside its edge", () => {
    expect(findButtonAt(buttons, shoot.cx + shoot.radius - 1, shoot.cy)?.action).toBe("shoot");
  });

  it("forgives a near miss within the hit slop", () => {
    expect(shoot.hitRadius).toBeGreaterThan(shoot.radius);
    expect(findButtonAt(buttons, shoot.cx, shoot.cy - shoot.hitRadius + 1)?.action).toBe("shoot");
  });

  it("returns null for empty screen space", () => {
    expect(findButtonAt(buttons, 195, 300)).toBeNull();
  });

  it("returns null just beyond a button's reach", () => {
    expect(findButtonAt(buttons, shoot.cx, shoot.cy - shoot.hitRadius - 20)).toBeNull();
  });
});

describe("inputFromHeldActions", () => {
  it("reports no input when nothing is held", () => {
    expect(inputFromHeldActions(new Set())).toEqual(EMPTY_INPUT);
  });

  it("sets the key for a held button", () => {
    const input = inputFromHeldActions(new Set(["shoot"]));
    expect(input.triggerPressed).toBe(true);
    expect(input.left).toBe(false);
  });

  it("supports several buttons held at once", () => {
    const input = inputFromHeldActions(new Set(["right", "jump", "shoot"]));
    expect(input.right).toBe(true);
    expect(input.jump).toBe(true);
    expect(input.triggerPressed).toBe(true);
    expect(input.left).toBe(false);
  });

  it("ignores unknown actions", () => {
    expect(inputFromHeldActions(new Set(["nonsense"]))).toEqual(EMPTY_INPUT);
  });

  it("covers every action the layout produces", () => {
    for (const button of createTouchButtons(390, 760)) {
      const input = inputFromHeldActions(new Set([button.action]));
      expect(Object.values(input).some(Boolean), `${button.action} produced no input`).toBe(true);
    }
  });
});
