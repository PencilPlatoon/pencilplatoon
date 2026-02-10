import { toCanvasY } from "@/game/world/Terrain";
import type { Rocket } from "@/game/entities/Rocket";
import type { EntityTransform } from "@/game/types/EntityTransform";
import { renderCenteredSVG } from "./SVGRendering";
import { BoundingBoxFigure } from "./BoundingBoxFigure";

export class RocketFigure {
  private static readonly STABILIZER_LENGTH_RATIO = 0.3;

  static render({
    ctx,
    rocket,
    transform
  }: {
    ctx: CanvasRenderingContext2D;
    rocket: Rocket;
    transform: EntityTransform;
  }) {
    const svgInfo = rocket.svgInfo;
    const boundingBox = rocket.bounds;
    const position = transform.position;
    const canvasY = toCanvasY(position.y);

    // Draw rocket SVG if loaded, otherwise fallback to shape
    if (svgInfo) {
      renderCenteredSVG(ctx, position, canvasY, transform.rotation, svgInfo, rocket.type.size);
    } else {
      // Fallback: Draw rocket as a rectangle
      ctx.save();
      ctx.translate(position.x, canvasY);
      ctx.rotate(-transform.rotation);
      ctx.fillStyle = 'red';
      const rocketWidth = boundingBox.width;
      const rocketHeight = boundingBox.width * 0.4;
      ctx.fillRect(-rocketWidth / 2, -rocketHeight / 2, rocketWidth, rocketHeight);
      ctx.restore();
    }

    // Draw spinning stabilizers on the rocket tail (only if launched)
    if (rocket.isLaunched) {
      ctx.save();
      ctx.translate(position.x, canvasY);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      const stabilizerLength = boundingBox.width * RocketFigure.STABILIZER_LENGTH_RATIO;

      const tailAngle = transform.rotation + Math.PI;
      const tailOffset = boundingBox.width / 2;
      const tailX = Math.cos(tailAngle) * tailOffset;
      const tailY = Math.sin(tailAngle) * tailOffset;

      for (let i = 0; i < 3; i++) {
        const angle = rocket.stabilizerRotation + (i * Math.PI * 2 / 3);
        const x2 = tailX + Math.cos(angle) * stabilizerLength;
        const y2 = tailY + Math.sin(angle) * stabilizerLength;

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Debug bounding box
    BoundingBoxFigure.render(ctx, boundingBox.getAbsoluteBounds(position), 'blue');
  }
}
