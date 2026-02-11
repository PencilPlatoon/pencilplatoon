import { CasingCategory, CasingConfig } from "@/game/types/interfaces";

const PISTOL_CASING: CasingConfig = {
  width: 4,
  height: 2,
  color: '#c8a832',
  outlineColor: '#9a7e1e',
  ejectionSpeed: 120,
  spinRate: 15,
  life: 0.8,
};

const RIFLE_CASING: CasingConfig = {
  width: 6,
  height: 2.5,
  color: '#c8a832',
  outlineColor: '#9a7e1e',
  ejectionSpeed: 100,
  spinRate: 10,
  life: 0.8,
};

const SHOTGUN_CASING: CasingConfig = {
  width: 8,
  height: 4,
  color: '#8b1a1a',
  outlineColor: '#5c1010',
  ejectionSpeed: 80,
  spinRate: 6,
  life: 1.0,
};

const CASING_CONFIGS: Record<CasingCategory, CasingConfig> = {
  pistol: PISTOL_CASING,
  rifle: RIFLE_CASING,
  shotgun: SHOTGUN_CASING,
};

export const getCasingConfig = (category: CasingCategory): CasingConfig =>
  CASING_CONFIGS[category];
