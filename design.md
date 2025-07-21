# design.md - overall design

## Overview

This is a 2D stick figure battle game built with React, Express, and TypeScript. The application features a complete game engine with a 2D canvas-based rendering system, player controls, enemy AI, collision detection, and real-time gameplay mechanics. The architecture follows a full-stack approach with a React frontend and Express backend.

## User Preferences

Preferred communication style: Simple, everyday language.

### Game Mechanics
- Enemies should obey gravity like the player
- Use 'J' key for shooting instead of mouse click
- Use 'I' key for aiming up and 'K' key for aiming down (not 'Y' and 'H')
- Show dashed aiming line from weapon indicating fire direction
- Use bang sound effect when weapon fires
- Sloped terrain instead of block platforms - player should follow ground even at low levels
- Spawn character at far left of level
- Game should end when player health reaches 0

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for development and production builds
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: Zustand for game state and audio management (see `useGameStore` and `useAudio`)
- **Component Library**: Radix UI components for UI elements
- **Canvas Rendering**: HTML5 Canvas with custom 2D game engine

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Routes**: Express routing structure (currently minimal, no real API yet)
- **Development**: Hot reloading with Vite integration

### Game Engine Architecture
- **Core Engine**: Custom GameEngine class managing game loop, rendering, and updates
- **Entity System**: GameObject-based architecture for players, enemies, bullets, and particles
- **Physics**: Basic physics with gravity, collision detection, and movement
- **Audio**: HTML5 Audio API with sound management (via Zustand and SoundManager)
- **Input**: Keyboard event handling (A/D/Left/Right for movement, Space for jump, J for shoot, I/K for aim)
- **Camera**: 2D camera system with smooth following and boundaries

## Key Components

### Game Engine Components
1. **GameEngine** - Main game loop, entity management, rendering coordinator
2. **Player** - Player character with movement, shooting, and health systems
3. **Enemy** - AI-controlled enemies with pathfinding and shooting
4. **Bullet** - Projectile system with collision detection
5. **Terrain** - Multi-level terrain with collision boundaries (continuous, sloped ground)
6. **ParticleSystem** - Visual effects for explosions and impacts
7. **Camera** - 2D camera with smooth following and world boundaries
8. **CollisionSystem** - AABB collision detection for all entities

### UI Components
1. **Game** - Main game component coordinating canvas and UI
2. **GameCanvas** - Canvas wrapper with responsive sizing
3. **GameUI** - Game state management and overlay UI

### State Management
1. **useGameStore** - Game state (phase, score, enemies killed, debug mode)
2. **useAudio** - Audio management (background music, sound effects, mute state)

### Backend Components
1. **Storage Layer** - In-memory storage with database interface
2. **Routes** - Express routing structure (currently minimal, no real API yet)
3. **Vite Integration** - Development server setup with HMR

## Data Flow

### Game Loop Flow
1. GameEngine initializes canvas, entities, and systems
2. Main game loop runs at 60 FPS updating all entities
3. Input events are captured and processed each frame
4. Collision detection runs between all relevant entities
5. Game state updates trigger UI re-renders through Zustand

### Audio Flow
1. Audio files are loaded during app initialization
2. Audio store manages all sound instances and mute state
3. Game events trigger audio playback through store actions (via SoundManager)
4. Background music plays during gameplay phase

### State Management Flow
1. Game phase changes trigger UI updates and audio state changes
2. Score and enemy kill tracking updates during gameplay
3. Game restart resets all state to initial values

## External Dependencies

### Frontend Dependencies
- **React Ecosystem**: React 18, React DOM, React Query for data fetching
- **UI Libraries**: Radix UI components, Lucide React icons
- **Styling**: Tailwind CSS, class-variance-authority for component variants
- **State Management**: Zustand with middleware support
- **Build Tools**: Vite, TypeScript, PostCSS
- **Utilities**: clsx, date-fns, nanoid

### Backend Dependencies
- **Server**: Express.js, Node.js HTTP server
- **Development**: tsx for TypeScript execution, esbuild for production builds

### Development Tools
- **Build Process**: Vite for frontend, esbuild for backend bundling
- **Runtime**: ES modules with Node.js compatibility

## Deployment Strategy

### Development Setup
1. Run `npm run dev` to start development server with hot reloading
2. TypeScript checking available via `npm run check`

### Production Build
1. Frontend built with Vite to `dist/public` directory
2. Backend bundled with esbuild to `dist/index.js`
3. Static assets served from Express in production

### Asset Management
- Game assets (sounds, fonts) served from public directory
- GLTF/GLB model support configured in Vite
- Audio files (MP3, OGG, WAV) supported for game sounds

The application is designed as a complete 2D game with full-stack capabilities. The codebase is ready for future database integration and production deployment.