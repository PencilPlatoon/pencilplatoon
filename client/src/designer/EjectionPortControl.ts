import { MoveableControl } from './MoveableControl';
import { DesignerModePositions } from './DesignerModePositions';
import { Player } from '@/game/entities/Player';
import { ShootingWeapon } from '@/game/weapons/ShootingWeapon';
import { Vector2 } from '@/game/types/Vector2';
import { HandControlFigure } from './rendering/HandControlFigure';

export class EjectionPortControl implements MoveableControl {
  id = 'ejectionPort' as const;
  color = 'rgba(255, 140, 0, 0.5)';
  hoverColor = 'rgba(255, 180, 50, 0.7)';
  private player: Player;

  constructor(player: Player) {
    this.player = player;
  }

  private getShootingWeapon(): ShootingWeapon | null {
    const held = this.player.getHeldObject();
    return held instanceof ShootingWeapon ? held : null;
  }

  getAbsPosition(): Vector2 | null {
    const weapon = this.getShootingWeapon();
    if (!weapon) return null;
    const ratioPos = weapon.getEjectionPortRatioPosition();
    return DesignerModePositions.getAbsPositionForWeaponRatioPosition(this.player, ratioPos);
  }

  updateAbsPosition(controlAbsPosition: Vector2): void {
    const weapon = this.getShootingWeapon();
    if (!weapon) return;
    const ratioPosition = DesignerModePositions.convertAbsToWeaponRatioPosition(controlAbsPosition, this.player);
    weapon.updateEjectionPortRatioPosition(ratioPosition);
  }

  render({ ctx, position, isHovered }: { ctx: CanvasRenderingContext2D; position: Vector2; isHovered: boolean }): void {
    HandControlFigure.render({ ctx, position, control: this, isHovered });
  }

  isMouseWithin(mousePos: Vector2): boolean {
    const pos = this.getAbsPosition();
    if (!pos) return false;
    return HandControlFigure.isMouseWithin(mousePos, pos);
  }
}
