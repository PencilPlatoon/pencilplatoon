import { Particle, ExplosionParameters } from "@/game/types/interfaces";
import { ParticleFigure } from "@/rendering/ParticleFigure";
import { EntityTransform } from "@/game/types/EntityTransform";

export class ParticleSystem {
  private particles: Particle[] = [];

  createExplosion(params: ExplosionParameters) {
    const { position, radius, colors, particleCount } = params;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      
      const baseSpeed = radius * 1.5;
      const speed = baseSpeed + Math.random() * (baseSpeed * 0.5);
      const life = 0.5 + Math.random() * 0.5;

      const particle: Particle = {
        id: `particle_${Date.now()}_${i}`,
        transform: new EntityTransform({ x: position.x, y: position.y }),
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed
        },
        color: colors[Math.floor(Math.random() * colors.length)],
        life,
        maxLife: life,
        size: 3 + Math.random() * 4
      };

      this.particles.push(particle);
    }
  }

  update(deltaTime: number) {
    this.particles = this.particles.filter(particle => {
      particle.life -= deltaTime;
      
      if (particle.life <= 0) {
        return false;
      }

      particle.transform.position.x += particle.velocity.x * deltaTime;
      particle.transform.position.y += particle.velocity.y * deltaTime;

      // Apply gravity to some particles
      if (particle.color !== '#888888') {
        particle.velocity.y += -200 * deltaTime;
      }

      // Fade out
      particle.velocity.x *= 0.98;
      particle.velocity.y *= 0.98;

      return true;
    });
  }

  render(ctx: CanvasRenderingContext2D) {
    this.particles.forEach(particle => {
      ParticleFigure.render({ ctx, particle });
    });
  }

  clear() {
    this.particles = [];
  }
}
