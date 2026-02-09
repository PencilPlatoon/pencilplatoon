import { BoundingBox } from "@/game/types/BoundingBox";
import { toCanvasY } from "@/game/world/Terrain";
import { SVGInfo } from "@/util/SVGLoader";
import { EntityTransform } from "@/game/types/EntityTransform";

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
