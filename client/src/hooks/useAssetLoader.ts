import { useState, useEffect } from 'react';
import { SVGLoader, SVGInfo } from '../util/SVGLoader';
import { Weapon } from '../game/Weapon';
import { WeaponType } from '../game/types';

export interface LoadedAsset {
  svgInfo: SVGInfo;
  weapon: WeaponType;
  displayWidth: number;
  displayHeight: number;
}


export function useAssetLoader() {
  const [loadedAssets, setLoadedAssets] = useState<LoadedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAssets = async () => {
      const loadPromises = Weapon.ALL_WEAPONS
        .filter(weapon => weapon.svgPath)
        .map(async (weapon) => {
          try {
            const svgInfo = await SVGLoader.get(weapon.svgPath!);
            if (svgInfo) {
              const { displayWidth, displayHeight } = Weapon.calculateDisplaySize(weapon, svgInfo);
              return {
                svgInfo,
                weapon,
                displayWidth,
                displayHeight
              };
            }
            return null;
          } catch (error) {
            console.warn(`Failed to load asset: ${weapon.name}`, error);
            return null;
          }
        });

      const results = await Promise.all(loadPromises);
      const successfulAssets = results.filter((asset): asset is LoadedAsset => asset !== null);
      
      setLoadedAssets(successfulAssets);
      setIsLoading(false);
    };

    loadAssets();
  }, []);

  return { loadedAssets, isLoading };
}
