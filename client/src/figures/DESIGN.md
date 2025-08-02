# Figure Classes Design Principles

This document outlines the design principles used in the figure classes for the game's rendering system.

See generally-applicable principles in client/src/DESIGN.md.

## Shared Design Principles

- Principle: Make program state easy to reason about
  - Sub principle: Make figure classes pure utilities for rendering
    - Implementation: Use static methods and properties for all figure classes
  - Sub principle: Isolate rendering effects to individual figure renders
    - Implementation: Use `ctx.save()` and `ctx.restore()` pattern consistently
  - Sub principle: Use constants for things that won't change while the program is running
    - Implementation: Use static readonly constants for figure dimensions

- Principle: Make code responsibility easy to reason about
  - Sub principle: Separate rendering logic from game logic

- Principle: Make coordinate systems easy to reason about
  - Sub principle: Maintain separation between logical world coordinates and canvas coordinates
    - Implementation: Use `toCanvasY()` utility universally for Y-coordinate conversion
  - Sub principle: perform position and rotation logic in one place
    - Implementation: Integrate with EntityTransform system for positioning and rotation

- Principle: Make complex figure composition easy to reason about
  - Sub principle: Define body parts as relative offsets from central coordinate system
    - Implementation: Build up figure from legs → body → neck → head
    - Implementation: Position arms relative to body bottom

- Principle: Make figure animation easy to reason about
  - Sub principle: Model joint constraints realistically
    - Implementation: Prevent joints from moving to impossible positions (e.g., knee bending angles)
  - Sub principle: Use phase-based animation for coordinated movement
    - Implementation: Use sine/cosine functions for smooth cyclic motion
    - Implementation: Coordinate opposite phases for natural movement (e.g., left/right legs)
