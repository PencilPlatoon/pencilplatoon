import { Casing, CasingEjection } from "@/game/types/interfaces";
import { CasingFigure } from "@/rendering/CasingFigure";

const MAX_CASINGS = 100;
const GRAVITY = -200;
const DAMPING = 0.98;

export class CasingSystem {
  private casings: Casing[] = [];

  createCasing(ejection: CasingEjection): void {
    const { position, direction, config } = ejection;

    const speedVariance = 0.7 + Math.random() * 0.6;
    const speed = config.ejectionSpeed * speedVariance;

    const angleVariance = (Math.random() - 0.5) * 0.4;
    const baseAngle = Math.atan2(direction.y, direction.x) + angleVariance;

    const lifeVariance = 0.8 + Math.random() * 0.4;

    const casing: Casing = {
      position: { x: position.x, y: position.y },
      velocity: {
        x: Math.cos(baseAngle) * speed,
        y: Math.sin(baseAngle) * speed,
      },
      rotation: 0,
      rotationSpeed: config.spinRate * (Math.random() > 0.5 ? 1 : -1),
      life: config.life * lifeVariance,
      maxLife: config.life * lifeVariance,
      config,
    };

    this.casings.push(casing);

    if (this.casings.length > MAX_CASINGS) {
      this.casings.shift();
    }
  }

  update(deltaTime: number): void {
    this.casings = this.casings.filter(casing => {
      casing.life -= deltaTime;
      if (casing.life <= 0) return false;

      casing.position.x += casing.velocity.x * deltaTime;
      casing.position.y += casing.velocity.y * deltaTime;

      casing.velocity.y += GRAVITY * deltaTime;
      casing.velocity.x *= DAMPING;
      casing.velocity.y *= DAMPING;

      casing.rotation += casing.rotationSpeed * deltaTime;

      return true;
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.casings.forEach(casing => {
      CasingFigure.render({ ctx, casing });
    });
  }

  clear(): void {
    this.casings = [];
  }

  getCasingCount(): number {
    return this.casings.length;
  }
}
