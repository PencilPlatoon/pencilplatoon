# How to Write Design Principles

This document explains how to write effective design principles based on the process we used to create the Figure Classes Design Principles.

## What Design Principles Are

Design principles are **actionable rules** that guide how code should be written. They are not descriptions of what code does, but instructions for how to write code.

## The Writing Process

### 1. Start with Observations
Begin by analyzing existing code to understand patterns and decisions. Look for:
- Repeated patterns across multiple classes
- Architectural decisions that appear consistently
- Code that feels "right" or "wrong" when you read it

### 2. Distinguish Principles from Implementations
- **Principles**: What should be achieved (goals, outcomes)
- **Implementations**: How to achieve it (specific techniques)

Example:
```
❌ Principle: Classes use static methods
✅ Principle: Make program state easy to reason about
  - Sub principle: Make figure classes pure utilities for rendering
    - Implementation: Use static methods and properties
```

### 3. Use Command Form
Write principles as commands, not descriptions:

```
❌ "Classes serve as pure utilities"
✅ "Make classes pure utilities for rendering"
```

### 4. Group Related Concepts
Don't artificially maintain equal numbers of principles. Group related concepts under higher-level principles:

```
❌ Separate principles:
- Use static methods
- Use constants
- Isolate rendering effects

✅ Grouped under "Make program state easy to reason about":
- Make figure classes pure utilities
- Isolate rendering effects  
- Use constants for unchanging values
```

### 5. Focus on "Why" Over "What"
Principles should explain the reasoning, not just describe behavior:

```
❌ "Use bounding boxes for positioning"
✅ "Make coordinate systems easy to reason about"
  - Sub principle: Use bounding boxes for positioning
```

## Common Mistakes to Avoid

### 1. Describing What Code Does
```
❌ "Classes use static methods and properties"
✅ "Make classes pure utilities for rendering"
```

### 2. Mixing Principles and Implementations
```
❌ Principle: Use ctx.save() and ctx.restore()
✅ Principle: Isolate rendering effects
  - Implementation: Use ctx.save() and ctx.restore()
```

### 3. Creating Artificial Categories
Don't force exactly 3 principles per section. Let the natural groupings emerge.

### 4. Using Passive Voice
```
❌ "Rendering effects are isolated"
✅ "Isolate rendering effects"
```

## Structure Guidelines

### High-Level Principles
Start with broad, reasoning-focused principles:
- "Make program state easy to reason about"
- "Make code responsibility easy to reason about"
- "Make coordinate systems easy to reason about"

### Sub-Principles
Break down high-level principles into specific, actionable rules:
- "Make figure classes pure utilities for rendering"
- "Isolate rendering effects to individual figure renders"

### Implementations
Provide specific techniques for achieving the principles:
- "Use static methods and properties"
- "Use ctx.save() and ctx.restore() pattern"

## When to Write Design Principles

Write design principles when:
- You have multiple classes following similar patterns
- You want to ensure consistency across a codebase
- You're refactoring and want to establish guidelines
- You're onboarding new developers to the codebase

## How to Use Design Principles

### For Code Review
- Check if new code follows established principles
- Identify violations and suggest improvements

### For Refactoring
- Use principles to guide what should be changed
- Keep the same principle but change the implementation

### For Extension
- Apply existing principles to new classes
- Identify when new principles are needed

## Example Evolution

Here's how our principles evolved:

**Initial**: "Classes use static methods" (description)
**Better**: "Make classes pure utilities" (command)
**Best**: "Make program state easy to reason about" (reasoning)

The final version focuses on the "why" rather than the "what", making it more useful for guiding future decisions. 