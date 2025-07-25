import { Vector2, WeaponType } from "../game/types";
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
    holdOffset,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    svgInfo?: SVGInfo | null;
    holdOffset: number;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    if (svgInfo) {
      ctx.save();
      ctx.translate(position.x, toCanvasY(position.y));
      ctx.rotate(facing === 1 ? -aimAngle : aimAngle);
      ctx.scale(facing, 1);
      const svgWidth = svgInfo.boundingBox.width;
      const svgHeight = svgInfo.boundingBox.height;
      const scale = weapon.weaponLength / svgWidth;
      ctx.scale(scale, scale);
      // Shift by -holdOffset so the hold point aligns with the hand
      ctx.drawImage(svgInfo.image, -holdOffset, -svgHeight / 2, svgWidth, svgHeight);
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
    this.renderBasic({ ctx, position, facing, aimAngle, weapon, holdOffset, showAimLine, aimLineLength });
  }

  static renderBasic({
    ctx,
    position,
    facing,
    aimAngle,
    weapon,
    holdOffset,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    holdOffset: number;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    const weaponX = position.x - Math.cos(aimAngle) * holdOffset * facing;
    const weaponY = position.y - Math.sin(aimAngle) * holdOffset;
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
    holdOffset
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    showAimLine?: boolean;
    aimLineLength?: number;
    svgInfo?: SVGInfo;
    holdOffset: number;
  }) {
    if (svgInfo) {
      this.renderSVG({ ctx, position, facing, aimAngle, weapon, svgInfo, holdOffset, showAimLine, aimLineLength });
    } else {
      this.renderBasic({ ctx, position, facing, aimAngle, weapon, holdOffset, showAimLine, aimLineLength });
    }
  }
} 