import { describe, it, expect, vi } from "vitest";
import { WeaponPositionControl } from "../WeaponPositionControl";
import { Player } from "@/game/entities/Player";
import { DesignerModePositions } from "../DesignerModePositions";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: {
        width: 50,
        height: 10,
        refRatioPosition: { x: 0.5, y: 0.5 },
        getAbsoluteBounds: vi.fn(),
        getBoundingPositions: vi.fn(),
        getRotatedBoundingPositions: vi.fn(),
      },
      svgInfo: undefined,
    })
  ),
}));

const { FIGURE_CENTER_X, FIGURE_CENTER_Y } = DesignerModePositions;

describe("WeaponPositionControl", () => {
  const createControl = () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    return { control: new WeaponPositionControl(player), player };
  };

  it("has id 'weapon'", () => {
    const { control } = createControl();
    expect(control.id).toBe("weapon");
  });

  it("getAbsPosition returns a position", () => {
    const { control } = createControl();
    const pos = control.getAbsPosition();
    expect(pos).toBeDefined();
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });

  it("updateAbsPosition changes the primary hold ratio", () => {
    const { control, player } = createControl();
    const originalHold = { ...player.getHeldObject().type.primaryHoldRatioPosition };

    // Move to a different position
    const newPos = { x: FIGURE_CENTER_X + 20, y: FIGURE_CENTER_Y + 30 };
    control.updateAbsPosition(newPos);

    const updatedHold = player.getHeldObject().type.primaryHoldRatioPosition;
    // Hold position should have changed
    expect(updatedHold.x !== originalHold.x || updatedHold.y !== originalHold.y).toBe(true);
  });

  it("isMouseWithin returns true for position near control", () => {
    const { control } = createControl();
    const pos = control.getAbsPosition();
    // Slightly offset from the exact position
    expect(control.isMouseWithin({ x: pos.x + 1, y: pos.y + 1 })).toBe(true);
  });

  it("isMouseWithin returns false for position far from control", () => {
    const { control } = createControl();
    expect(control.isMouseWithin({ x: -1000, y: -1000 })).toBe(false);
  });
});
