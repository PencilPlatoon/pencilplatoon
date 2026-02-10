import { describe, it, expect, vi } from "vitest";
import { SecondaryHandControl } from "../SecondaryHandControl";
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

describe("SecondaryHandControl", () => {
  const createControl = () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    return { control: new SecondaryHandControl(player), player };
  };

  it("has id 'secondary'", () => {
    const { control } = createControl();
    expect(control.id).toBe("secondary");
  });

  it("getAbsPosition returns null when weapon has no secondary hold", () => {
    const { control } = createControl();
    // Default weapon is Webley (no secondary hold)
    const pos = control.getAbsPosition();
    expect(pos).toBeNull();
  });

  it("getAbsPosition returns position when weapon has secondary hold", () => {
    const { control, player } = createControl();
    // Switch to weapon with secondary hold
    player.arsenal.switchToNextWeapon();
    const pos = control.getAbsPosition();
    expect(pos).not.toBeNull();
    expect(typeof pos!.x).toBe("number");
    expect(typeof pos!.y).toBe("number");
  });

  it("updateAbsPosition changes the secondary hold ratio", () => {
    const { control, player } = createControl();
    // Switch to weapon with secondary hold
    player.arsenal.switchToNextWeapon();
    const originalHold = { ...player.getHeldObject().type.secondaryHoldRatioPosition! };

    const newPos = { x: FIGURE_CENTER_X + 10, y: FIGURE_CENTER_Y + 30 };
    control.updateAbsPosition(newPos);

    const updatedHold = player.getHeldObject().type.secondaryHoldRatioPosition!;
    expect(updatedHold.x !== originalHold.x || updatedHold.y !== originalHold.y).toBe(true);
  });

  it("isMouseWithin returns false when no secondary hold", () => {
    const { control } = createControl();
    // Default weapon has no secondary hold → getAbsPosition returns null → isMouseWithin returns false
    expect(control.isMouseWithin({ x: FIGURE_CENTER_X, y: FIGURE_CENTER_Y })).toBe(false);
  });
});
