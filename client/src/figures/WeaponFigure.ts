import { Vector2, WeaponType } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class WeaponFigure {
  static render({
    ctx,
    position, // Now expected to be the weapon base
    facing,
    aimAngle,
    weapon,
    showAimLine = false,
    weaponLength = 20,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2; // weapon base
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    showAimLine?: boolean;
    weaponLength?: number;
    aimLineLength?: number;
  }) {
    // Weapon/arm line
    const weaponX = position.x;
    const weaponY = position.y;
    let weaponEndX, weaponEndY;
    if (showAimLine) {
      weaponEndX = weaponX + Math.cos(aimAngle) * weaponLength * facing;
      weaponEndY = weaponY + Math.sin(aimAngle) * weaponLength;
    } else {
      weaponEndX = weaponX + facing * weaponLength;
      weaponEndY = weaponY;
    }
    ctx.save();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(weaponX, toCanvasY(weaponY));
    ctx.lineTo(weaponEndX, toCanvasY(weaponEndY));
    ctx.stroke();
    // Draw dashed aiming line (for player only)
    if (showAimLine) {
      const aimLineLen = aimLineLength;
      const aimEndX = weaponX + Math.cos(aimAngle) * aimLineLen * facing;
      const aimEndY = weaponY + Math.sin(aimAngle) * aimLineLen;
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(weaponEndX, toCanvasY(weaponEndY));
      ctx.lineTo(aimEndX, toCanvasY(aimEndY));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
} 