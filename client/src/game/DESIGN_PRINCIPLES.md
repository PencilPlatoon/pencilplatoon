# Game Classes Design Principles

This document outlines the design principles used in the game classes for the game's logic and state management.

## Shared Design Principles

- Principle: Make game state easy to reason about
  - Sub principle: Use constants for game values that don't change while the game is running
    - Implementation: Use static readonly constants for values like MAX_HEALTH, SPEED, JUMP_FORCE
    - Implementation: Use DETECTION_RANGE and SHOOTING_RANGE constants
    - Implementation: Use WORLD_TOP, WORLD_BOTTOM, and LEVEL_WIDTH constants
  - Sub principle: Consolidate common code for initializing and resetting objects
    - Implementation: Use a reset() method to restore objects to their initial state
    - Implementation: Constructor sets up structure, reset() method sets up initial state
  - Sub principle: Use weapon objects as separate entities
    - Implementation: Player/Enemy contains a Weapon instance rather than embedding weapon logic

- Principle: Make input handling easy to reason about
  - Sub principle: Use structured input objects instead of individual parameters
    - Implementation: Use PlayerInput interface to group all player input states together

- Principle: Make coordinate systems easy to reason about
  - Sub principle: Use relative transforms for complex object composition
    - Implementation: Use applyTransform() to combine relative and absolute transforms
    - Implementation: Use EntityTransform system for positioning weapons relative to hands
  - Sub principle: Maintain clear separation between world and local coordinates
    - Implementation: Use getAbsoluteBounds() and getAbsoluteWeaponTransform() methods
  - Sub principle: Handle rotation and facing consistently
    - Implementation: Use facing property for direction and rotation for aim angle

- Principle: Make collision detection easy to reason about
  - Sub principle: Use dedicated collision handling methods
    - Implementation: Use handleTerrainCollision() to isolate collision logic
  - Sub principle: Prevent objects from leaving valid game boundaries
    - Implementation: Clamp positions to minimum values (e.g., x >= 50)
  - Sub principle: Use dedicated collision systems
    - Implementation: Use CollisionSystem class for all collision checks
  - Sub principle: Use bounding boxes for collision detection

- Principle: Make debugging easy to reason about
  - Sub principle: Use debug flags for optional visualization
    - Implementation: Use global __DEBUG_MODE__ for debug features

- Principle: Make resource loading easy to reason about
  - Sub principle: Use async loading with promise-based state management
    - Implementation: Return promises that resolve when resources are ready
    - Implementation: Provide waitForLoaded() methods for synchronization
  - Sub principle: Handle loading failures gracefully
    - Implementation: Fall back to basic rendering when SVG loading fails

- Principle: Make game physics easy to reason about
  - Sub principle: Apply physics to game entities consistently
  - Sub principle: Don't repeat physics implementations (like gravity)

- Principle: Make level management easy to reason about
  - Sub principle: Use configuration-driven level generation
