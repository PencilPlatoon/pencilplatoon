import { Vector2, WeaponType } from "../game/types";
import { BoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { AimLineFigure } from "./AimLineFigure";
import { SVGInfo } from "../util/SVGLoader";
import { EntityTransform } from "../game/EntityTransform";

export class WeaponFigure {
  static renderSVG({
    ctx,
    transform,
    weapon,
    svgInfo,
    boundingBox,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: WeaponType;
    svgInfo?: SVGInfo | null;
    boundingBox: BoundingBox;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    const position = transform.position;
    if (svgInfo) {
      ctx.save();
      // The passed-in position is the world reference point; draw SVG so that the reference point aligns with (0,0)
      ctx.translate(position.x, toCanvasY(position.y));
      ctx.rotate(transform.facing === 1 ? -transform.rotation : transform.rotation);
      ctx.scale(transform.facing, 1);
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
        const weaponEndX = position.x + Math.cos(transform.rotation) * weapon.weaponLength * transform.facing;
        const weaponEndY = position.y + Math.sin(transform.rotation) * weapon.weaponLength;
        const aimLineTransform = new EntityTransform({ x: weaponEndX, y: weaponEndY }, transform.rotation, transform.facing);
        AimLineFigure.render({
          ctx,
          transform: aimLineTransform,
          aimLineLength
        });
      }
      return;
    }
    // If not loaded, fallback to basic
    this.renderBasic({ ctx, transform, weapon, showAimLine, aimLineLength });
  }

  static renderBasic({
    ctx,
    transform,
    weapon,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: WeaponType;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    const position = transform.position;
    // The passed-in position is already the absolute reference point
    const weaponX = position.x;
    const weaponY = position.y;
    let weaponEndX, weaponEndY;
    if (showAimLine) {
      weaponEndX = weaponX + Math.cos(transform.rotation) * weapon.weaponLength * transform.facing;
      weaponEndY = weaponY + Math.sin(transform.rotation) * weapon.weaponLength;
    } else {
      weaponEndX = weaponX + transform.facing * weapon.weaponLength;
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
      const aimLineTransform = new EntityTransform({ x: weaponEndX, y: weaponEndY }, transform.rotation, transform.facing);
      AimLineFigure.render({
        ctx,
        transform: aimLineTransform,
        aimLineLength
      });
    }
  }

  static render({
    ctx,
    transform,
    weapon,
    showAimLine = false,
    aimLineLength = 100,
    svgInfo,
    boundingBox
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: WeaponType;
    showAimLine?: boolean;
    aimLineLength?: number;
    svgInfo?: SVGInfo;
    boundingBox: BoundingBox;
  }) {
    if (svgInfo) {
      this.renderSVG({ ctx, transform, weapon, svgInfo, boundingBox, showAimLine, aimLineLength });
    } else {
      this.renderBasic({ ctx, transform, weapon, showAimLine, aimLineLength });
    }
  }
} 