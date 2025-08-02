# Figure Classes Design Principles

This document outlines the design principles specific to the figure classes for the game's rendering system.

See generally-applicable principles in client/src/DESIGN_PRINCIPLES.md.

## Design Principles for client/src/figures

- Principle: Make figure classes pure utilities for rendering
  - Sub principle: Use static methods and properties for all figure classes
  - Sub principle: Isolate rendering effects to individual figure renders
    - Implementation: Use `ctx.save()` and `ctx.restore()` pattern consistently

- Principle: Make complex figure composition easy to reason about
  - Sub principle: Define body parts as relative offsets from central coordinate system
    - Implementation: Build up figure from legs → body → neck → head
    - Implementation: Position arms relative to body bottom
