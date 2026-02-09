import { BoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { StraightAimLineFigure } from "./StraightAimLineFigure";
import { renderSVGAtTransform } from "./SVGRendering";
import { SVGInfo } from "../util/SVGLoader";
import { EntityTransform } from "../game/EntityTransform";
import { LaunchingWeapon } from "../game/LaunchingWeapon";
import { BoundingBoxFigure } from "./BoundingBoxFigure";

export class LaunchingWeaponFigure {
  static renderSVG({
    ctx,
    transform,
    svgInfo,
    bounds
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    svgInfo: SVGInfo;
    bounds: BoundingBox;
  }) {
    renderSVGAtTransform({ ctx, transform, svgInfo, boundingBox: bounds });
  }

  static renderBasic({
    ctx,
    transform,
    launcher
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    launcher: LaunchingWeapon;
  }) {
    const position = transform.position;
    const muzzleTransform = launcher.getMuzzleTransform(transform);
    
    ctx.save();
    ctx.strokeStyle = "darkgreen";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y));
    ctx.lineTo(muzzleTransform.position.x, toCanvasY(muzzleTransform.position.y));
    ctx.stroke();
    ctx.restore();
  }

  static render({
    ctx,
    transform,
    launcher,
    showAimLine = false
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    launcher: LaunchingWeapon;
    showAimLine?: boolean;
  }) {
    const { svgInfo, bounds } = launcher;

    if (svgInfo) {
      this.renderSVG({ ctx, transform, svgInfo, bounds });
    } else {
      this.renderBasic({ ctx, transform, launcher });
    }

    // Debug: render bounding box
    BoundingBoxFigure.renderRotated({ ctx, boundingBox: bounds, transform });

    if (showAimLine) {
      const muzzleTransform = launcher.getMuzzleTransform(transform);
      
      StraightAimLineFigure.render({
        ctx,
        transform: muzzleTransform,
        length: launcher.rocketType.speed
      });
    }
  }

} 

