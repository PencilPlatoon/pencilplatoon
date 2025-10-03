import { LoadedAsset } from '../hooks/useAssetLoader';

interface AssetGridProps {
  assets: LoadedAsset[];
  isLoading: boolean;
}

export default function AssetGrid({ assets, isLoading }: AssetGridProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="w-96 mx-auto mt-4">
      <div className="flex flex-wrap gap-2 justify-center">
        {assets.map((asset) => {
          return (
            <div
              key={asset.weapon.name}
              className="opacity-0 animate-fade-in"
              style={{
                animationDelay: `${Math.random() * 0.5}s`,
                animationFillMode: 'forwards'
              }}
            >
              <img
                src={asset.svgInfo.image.src}
                alt={asset.weapon.name}
                className="object-contain"
                style={{
                  width: `${asset.displayWidth}px`,
                  height: `${asset.displayHeight}px`,
                  maxWidth: '64px', // Cap maximum size
                  maxHeight: '48px'
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
