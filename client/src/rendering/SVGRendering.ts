import { BoundingBox } from "@/game/types/BoundingBox";
import { toCanvasY } from "@/game/world/Terrain";
import { SVGInfo } from "@/util/SVGLoader";
import { EntityTransform } from "@/game/types/EntityTransform";
import { Vector2 } from "@/game/types/Vector2";

export function renderSVGAtTransform({
  ctx,
  transform,
  svgInfo,
  boundingBox,
}: {
  ctx: CanvasRenderingContext2D;
  transform: EntityTransform;
  svgInfo: SVGInfo;
  boundingBox: BoundingBox;
}) {
  const position = transform.position;
  const width = boundingBox.width;
  const height = boundingBox.height;
  const refX = width * boundingBox.refRatioPosition.x;
  const refY = height * boundingBox.refRatioPosition.y;

  ctx.save();
  ctx.translate(position.x, toCanvasY(position.y));
  ctx.rotate(transform.facing === 1 ? -transform.rotation : transform.rotation);
  ctx.scale(transform.facing, 1);
  ctx.drawImage(svgInfo.image, -refX, refY - height, width, height);
  ctx.restore();
}

export function renderCenteredSVG(
  ctx: CanvasRenderingContext2D,
  position: Vector2,
  canvasY: number,
  rotation: number,
  svgInfo: SVGInfo,
  size: number
): void {
  ctx.save();
  ctx.translate(position.x, canvasY);
  ctx.rotate(-rotation);
  const scale = size / svgInfo.boundingBox.width;
  ctx.scale(scale, scale);
  const w = svgInfo.boundingBox.width;
  const h = svgInfo.boundingBox.height;
  ctx.drawImage(svgInfo.image, -w / 2, -h / 2, w, h);
  ctx.restore();
}
