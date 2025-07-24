import { toCanvasY } from "../game/Terrain";

export class AimLineFigure {
  static render({
    ctx,
    weaponX,
    weaponY,
    aimAngle,
    aimLineLength,
    facing
  }: {
    ctx: CanvasRenderingContext2D;
    weaponX: number;
    weaponY: number;
    aimAngle: number;
    aimLineLength: number;
    facing: number;
  }) {
    const aimEndX = weaponX + Math.cos(aimAngle) * aimLineLength * facing;
    const aimEndY = weaponY + Math.sin(aimAngle) * aimLineLength;
    ctx.save();
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(weaponX, toCanvasY(weaponY));
    ctx.lineTo(aimEndX, toCanvasY(aimEndY));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
} 