import { describe, it, expect } from "vitest";
import { calculateDisplaySize } from "@/util/SVGAssetLoader";
import { SVGObjectType } from "@/game/types/interfaces";
import { SVGInfo } from "@/util/SVGLoader";
import { BoundingBox } from "@/game/types/BoundingBox";

const makeSVGInfo = (width: number, height: number): SVGInfo => ({
  image: null as unknown as HTMLImageElement,
  boundingBox: new BoundingBox(width, height, { x: 0.5, y: 0.5 }),
});

const makeWeaponType = (size: number): SVGObjectType => ({
  name: "test",
  size,
  svgPath: "test.svg",
});

describe("calculateDisplaySize", () => {
  it("returns display width equal to obj.size", () => {
    const result = calculateDisplaySize(makeWeaponType(40), makeSVGInfo(100, 50));
    // scale = 40 / 100 = 0.4; displayWidth = 100 * 0.4 = 40
    expect(result.displayWidth).toBeCloseTo(40);
  });

  it("scales height proportionally", () => {
    const result = calculateDisplaySize(makeWeaponType(40), makeSVGInfo(100, 50));
    // scale = 0.4; displayHeight = 50 * 0.4 = 20
    expect(result.displayHeight).toBeCloseTo(20);
  });

  it("handles square SVGs", () => {
    const result = calculateDisplaySize(makeWeaponType(30), makeSVGInfo(60, 60));
    expect(result.displayWidth).toBeCloseTo(30);
    expect(result.displayHeight).toBeCloseTo(30);
  });

  it("handles tall SVGs", () => {
    const result = calculateDisplaySize(makeWeaponType(50), makeSVGInfo(50, 200));
    // scale = 50/50 = 1; displayHeight = 200
    expect(result.displayWidth).toBeCloseTo(50);
    expect(result.displayHeight).toBeCloseTo(200);
  });

  it("handles wide SVGs", () => {
    const result = calculateDisplaySize(makeWeaponType(25), makeSVGInfo(200, 10));
    // scale = 25/200 = 0.125; displayHeight = 10 * 0.125 = 1.25
    expect(result.displayWidth).toBeCloseTo(25);
    expect(result.displayHeight).toBeCloseTo(1.25);
  });
});
