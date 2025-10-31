import { useEffect, useRef } from 'react';
import { SVGLoader } from '../util/SVGLoader';

interface WeaponIconProps {
  weaponType: any;
  isSelected: boolean;
  onClick: () => void;
}

export function WeaponIcon({ weaponType, isSelected, onClick }: WeaponIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!weaponType.svgPath || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    SVGLoader.get(weaponType.svgPath).then(svgInfo => {
      if (!svgInfo || !canvasRef.current) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const svgWidth = svgInfo.boundingBox.width;
      const svgHeight = svgInfo.boundingBox.height;
      const scale = Math.min(
        (canvas.width - 10) / svgWidth,
        (canvas.height - 30) / svgHeight
      );
      
      ctx.save();
      ctx.translate(canvas.width / 2, (canvas.height - 20) / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(
        svgInfo.image,
        -svgWidth / 2,
        -svgHeight / 2,
        svgWidth,
        svgHeight
      );
      ctx.restore();
    });
  }, [weaponType.svgPath]);

  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-28 h-32 border-2 rounded flex flex-col items-center justify-between p-2 ${
        isSelected
          ? 'bg-blue-500 border-blue-600 text-white'
          : 'bg-white border-gray-300 hover:bg-gray-50'
      }`}
    >
      <canvas ref={canvasRef} width={80} height={80} className="w-20 h-20" />
      <span className="text-xs text-center leading-tight">{weaponType.name.substring(0, 12)}</span>
    </button>
  );
}

