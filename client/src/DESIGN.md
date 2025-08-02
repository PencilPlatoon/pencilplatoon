# Shared Design Principles

This document outlines the design principles that are shared across both the figures/ and game/ directories in the client source code.

## Core Design Principles

- Principle: Make code responsibility easy to reason about
  - Sub principle: Separate rendering logic from game logic
  - Sub principle: Use dedicated systems for specific functionality
    - Implementation: Use CollisionSystem for collision detection
    - Implementation: Use EntityTransform system for positioning and rotation
  - Sub principle: Separate animation timing from rendering logic
    - Implementation: Update animation cycles in game logic, render in figure classes
    - Implementation: Pass animation state as parameters to render methods

- Principle: Make program state easy to reason about
  - Sub principle: Use constants for values that don't change while the program is running
    - Implementation: Use static readonly constants for dimensions, speeds, ranges, and other fixed values
  - Sub principle: Consolidate common code for initializing and resetting objects
    - Implementation: Use reset() methods to restore objects to their initial state
    - Implementation: Constructor sets up structure, reset() method sets up initial state

- Principle: Make coordinate systems easy to reason about by using consistent conventions
  - Sub principle: Establish clear direction conventions and apply them consistently
  - Sub principle: Always use y = up for world coordinates
  - Sub principle: Always use y = down for canvas coordinates
  - Sub principle: Always use world coordinates up until the moment of rendering on the canvas
    - Implementation: Use `toCanvasY()` utility universally for Y-coordinate conversion
  - Sub principle: Use relative transforms for complex object composition
    - Implementation: Use applyTransform() to combine relative and absolute transforms
    - Implementation: Use EntityTransform system for positioning and rotation
  - Sub principle: Apply coordinate transformations (rotation, facing) uniformly across all components
    - Implementation: Use facing property for direction
    - Implementation: Use rotation for aim angle

- Principle: Model physical constraints realistically
  - Sub principle: Enforce ground contact rules, use consistent ground level calculations
  - Sub principle: Prevent impossible positions (e.g., body parts like feet, knees below ground)

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

## Development iteration principles

- Principle: Iterate incrementally with animation support
  - Implementation: Add detailed logging for complex calculations
  - Implementation: Test each animation component before adding complexity
