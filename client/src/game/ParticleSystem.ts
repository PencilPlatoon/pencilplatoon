import { Particle, Vector2 } from "./types";
import { ParticleFigure } from "../figures/ParticleFigure";
import { EntityTransform } from "./EntityTransform";

export class ParticleSystem {
  private particles: Particle[] = [];

  createExplosion(position: Vector2, type: 'enemy' | 'player' | 'terrain' | 'grenade', explosionRadius?: number) {
    const colors = {
      enemy: ['#ff4444', '#ff8844', '#ffaa44', '#ffff44'],
      player: ['#ff2222', '#ff6666', '#ff9999'],
      terrain: ['#888888', '#aaaaaa', '#666666'],
      grenade: ['#ff6600', '#ff9900', '#ffcc00', '#ffff00', '#ff0000']
    };

    const particleCount = type === 'terrain' ? 8 : type === 'grenade' ? 20 : 12;
    const particleColors = colors[type];

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      
      // Scale particle speed based on explosion radius if provided
      const baseSpeed = explosionRadius ? explosionRadius * 1.5 : 150;
      const speed = baseSpeed + Math.random() * (baseSpeed * 0.5);
      const life = 0.5 + Math.random() * 0.5;

      const particle: Particle = {
        id: `particle_${Date.now()}_${i}`,
        transform: new EntityTransform({ x: position.x, y: position.y }),
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed
        },
        color: particleColors[Math.floor(Math.random() * particleColors.length)],
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

      // Update position
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
