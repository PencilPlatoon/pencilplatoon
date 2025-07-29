# Pencil Platoon

A 2D stick figure battle game built with React, TypeScript, and Express.

## Prerequisites
- Node.js (v18 or higher recommended)
- npm (v9 or higher recommended)

## Getting Started

### 1. Install dependencies

```
npm install
```

### 2. Run the development server

This will start both the backend (Express) and the frontend (Vite) with hot reloading:

```
npm run dev
```

- The app will be available at [http://localhost:8888](http://localhost:8888)

### 3. Build for production or static serving

To build the frontend for production (static assets):

```
npm run build
```
- This will generate a `dist/` directory in the root containing all static assets.

### 4. Serve the app

You have two options:

**A. Serve as a static site (no backend required):**
- You can use any basic HTTP server to serve the contents of `dist/public`.
- Example with [serve](https://www.npmjs.com/package/serve):
  ```sh
  npx serve dist/public
  ```
- Example with Python:
  ```sh
  cd dist/public
  python3 -m http.server
  ```
- The app does not require any backend or API for gameplay. All logic and assets are included in the static build.

**B. Serve with the Node.js backend (for development or future API use):**
- Build the backend and frontend:
  ```sh
  npm run build
  ```
- Start the production server:
  ```sh
  npm start
  ```
- The app will be served at [http://localhost:8888](http://localhost:8888)

## Project Structure
- `client/` - React frontend (game engine, UI, assets)
- `server/` - Express backend (static files)
- `shared/` - Shared types and schema

## Mobile Controls

The game is fully playable on mobile devices! When playing on a mobile device, touch controls will automatically appear:

**Left Side (Movement):**
- **Left Arrow (←)**: Move left
- **Right Arrow (→)**: Move right  
- **Up Arrow (↑)**: Jump

**Right Side (Combat):**
- **Shoot Button (🔫)**: Fire weapon
- **Aim Up (↑)**: Aim upward
- **Aim Down (↓)**: Aim downward

The controls are positioned for comfortable thumb access and provide visual feedback when pressed.

## Notes
- Setup is required; all game logic runs client-side.
- Static assets (sounds, textures, models) are served from the `public` directory.
- The `server/` directory is only needed for development (`npm run dev`) or if you add backend features in the future.

## Development Scripts
- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build frontend and backend for production
- `npm start` - Start production server
- `npm run check` - TypeScript type checking

---

Enjoy the game! 