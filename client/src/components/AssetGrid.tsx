import { LoadedAsset, scaleToFit } from '@/util/SVGAssetLoader';

const MAX_THUMBNAIL_WIDTH = 64;
const MAX_THUMBNAIL_HEIGHT = 48;
const FADE_IN_STAGGER_SECONDS = 0.03;

interface AssetGridProps {
  assets: LoadedAsset[];
  isLoading: boolean;
}

export default function AssetGrid({ assets, isLoading }: AssetGridProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="w-full max-w-sm flex flex-wrap gap-2 justify-center">
      {assets.map((asset, index) => {
        const { displayWidth, displayHeight } = scaleToFit(
          asset,
          MAX_THUMBNAIL_WIDTH,
          MAX_THUMBNAIL_HEIGHT
        );
        return (
          <img
            key={asset.weapon.name}
            src={asset.svgInfo.image.src}
            alt={asset.weapon.name}
            className="object-contain opacity-0 animate-fade-in"
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              animationDelay: `${index * FADE_IN_STAGGER_SECONDS}s`,
              animationFillMode: 'forwards'
            }}
          />
        );
      })}
    </div>
  );
}
