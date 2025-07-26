import { Vector2, WeaponType } from "../game/types";
import { BoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { AimLineFigure } from "./AimLineFigure";
import { SVGInfo } from "../util/SVGLoader";

export class WeaponFigure {
  static renderSVG({
    ctx,
    position,
    facing,
    aimAngle,
    weapon,
    svgInfo,
    boundingBox,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    svgInfo?: SVGInfo | null;
    boundingBox: BoundingBox;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    if (svgInfo) {
      ctx.save();
      // The passed-in position is the world reference point; draw SVG so that the reference point aligns with (0,0)
      ctx.translate(position.x, toCanvasY(position.y));
      ctx.rotate(facing === 1 ? -aimAngle : aimAngle);
      ctx.scale(facing, 1);
      const svgWidth = svgInfo.boundingBox.width;
      const svgHeight = svgInfo.boundingBox.height;
      const scale = weapon.weaponLength / svgWidth;
      ctx.scale(scale, scale);
      // Draw SVG so that the reference point aligns with (0,0)
      const anchorX = svgWidth * boundingBox.relativeReferenceX;
      const anchorY = svgHeight * boundingBox.relativeReferenceY;
      ctx.drawImage(svgInfo.image, -anchorX, -anchorY, svgWidth, svgHeight);
      ctx.restore();
      if (showAimLine) {
        const weaponEndX = position.x + Math.cos(aimAngle) * weapon.weaponLength * facing;
        const weaponEndY = position.y + Math.sin(aimAngle) * weapon.weaponLength;
        AimLineFigure.render({
          ctx,
          weaponX: weaponEndX,
          weaponY: weaponEndY,
          aimAngle,
          aimLineLength,
          facing
        });
      }
      return;
    }
    // If not loaded, fallback to basic
    this.renderBasic({ ctx, position, facing, aimAngle, weapon, showAimLine, aimLineLength });
  }

  static renderBasic({
    ctx,
    position,
    facing,
    aimAngle,
    weapon,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    // The passed-in position is already the absolute reference point
    const weaponX = position.x;
    const weaponY = position.y;
    let weaponEndX, weaponEndY;
    if (showAimLine) {
      weaponEndX = weaponX + Math.cos(aimAngle) * weapon.weaponLength * facing;
      weaponEndY = weaponY + Math.sin(aimAngle) * weapon.weaponLength;
    } else {
      weaponEndX = weaponX + facing * weapon.weaponLength;
      weaponEndY = weaponY;
    }
    ctx.save();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(weaponX, toCanvasY(weaponY));
    ctx.lineTo(weaponEndX, toCanvasY(weaponEndY));
    ctx.stroke();
    ctx.restore();
    if (showAimLine) {
      AimLineFigure.render({
        ctx,
        weaponX: weaponEndX,
        weaponY: weaponEndY,
        aimAngle,
        aimLineLength,
        facing
      });
    }
  }

  static render({
    ctx,
    position,
    facing,
    aimAngle,
    weapon,
    showAimLine = false,
    aimLineLength = 100,
    svgInfo,
    boundingBox
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    showAimLine?: boolean;
    aimLineLength?: number;
    svgInfo?: SVGInfo;
    boundingBox: BoundingBox;
  }) {
    if (svgInfo) {
      this.renderSVG({ ctx, position, facing, aimAngle, weapon, svgInfo, boundingBox, showAimLine, aimLineLength });
    } else {
      this.renderBasic({ ctx, position, facing, aimAngle, weapon, showAimLine, aimLineLength });
    }
  }
} 