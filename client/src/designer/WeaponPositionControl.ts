import { MoveableControl } from './MoveableControl';
import { DesignerModePositions } from './DesignerModePositions';
import { Player } from '../game/Player';
import { Vector2 } from '../game/Vector2';
import { WeaponPositionControlFigure } from './figures/WeaponPositionControlFigure';

export class WeaponPositionControl implements MoveableControl {
  static readonly CONTROL_RATIO_POSITION: Vector2 = { x: 1, y: 1 };
  
  id = 'weapon' as const;
  color = 'rgba(255, 0, 0, 0.5)';
  hoverColor = 'rgba(255, 100, 100, 0.7)';
  private player: Player;

  constructor(player: Player) {
    this.player = player;
  }

  getAbsPosition(): Vector2 {
    return DesignerModePositions.getAbsPositionForWeaponRatioPosition(this.player, WeaponPositionControl.CONTROL_RATIO_POSITION);
  }

  updateAbsPosition(controlAbsPosition: Vector2) {
    const newHoldRatioPosition = DesignerModePositions.getNewHoldRatioPositionForControlRatioPosition(
      this.player,
      WeaponPositionControl.CONTROL_RATIO_POSITION,
      controlAbsPosition
    );
    
    const heldObject = this.player.getHeldObject();
    heldObject.updatePrimaryHoldRatioPosition(newHoldRatioPosition);
  }

  render({ ctx, position, isHovered }: { ctx: CanvasRenderingContext2D; position: Vector2; isHovered: boolean }) {
    WeaponPositionControlFigure.render({ ctx, position, control: this, isHovered });
  }

  isMouseWithin(mousePos: Vector2): boolean {
    const pos = this.getAbsPosition();
    if (!pos) return false;
    return WeaponPositionControlFigure.isMouseWithin(mousePos, pos);
  }
}
