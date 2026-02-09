import { Particle } from "../game/types/interfaces";
import { toCanvasY } from "../game/world/Terrain";

export class ParticleFigure {
  static render({
    ctx,
    particle
  }: {
    ctx: CanvasRenderingContext2D;
    particle: Particle;
  }) {
    const position = particle.transform.position;
    ctx.save();
    const alpha = particle.life / particle.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(
      position.x,
      toCanvasY(position.y),
      particle.size,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }
} 