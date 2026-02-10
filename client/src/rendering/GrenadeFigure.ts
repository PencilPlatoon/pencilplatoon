import { toCanvasY } from "@/game/world/Terrain";
import type { Grenade } from "@/game/entities/Grenade";
import { renderCenteredSVG } from "./SVGRendering";
import { BoundingBoxFigure } from "./BoundingBoxFigure";

export class GrenadeFigure {
  static render({
    ctx,
    grenade
  }: {
    ctx: CanvasRenderingContext2D;
    grenade: Grenade;
  }) {
    const transform = grenade.transform;
    const svgInfo = grenade.svgInfo;
    const boundingBox = grenade.bounds;
    const position = transform.position;
    const canvasY = toCanvasY(position.y);

    // Draw grenade SVG if loaded, otherwise fallback to circle
    if (svgInfo) {
      renderCenteredSVG(ctx, position, canvasY, transform.rotation, svgInfo, grenade.type.size);
    } else {
      ctx.save();
      ctx.fillStyle = 'green';
      ctx.beginPath();
      ctx.arc(
        position.x,
        canvasY,
        boundingBox.width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    // Debug bounding box
    BoundingBoxFigure.render(ctx, boundingBox.getAbsoluteBounds(position), 'blue');
  }
}
