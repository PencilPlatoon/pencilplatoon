# Stick Fight Saga

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

### 3. Build for production

To build the frontend and backend for production:

```
npm run build
```

- Frontend assets will be output to `dist/public`
- Backend bundle will be output to `dist/index.js`

### 4. Start the production server

```
npm start
```

- The app will be served at [http://localhost:8888](http://localhost:8888)

## Project Structure
- `client/` - React frontend (game engine, UI, assets)
- `server/` - Express backend (serves API and static files)
- `shared/` - Shared types and schema

## Notes
- No database setup is required; all game logic runs client-side.
- Static assets (sounds, textures, models) are served from the `client/public` directory.

## Development Scripts
- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build frontend and backend for production
- `npm start` - Start production server
- `npm run check` - TypeScript type checking

---

Enjoy the game! 