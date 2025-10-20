import { BoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { LaunchingAimLineFigure } from "./LaunchingAimLineFigure";
import { SVGInfo } from "../util/SVGLoader";
import { EntityTransform } from "../game/EntityTransform";
import { LaunchingWeapon } from "../game/LaunchingWeapon";

export class LaunchingWeaponFigure {
  static renderSVG({
    ctx,
    transform,
    launcher,
    svgInfo,
    bounds
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    launcher: LaunchingWeapon;
    svgInfo: SVGInfo;
    bounds: BoundingBox;
  }) {
    const position = transform.position;

    ctx.save();
    ctx.translate(position.x, toCanvasY(position.y));
    ctx.rotate(transform.facing === 1 ? -transform.rotation : transform.rotation);
    ctx.scale(transform.facing, 1);
    const svgWidth = svgInfo.boundingBox.width;
    const svgHeight = svgInfo.boundingBox.height;
    const scale = launcher.type.size / svgWidth;
    ctx.scale(scale, scale);
    const anchorX = svgWidth * bounds.relativeReferenceX;
    const anchorY = svgHeight * bounds.relativeReferenceY;
    ctx.drawImage(svgInfo.image, -anchorX, -anchorY, svgWidth, svgHeight);
    ctx.restore();
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
      this.renderSVG({ ctx, transform, launcher, svgInfo, bounds });
    } else {
      this.renderBasic({ ctx, transform, launcher });
    }

    if (showAimLine) {
      const muzzleTransform = launcher.getMuzzleTransform(transform);
      
      LaunchingAimLineFigure.render({
        ctx,
        transform: muzzleTransform,
        rocketSpeed: launcher.rocketType.speed
      });
    }
  }

} 

