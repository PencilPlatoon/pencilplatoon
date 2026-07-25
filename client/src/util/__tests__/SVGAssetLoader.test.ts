import { describe, it, expect } from "vitest";
import { calculateDisplaySize, scaleToFit } from "@/util/SVGAssetLoader";
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

describe("scaleToFit", () => {
  it("leaves a size that already fits unchanged", () => {
    const result = scaleToFit({ displayWidth: 40, displayHeight: 20 }, 64, 48);
    expect(result.displayWidth).toBeCloseTo(40);
    expect(result.displayHeight).toBeCloseTo(20);
  });

  it("never scales up sizes smaller than the bounds", () => {
    const result = scaleToFit({ displayWidth: 10, displayHeight: 5 }, 64, 48);
    expect(result.displayWidth).toBeCloseTo(10);
    expect(result.displayHeight).toBeCloseTo(5);
  });

  it("shrinks by width when width is the binding constraint", () => {
    const result = scaleToFit({ displayWidth: 80, displayHeight: 20 }, 64, 48);
    // scale = 64/80 = 0.8
    expect(result.displayWidth).toBeCloseTo(64);
    expect(result.displayHeight).toBeCloseTo(16);
  });

  it("shrinks by height when height is the binding constraint", () => {
    const result = scaleToFit({ displayWidth: 30, displayHeight: 96 }, 64, 48);
    // scale = 48/96 = 0.5
    expect(result.displayWidth).toBeCloseTo(15);
    expect(result.displayHeight).toBeCloseTo(48);
  });

  it("uses the smaller scale when both dimensions overflow", () => {
    const result = scaleToFit({ displayWidth: 128, displayHeight: 192 }, 64, 48);
    // width scale = 0.5, height scale = 0.25 -> 0.25 wins
    expect(result.displayWidth).toBeCloseTo(32);
    expect(result.displayHeight).toBeCloseTo(48);
  });

  it("preserves aspect ratio", () => {
    const result = scaleToFit({ displayWidth: 200, displayHeight: 50 }, 64, 48);
    expect(result.displayWidth / result.displayHeight).toBeCloseTo(4);
  });

  it("returns degenerate sizes untouched", () => {
    const result = scaleToFit({ displayWidth: 0, displayHeight: 0 }, 64, 48);
    expect(result.displayWidth).toBe(0);
    expect(result.displayHeight).toBe(0);
  });
});
