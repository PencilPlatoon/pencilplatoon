import { Player } from '../game/Player';
import { HumanFigure } from '../figures/HumanFigure';
import { EntityTransform } from '../game/EntityTransform';
import { Vector2, Vector2Utils } from '../game/Vector2';
import { toCanvasY as gameToCanvasY } from '../game/Terrain';

export class DesignerModePositions {
  static readonly CANVAS_WIDTH = 1200;
  static readonly CANVAS_HEIGHT = 800;
  static readonly FIGURE_SCALE = 4;
  static readonly FIGURE_CENTER_X = DesignerModePositions.CANVAS_WIDTH / 2;
  static readonly FIGURE_CENTER_Y = DesignerModePositions.CANVAS_HEIGHT / 2;
  static readonly GAME_HEIGHT = 600;
  static readonly Y_OFFSET = DesignerModePositions.CANVAS_HEIGHT - DesignerModePositions.GAME_HEIGHT;

  /**
   * Generic function to transform absolute coordinates to local coordinates relative to a transform
   * @param absPosition - Absolute position in world coordinates
   * @param transform - The transform to convert relative to
   * @returns Local coordinates relative to the transform
   */
  static transformAbsToRelPosition(absPosition: Vector2, transform: EntityTransform): Vector2 {
    const absoluteTransform = new EntityTransform(absPosition, transform.rotation, transform.facing);
    const relativeTransform = transform.reverseTransform(absoluteTransform);
    return relativeTransform.position;
  }

  /**
   * Converts absolute world coordinates to ratio weapon coordinates
   * @param absPosition - Absolute position in world coordinates
   * @param player - Player instance to get weapon transform
   * @param clamp - Whether to clamp the result to [0, 1] range (default: true)
   * @returns Ratio coordinates (clamped if clamp is true, otherwise may be outside 0-1 range)
   */
  static convertAbsToWeaponRatioPosition(absPosition: Vector2, player: Player, clamp: boolean = true): Vector2 {
    const holdableObject = player.getHeldObject();
    const weaponAbsTransform = player.getWeaponAbsTransform();

    const relPosition = DesignerModePositions.transformAbsToRelPosition(absPosition, weaponAbsTransform);
    
    // Use BoundingBox method to convert relative position to ratio position
    return holdableObject.bounds.convertRelToRatioPosition(relPosition, clamp);
  }

  static getPrimaryHandAbsPosition(player: Player): Vector2 {
    const holdableObject = player.getHeldObject();
    const weaponRelTransform = player.getWeaponRelTransform();

    // Calculate primary hand position (always present)
    const primaryHandRelPosition = HumanFigure.getHandPositionForWeapon(
      weaponRelTransform,
      holdableObject.type,
      holdableObject.bounds.height,
      holdableObject.type.primaryHoldRatioPosition
    );

    return player.transform.applyTransform(new EntityTransform(primaryHandRelPosition, 0, 1)).position;
  }

  static getSecondaryHandAbsPosition(player: Player): Vector2 | null {
    const holdableObject = player.getHeldObject();
    
    // Check if secondary hand exists
    if (holdableObject.type.secondaryHoldRatioPosition === null) {
      return null;
    }

    const weaponRelTransform = player.getWeaponRelTransform();

    // Calculate secondary hand position
    const secondaryHandRelPosition = HumanFigure.getHandPositionForWeapon(
      weaponRelTransform,
      holdableObject.type,
      holdableObject.bounds.height,
      holdableObject.type.secondaryHoldRatioPosition
    );

    return player.transform.applyTransform(new EntityTransform(secondaryHandRelPosition, 0, 1)).position;
  }

  // Apply all transforms to canvas context for game rendering
  static applyGameTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(DesignerModePositions.FIGURE_CENTER_X, DesignerModePositions.FIGURE_CENTER_Y);
    ctx.scale(DesignerModePositions.FIGURE_SCALE, DesignerModePositions.FIGURE_SCALE);
    ctx.translate(-DesignerModePositions.FIGURE_CENTER_X, -DesignerModePositions.FIGURE_CENTER_Y);
    ctx.translate(0, DesignerModePositions.Y_OFFSET);
  }

  // Convert screen mouse event to game coordinates
  static screenToGame(clientPos: Vector2, canvasRect: DOMRect): Vector2 {
    // Scale from display size to canvas size
    const canvasX = (clientPos.x - canvasRect.left) * (DesignerModePositions.CANVAS_WIDTH / canvasRect.width);
    const canvasY = (clientPos.y - canvasRect.top) * (DesignerModePositions.CANVAS_HEIGHT / canvasRect.height);
    
    // Unscale from 4x zoom
    const unscaledX = DesignerModePositions.FIGURE_CENTER_X + (canvasX - DesignerModePositions.FIGURE_CENTER_X) / DesignerModePositions.FIGURE_SCALE;
    const unscaledCanvasY = DesignerModePositions.FIGURE_CENTER_Y + (canvasY - DesignerModePositions.FIGURE_CENTER_Y) / DesignerModePositions.FIGURE_SCALE;
    
    // Remove Y offset and convert to game coords
    const adjustedCanvasY = unscaledCanvasY - DesignerModePositions.Y_OFFSET;
    return {
      x: unscaledX,
      y: DesignerModePositions.GAME_HEIGHT - adjustedCanvasY
    };
  }

  // Convert game coordinates to transformed canvas coordinates (for drawing)
  static gameToTransformedCanvas(gamePos: Vector2): Vector2 {
    return {
      x: gamePos.x,
      y: gameToCanvasY(gamePos.y)
    };
  }

  /**
   * Helper function to calculate absolute position of a ratio point on the weapon
   * @param player - Player instance to get weapon
   * @param controlRatioPosition - Ratio coordinates (0-1) on the weapon being positioned
   * @param holdRatioPosition - Ratio coordinates (0-1) where the weapon is held
   * @returns Absolute world position of the ratio point
   */
  private static getAbsPositionForRatioPointWithHold(
    player: Player,
    controlRatioPosition: Vector2,
    holdRatioPosition: Vector2
  ): Vector2 {
    const holdableObject = player.getHeldObject();
    const weaponAbsTransform = player.getWeaponAbsTransform();
    
    // Get transform for the rotated offset from hold ratio position to control ratio position
    const offsetTransform = holdableObject.bounds.getTransformForRatioPositions(
      controlRatioPosition,
      holdRatioPosition,
      weaponAbsTransform.rotation
    );
    
    // Apply facing and get the final world position
    return weaponAbsTransform.applyTransform(offsetTransform).position;
  }

  /**
   * Calculates the absolute world position of a specific ratio point on the weapon
   * @param player - Player instance to get weapon transform
   * @param controlRatioPosition - Ratio coordinates (0-1) on the weapon, e.g. { x: 0.5, y: 0.5 } for center
   * @returns Absolute world position of the ratio point
   */
  static getAbsPositionForWeaponRatioPosition(player: Player, controlRatioPosition: Vector2): Vector2 {
    const holdableObject = player.getHeldObject();
    return DesignerModePositions.getAbsPositionForRatioPointWithHold(
      player,
      controlRatioPosition,
      holdableObject.type.primaryHoldRatioPosition
    );
  }
  
  /**
   * Calculates the updated grip ratio position when a weapon ratio point is dragged to a new absolute position
   * @param player - Player instance to get weapon
   * @param controlRatioPosition - The ratio point being moved (e.g. { x: 0.5, y: 0.5 } for center)
   * @param newControlAbsPosition - The new absolute world position where the ratio point should be
   * @returns Updated grip ratio position
   */
  static getNewHoldRatioPositionForControlRatioPosition(
    player: Player,
    controlRatioPosition: Vector2,
    newControlAbsPosition: Vector2
  ): Vector2 {
    const holdableObject = player.getHeldObject();
    const currentHoldRatioPosition = holdableObject.type.primaryHoldRatioPosition;
    
    // Convert the dragged position to weapon ratio coordinates (unclamped to allow detection of drags beyond weapon bounds)
    const newControlRatioPosition = DesignerModePositions.convertAbsToWeaponRatioPosition(newControlAbsPosition, player, false);
    
    // Calculate grip shift to keep the target ratio point at the dragged position
    const ratioPositionDelta = Vector2Utils.subtract(newControlRatioPosition, controlRatioPosition);
    
    // Update hold ratio position and clamp to valid ratio bounds [0, 1]
    const newHoldRatioPosition = Vector2Utils.subtract(currentHoldRatioPosition, ratioPositionDelta);
    return Vector2Utils.clampToRatioBounds(newHoldRatioPosition);
  }
}

