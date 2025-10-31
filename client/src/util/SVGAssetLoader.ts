import { SVGInfo, SVGLoader } from './SVGLoader';
import { SVGObjectType } from '../game/types';
import { Vector2 } from '../game/Vector2';
import { BoundingBox } from '../game/BoundingBox';
import { ShootingWeapon } from '../game/ShootingWeapon';
import { LaunchingWeapon } from '../game/LaunchingWeapon';
import { Grenade } from '../game/Grenade';
import { Rocket } from '../game/Rocket';

export interface DisplaySize {
  displayWidth: number;
  displayHeight: number;
}

export interface LoadedAsset {
  svgInfo: SVGInfo;
  weapon: SVGObjectType;
  displayWidth: number;
  displayHeight: number;
}

export interface LoadedSVGBounds {
  bounds: BoundingBox;
  svgInfo: SVGInfo | undefined;
}

export const calculateDisplaySize = (
  obj: SVGObjectType,
  svgInfo: SVGInfo
): DisplaySize => {
  const { boundingBox } = svgInfo;
  const scale = obj.size / boundingBox.width;
  
  return {
    displayWidth: boundingBox.width * scale,
    displayHeight: boundingBox.height * scale
  };
};

export const loadSVGAndCreateBounds = async (
  obj: SVGObjectType,
  defaultHeight: number,
  refRatioPosition: Vector2
): Promise<LoadedSVGBounds> => {
  if (!obj.svgPath) {
    return {
      bounds: new BoundingBox(
        obj.size,
        defaultHeight,
        refRatioPosition
      ),
      svgInfo: undefined
    };
  }

  try {
    const svgInfo = await SVGLoader.get(obj.svgPath);
    if (svgInfo) {
      const { displayWidth, displayHeight } = calculateDisplaySize(obj, svgInfo);
      return {
        bounds: new BoundingBox(
          displayWidth,
          displayHeight,
          refRatioPosition
        ),
        svgInfo
      };
    }
  } catch (error) {
    console.warn(`Failed to load SVG for ${obj.name}:`, error);
  }

  // Fallback on error
  return {
    bounds: new BoundingBox(
      obj.size,
      defaultHeight,
      refRatioPosition
    ),
    svgInfo: undefined
  };
};

export const loadAsset = async (weaponType: SVGObjectType): Promise<LoadedAsset | null> => {
  try {
    const svgInfo = await SVGLoader.get(weaponType.svgPath);
    if (svgInfo) {
      const { displayWidth, displayHeight } = calculateDisplaySize(weaponType, svgInfo);
      return {
        svgInfo,
        weapon: weaponType,
        displayWidth,
        displayHeight
      };
    }
    return null;
  } catch (error) {
    console.warn(`Failed to load asset: ${weaponType.name}`, error);
    return null;
  }
};

export const loadAllAssets = async (): Promise<LoadedAsset[]> => {
  const allWeaponTypes: SVGObjectType[] = [
    ...ShootingWeapon.ALL_WEAPONS,
    ...LaunchingWeapon.ALL_LAUNCHERS,
    ...Grenade.ALL_GRENADES,
    ...Rocket.ALL_ROCKETS,
  ];

  const results = await Promise.all(
    allWeaponTypes
      .filter(weapon => weapon.svgPath)
      .map(loadAsset)
  );
  
  return results.filter(asset => asset !== null) as LoadedAsset[];
};

