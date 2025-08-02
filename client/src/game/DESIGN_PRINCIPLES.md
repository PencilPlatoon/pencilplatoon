# Game Classes Design Principles

This document outlines the design principles specific to the game classes for the game's logic and state management.

See generally-applicable principles in client/src/DESIGN_PRINCIPLES.md.

## Design Principles for client/src/game

- Principle: Make game state easy to reason about
  - Sub principle: Use weapon objects as separate entities
    - Implementation: Player/Enemy contains a Weapon instance rather than embedding weapon logic

- Principle: Make input handling easy to reason about
  - Sub principle: Use structured input objects instead of individual parameters
    - Implementation: Use PlayerInput interface to group all player input states together

- Principle: Make collision detection easy to reason about
  - Sub principle: Use dedicated collision handling methods
    - Implementation: Use handleTerrainCollision() to isolate collision logic
  - Sub principle: Prevent objects from leaving valid game boundaries
    - Implementation: Clamp positions to minimum values (e.g., x >= 50)
  - Sub principle: Use dedicated collision systems
    - Implementation: Use CollisionSystem class for all collision checks
  - Sub principle: Use bounding boxes for collision detection

- Principle: Make game physics easy to reason about
  - Sub principle: Apply physics to game entities consistently
  - Sub principle: Don't repeat physics implementations (like gravity)

- Principle: Make level management easy to reason about
  - Sub principle: Use configuration-driven level generation
