import { Particle } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class ParticleFigure {
  static render({
    ctx,
    particle
  }: {
    ctx: CanvasRenderingContext2D;
    particle: Particle;
  }) {
    ctx.save();
    const alpha = particle.life / particle.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(
      particle.position.x,
      toCanvasY(particle.position.y),
      particle.size,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }
} 