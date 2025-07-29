import { Vector2, GameObject } from "./types";

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
    gameObject.transform.position.x += gameObject.velocity.x * deltaTime;
    gameObject.transform.position.y += gameObject.velocity.y * deltaTime;
  }
} 