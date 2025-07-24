import { Vector2, WeaponType } from "../game/types";
import { toCanvasY } from "../game/Terrain";
import { AimLineFigure } from "./AimLineFigure";

export class WeaponFigure {
  static render({
    ctx,
    position, // Now expected to be the weapon base
    facing,
    aimAngle,
    weapon,
    showAimLine = false,
    weaponLength,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2; // weapon base
    facing: number;
    aimAngle: number;
    weapon: WeaponType;
    showAimLine?: boolean;
    weaponLength: number;
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
    ctx.restore();
    // Draw dashed aiming line (for player only)
    if (showAimLine) {
      AimLineFigure.render({
        ctx,
        weaponX: weaponEndX,
        weaponY: weaponEndY,
        aimAngle,
        aimLineLength,
        facing
      });
    }
  }
} 