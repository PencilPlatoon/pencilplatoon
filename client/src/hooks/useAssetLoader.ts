import { useState, useEffect } from 'react';
import { loadAllAssets, LoadedAsset } from '../util/SVGAssetLoader';

export function useAssetLoader() {
  const [loadedAssets, setLoadedAssets] = useState<LoadedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAssets = async () => {
      const assets = await loadAllAssets();
      setLoadedAssets(assets);
      setIsLoading(false);
    };

    loadAssets();
  }, []);

  return { loadedAssets, isLoading };
}
