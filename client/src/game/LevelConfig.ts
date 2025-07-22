// LevelConfig.ts
// Centralized configuration for game levels

export interface TerrainConfig {
  amplitude: number;
  frequency: number;
  roughness: number;
}

export interface LevelConfig {
  enemiesPerScreen: number;
  terrain: TerrainConfig;
}

// Dictionary of all possible level definitions, keyed by readable string name
export const LEVEL_DEFINITIONS: Record<string, LevelConfig> = {
  "Grasslands": {
    enemiesPerScreen: 1,
    terrain: {
      amplitude: 40,
      frequency: 0.001,
      roughness: 1,
    },
  },
  "Desert": {
    enemiesPerScreen: 2,
    terrain: {
      amplitude: 60,
      frequency: 0.0012,
      roughness: 2,
    },
  },
  "Mountains": {
    enemiesPerScreen: 3,
    terrain: {
      amplitude: 80,
      frequency: 0.0015,
      roughness: 3,
    },
  },
};

// The order and selection of levels for the game
export const LEVEL_ORDER: string[] = [
  "Grasslands",
//   "Desert",
//   "Mountains",
]; 