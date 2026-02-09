import { AbsoluteBoundingBox, BoundingBox, BoundingPositions } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

const isDebugMode = (): boolean =>
  typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;

const withDebugDraw = (ctx: CanvasRenderingContext2D, draw: () => void): void => {
  if (!isDebugMode()) return;
  ctx.save();
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 1;
  draw();
  ctx.restore();
};

export class BoundingBoxFigure {
  static render(ctx: CanvasRenderingContext2D, absBounds: AbsoluteBoundingBox) {
    withDebugDraw(ctx, () => {
      const width = absBounds.lowerRight.x - absBounds.upperLeft.x;
      const height = absBounds.upperLeft.y - absBounds.lowerRight.y;
      ctx.strokeRect(
        absBounds.upperLeft.x,
        toCanvasY(absBounds.upperLeft.y),
        width,
        height
      );
    });
  }

  static renderPositions(ctx: CanvasRenderingContext2D, boundingPositions: BoundingPositions) {
    withDebugDraw(ctx, () => {
      const positions = boundingPositions.positions;
      ctx.beginPath();
      ctx.moveTo(positions[0].x, toCanvasY(positions[0].y));
      ctx.lineTo(positions[1].x, toCanvasY(positions[1].y));
      ctx.lineTo(positions[2].x, toCanvasY(positions[2].y));
      ctx.lineTo(positions[3].x, toCanvasY(positions[3].y));
      ctx.closePath();
      ctx.stroke();
    });
  }

  static renderRotated({
    ctx,
    boundingBox,
    transform
  }: {
    ctx: CanvasRenderingContext2D;
    boundingBox: BoundingBox;
    transform: EntityTransform;
  }) {
    withDebugDraw(ctx, () => {
      const position = transform.position;
      ctx.translate(position.x, toCanvasY(position.y));
      ctx.rotate(transform.facing === 1 ? -transform.rotation : transform.rotation);
      ctx.scale(transform.facing, 1);

      const width = boundingBox.width;
      const height = boundingBox.height;
      const refX = width * boundingBox.refRatioPosition.x;
      const refY = height * boundingBox.refRatioPosition.y;

      ctx.strokeRect(-refX, refY - height, width, height);
    });
  }
}
