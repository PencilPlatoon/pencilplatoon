import { describe, it, expect, vi } from "vitest";
import { DesignerModePositions } from "../DesignerModePositions";
import { Player } from "@/game/entities/Player";
import { EntityTransform } from "@/game/types/EntityTransform";
import { Vector2 } from "@/game/types/Vector2";
import { Terrain } from "@/game/world/Terrain";

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

const { CANVAS_WIDTH, CANVAS_HEIGHT, FIGURE_CENTER_X, FIGURE_CENTER_Y, FIGURE_SCALE, GAME_HEIGHT, Y_OFFSET } =
  DesignerModePositions;

describe("DesignerModePositions constants", () => {
  it("has expected canvas dimensions", () => {
    expect(CANVAS_WIDTH).toBe(1200);
    expect(CANVAS_HEIGHT).toBe(800);
  });

  it("FIGURE_CENTER is half canvas", () => {
    expect(FIGURE_CENTER_X).toBe(600);
    expect(FIGURE_CENTER_Y).toBe(400);
  });

  it("Y_OFFSET = CANVAS_HEIGHT - GAME_HEIGHT", () => {
    expect(Y_OFFSET).toBe(CANVAS_HEIGHT - GAME_HEIGHT);
  });
});

describe("screenToGame", () => {
  const makeRect = (left: number, top: number, width: number, height: number): DOMRect =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => {} } as DOMRect);

  it("maps canvas center to game center (1:1 display)", () => {
    // 1:1 display: canvas element is same size as logical canvas
    const rect = makeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    // Click at the center of the canvas element
    const result = DesignerModePositions.screenToGame({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }, rect);
    // Center of canvas → FIGURE_CENTER_X, and Y-flipped from canvas center
    expect(result.x).toBeCloseTo(FIGURE_CENTER_X);
    // At the scaled center, unscaling gives FIGURE_CENTER_Y, minus Y_OFFSET, then flip
    const expectedY = GAME_HEIGHT - (FIGURE_CENTER_Y - Y_OFFSET);
    expect(result.y).toBeCloseTo(expectedY);
  });

  it("maps top-left of canvas (0,0 client on rect)", () => {
    const rect = makeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const result = DesignerModePositions.screenToGame({ x: 0, y: 0 }, rect);
    // canvasX=0, canvasY=0
    // unscaledX = CENTER + (0 - CENTER)/SCALE = CENTER - CENTER/SCALE
    const unscaledX = FIGURE_CENTER_X + (0 - FIGURE_CENTER_X) / FIGURE_SCALE;
    const unscaledCanvasY = FIGURE_CENTER_Y + (0 - FIGURE_CENTER_Y) / FIGURE_SCALE;
    const adjustedCanvasY = unscaledCanvasY - Y_OFFSET;
    const expectedY = GAME_HEIGHT - adjustedCanvasY;
    expect(result.x).toBeCloseTo(unscaledX);
    expect(result.y).toBeCloseTo(expectedY);
  });

  it("accounts for display scaling (canvas displayed at half size)", () => {
    // Canvas element is displayed at half its logical size
    const rect = makeRect(100, 50, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    // Click at offset (100, 50) → top-left of canvas display → same as canvasX=0, canvasY=0
    const result = DesignerModePositions.screenToGame({ x: 100, y: 50 }, rect);
    const unscaledX = FIGURE_CENTER_X + (0 - FIGURE_CENTER_X) / FIGURE_SCALE;
    expect(result.x).toBeCloseTo(unscaledX);
  });
});

describe("gameToTransformedCanvas", () => {
  it("flips Y using Terrain.WORLD_TOP", () => {
    const result = DesignerModePositions.gameToTransformedCanvas({ x: 100, y: 200 });
    expect(result.x).toBe(100);
    expect(result.y).toBe(Terrain.WORLD_TOP - 200);
  });

  it("maps ground level (y=0) to canvas bottom", () => {
    const result = DesignerModePositions.gameToTransformedCanvas({ x: 0, y: 0 });
    expect(result.y).toBe(Terrain.WORLD_TOP);
  });
});

describe("transformAbsToRelPosition", () => {
  it("identity transform returns same position", () => {
    const transform = new EntityTransform({ x: 0, y: 0 }, 0, 1);
    const result = DesignerModePositions.transformAbsToRelPosition({ x: 10, y: 20 }, transform);
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(20);
  });

  it("accounts for transform position offset", () => {
    const transform = new EntityTransform({ x: 100, y: 50 }, 0, 1);
    const result = DesignerModePositions.transformAbsToRelPosition({ x: 110, y: 70 }, transform);
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(20);
  });

  it("accounts for facing=-1", () => {
    const transform = new EntityTransform({ x: 100, y: 50 }, 0, -1);
    const result = DesignerModePositions.transformAbsToRelPosition({ x: 90, y: 70 }, transform);
    // reverse: relX = (90 - 100) / (-1) = 10
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(20);
  });

  it("accounts for rotation", () => {
    const transform = new EntityTransform({ x: 100, y: 50 }, Math.PI / 4, 1);
    const result = DesignerModePositions.transformAbsToRelPosition({ x: 100, y: 50 }, transform);
    // Same position as transform → relative is origin
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });
});

describe("convertAbsToWeaponRatioPosition", () => {
  it("returns clamped values by default", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    // An extreme position far from the weapon should clamp
    const farPosition: Vector2 = { x: -1000, y: -1000 };
    const result = DesignerModePositions.convertAbsToWeaponRatioPosition(farPosition, player, true);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(1);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThanOrEqual(1);
  });

  it("returns unclamped values when clamp=false", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    // An extreme position far from the weapon may be outside [0,1]
    const farPosition: Vector2 = { x: -1000, y: -1000 };
    const result = DesignerModePositions.convertAbsToWeaponRatioPosition(farPosition, player, false);
    // At least one coordinate should be outside [0,1]
    const isOutside = result.x < 0 || result.x > 1 || result.y < 0 || result.y > 1;
    expect(isOutside).toBe(true);
  });
});

describe("getPrimaryHandAbsPosition / getSecondaryHandAbsPosition", () => {
  it("returns a position for primary hand", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    const pos = DesignerModePositions.getPrimaryHandAbsPosition(player);
    expect(pos.x).toBeDefined();
    expect(pos.y).toBeDefined();
    // Primary hand should be near the player's x (within arm+weapon reach)
    expect(Math.abs(pos.x - FIGURE_CENTER_X)).toBeLessThan(100);
  });

  it("returns null for secondary hand when weapon has no secondary hold", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    // Default weapon is Webley Revolver which has secondaryHoldRatioPosition: null
    const result = DesignerModePositions.getSecondaryHandAbsPosition(player);
    expect(result).toBeNull();
  });

  it("returns position for secondary hand when weapon has secondary hold", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    // Switch to a weapon with secondary hold (index 1 = Rifle a main offensive)
    player.arsenal.switchToNextWeapon();
    const result = DesignerModePositions.getSecondaryHandAbsPosition(player);
    expect(result).not.toBeNull();
    expect(result!.x).toBeDefined();
    expect(result!.y).toBeDefined();
  });
});

describe("getAbsPositionForWeaponRatioPosition", () => {
  it("ratio {0,0} and {1,1} are different positions", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    const pos00 = DesignerModePositions.getAbsPositionForWeaponRatioPosition(player, { x: 0, y: 0 });
    const pos11 = DesignerModePositions.getAbsPositionForWeaponRatioPosition(player, { x: 1, y: 1 });
    // They should be different
    expect(pos00.x !== pos11.x || pos00.y !== pos11.y).toBe(true);
  });

  it("ratio {0.5, 0.5} is the weapon center", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    const center = DesignerModePositions.getAbsPositionForWeaponRatioPosition(player, { x: 0.5, y: 0.5 });
    // Center should be near the player
    expect(Math.abs(center.x - FIGURE_CENTER_X)).toBeLessThan(100);
  });
});

describe("getNewHoldRatioPositionForControlRatioPosition", () => {
  it("no movement returns same hold position", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    const controlRatio = { x: 1, y: 1 };
    // Get current absolute position of the control point
    const currentAbsPos = DesignerModePositions.getAbsPositionForWeaponRatioPosition(player, controlRatio);
    // Move to the same position → hold should not change
    const newHold = DesignerModePositions.getNewHoldRatioPositionForControlRatioPosition(player, controlRatio, currentAbsPos);
    const currentHold = player.getHeldObject().type.primaryHoldRatioPosition;
    expect(newHold.x).toBeCloseTo(currentHold.x, 1);
    expect(newHold.y).toBeCloseTo(currentHold.y, 1);
  });

  it("result is clamped to [0,1]", () => {
    const player = new Player(FIGURE_CENTER_X, FIGURE_CENTER_Y + 25);
    // Move the control point very far → should clamp
    const farPos: Vector2 = { x: -5000, y: -5000 };
    const result = DesignerModePositions.getNewHoldRatioPositionForControlRatioPosition(player, { x: 1, y: 1 }, farPos);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(1);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThanOrEqual(1);
  });
});
