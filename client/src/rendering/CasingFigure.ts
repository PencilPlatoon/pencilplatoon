import { Casing } from "@/game/types/interfaces";
import { toCanvasY } from "@/game/world/Terrain";

export class CasingFigure {
  static render({
    ctx,
    casing,
  }: {
    ctx: CanvasRenderingContext2D;
    casing: Casing;
  }) {
    const alpha = casing.life / casing.maxLife;
    const { width, height, color, outlineColor } = casing.config;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(casing.position.x, toCanvasY(casing.position.y));
    ctx.rotate(-casing.rotation);

    ctx.fillStyle = color;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-width / 2, -height / 2, width, height);

    ctx.restore();
  }
}
