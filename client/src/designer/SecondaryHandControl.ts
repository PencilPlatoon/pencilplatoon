import { MoveableControl } from './MoveableControl';
import { DesignerModePositions } from './DesignerModePositions';
import { Player } from '../game/Player';
import { Vector2 } from '../game/Vector2';
import { HandControlFigure } from './figures/HandControlFigure';

export class SecondaryHandControl implements MoveableControl {
  id = 'secondary' as const;
  color = 'rgba(0, 255, 0, 0.5)';
  hoverColor = 'rgba(100, 255, 100, 0.7)';
  private player: Player;

  constructor(player: Player) {
    this.player = player;
  }

  getAbsPosition() {
    return DesignerModePositions.getSecondaryHandAbsPosition(this.player);
  }

  updateAbsPosition(controlAbsPosition: Vector2) {
    const heldObject = this.player.getHeldObject();
    const ratioPosition = DesignerModePositions.convertAbsToWeaponRatioPosition(controlAbsPosition, this.player);
    heldObject.updateSecondaryHoldRatioPosition(ratioPosition);
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

