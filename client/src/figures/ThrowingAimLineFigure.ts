import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";
import { Vector2 } from "../game/types";
import { Physics } from "../game/Physics";

export class ThrowingAimLineFigure {
  static readonly AIM_LINE_LENGTH = 100;
  static readonly LINE_WIDTH = 2;

  static render({
    ctx,
    transform,
    velocity,
    mode
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    velocity: number;
    mode: "Max" | "Charging";
  }) {
    const position = transform.position;
    
    const throwVelocity: Vector2 = {
      x: Math.cos(transform.rotation) * transform.facing * velocity,
      y: Math.sin(transform.rotation) * velocity
    };

    const color = mode === "Max" ? "red" : "black";

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = this.LINE_WIDTH;
    ctx.setLineDash([5, 5]);
    
    // Simulate grenade trajectory for the aim line
    const gravity = Physics.GRAVITY;
    const timeStep = 0.05;
    let currentPos = { x: position.x, y: position.y };
    let currentVel = { x: throwVelocity.x, y: throwVelocity.y };
    
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y));
    
    for (let t = 0; t < 3; t += timeStep) {
      currentPos.x += currentVel.x * timeStep;
      currentPos.y += currentVel.y * timeStep;
      currentVel.y -= gravity * timeStep;
      
      ctx.lineTo(currentPos.x, toCanvasY(currentPos.y));
      
      // Stop if we've drawn enough length
      const distance = Math.sqrt(
        Math.pow(currentPos.x - position.x, 2) + 
        Math.pow(currentPos.y - position.y, 2)
      );
      if (distance > this.AIM_LINE_LENGTH) break;
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

