# Shared Design Principles

This document outlines the design principles that are shared across both the figures/ and game/ directories in the client source code.

## Core Design Principles

- Principle: Make code responsibility easy to reason about
  - Sub principle: Separate rendering logic from game logic
  - Sub principle: Use dedicated systems for specific functionality
    - Implementation: Use CollisionSystem for collision detection
    - Implementation: Use EntityTransform system for positioning and rotation

- Principle: Make program state easy to reason about
  - Sub principle: Use constants for values that don't change while the program is running
    - Implementation: Use static readonly constants for dimensions, speeds, ranges, and other fixed values
  - Sub principle: Consolidate common code for initializing and resetting objects
    - Implementation: Use reset() methods to restore objects to their initial state
    - Implementation: Constructor sets up structure, reset() method sets up initial state

- Principle: Make coordinate systems easy to reason about
  - Sub principle: Maintain separation between logical world coordinates and canvas coordinates
    - Implementation: Use `toCanvasY()` utility universally for Y-coordinate conversion
  - Sub principle: Use relative transforms for complex object composition
    - Implementation: Use applyTransform() to combine relative and absolute transforms
    - Implementation: Use EntityTransform system for positioning and rotation
  - Sub principle: Handle rotation and facing consistently
    - Implementation: Use facing property for direction and rotation for aim angle

- Principle: Make resource loading easy to reason about
  - Sub principle: Use async loading with promise-based state management
    - Implementation: Return promises that resolve when resources are ready
    - Implementation: Provide waitForLoaded() methods for synchronization
  - Sub principle: Handle loading failures gracefully
    - Implementation: Fall back to basic rendering when resource loading fails

- Principle: Make complex object composition easy to reason about
  - Sub principle: Define components as relative offsets from central coordinate system
    - Implementation: Build up complex objects from simpler components
    - Implementation: Position sub-components relative to parent components

- Principle: Make debugging easy to reason about
  - Sub principle: Use debug flags for optional visualization
    - Implementation: Use global __DEBUG_MODE__ for debug features
