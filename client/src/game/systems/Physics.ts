import { GameObject } from "@/game/types/interfaces";

export class Physics {
  public static readonly GRAVITY = 1500;

  /**
   * Updates velocity and position based on gravity
   * @param gameObject The game object to apply gravity to
   * @param deltaTime Time elapsed since last frame
   */
  public static applyGravity(gameObject: GameObject, deltaTime: number): void {
    // Apply gravity to velocity
    gameObject.velocity.y -= Physics.GRAVITY * deltaTime;

    // Update position based on velocity
    const oldX = gameObject.transform.position.x;
    gameObject.transform.position.x += gameObject.velocity.x * deltaTime;
    const positionChange = Math.abs(gameObject.transform.position.x - oldX);
    if (positionChange > 50) {
      console.log(`[WARNING, LARGE JUMP] Physics: x velocity=${gameObject.velocity.x.toFixed(2)}, position ${oldX.toFixed(2)} -> ${gameObject.transform.position.x.toFixed(2)} (change: ${positionChange.toFixed(2)})`);
    }
    gameObject.transform.position.y += gameObject.velocity.y * deltaTime;
  }
} 