import { MoveableControl } from './MoveableControl';
import { DesignerModePositions } from './DesignerModePositions';
import { Player } from '@/game/entities/Player';
import { Vector2 } from '@/game/types/Vector2';
import { HandControlFigure } from './rendering/HandControlFigure';

export class MuzzlePositionControl implements MoveableControl {
  id = 'muzzle' as const;
  color = 'rgba(0, 100, 255, 0.5)';
  hoverColor = 'rgba(100, 150, 255, 0.7)';
  private player: Player;

  constructor(player: Player) {
    this.player = player;
  }

  getAbsPosition() {
    const heldObject = this.player.getHeldObject();
    return DesignerModePositions.getAbsPositionForWeaponRatioPosition(this.player, heldObject.type.muzzleRatioPosition);
  }

  updateAbsPosition(controlAbsPosition: Vector2) {
    const heldObject = this.player.getHeldObject();
    const ratioPosition = DesignerModePositions.convertAbsToWeaponRatioPosition(controlAbsPosition, this.player);
    heldObject.updateMuzzleRatioPosition(ratioPosition);
  }

  render({ ctx, position, isHovered }: { ctx: CanvasRenderingContext2D; position: Vector2; isHovered: boolean }) {
    HandControlFigure.render({ ctx, position, control: this, isHovered });
  }

  isMouseWithin(mousePos: Vector2): boolean {
    const pos = this.getAbsPosition();
    if (!pos) return false;
    return HandControlFigure.isMouseWithin(mousePos, pos);
  }
}
