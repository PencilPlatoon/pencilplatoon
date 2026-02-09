import { toCanvasY } from "../game/world/Terrain";
import type { Grenade } from "../game/entities/Grenade";

export class GrenadeFigure {
  static render({
    ctx,
    grenade
  }: {
    ctx: CanvasRenderingContext2D;
    grenade: Grenade;
  }) {
    const transform = grenade.transform;
    const svgInfo = grenade.svgInfo;
    const boundingBox = grenade.bounds;
    const position = transform.position;
    const canvasY = toCanvasY(position.y);

    ctx.save();
    
    // Draw grenade SVG if loaded, otherwise fallback to circle
    if (svgInfo) {
      ctx.translate(position.x, canvasY);
      ctx.rotate(-transform.rotation);
      
      const svgWidth = svgInfo.boundingBox.width;
      const svgHeight = svgInfo.boundingBox.height;
      const scale = grenade.type.size / svgWidth;
      
      ctx.scale(scale, scale);
      
      // Draw centered on the grenade position
      ctx.drawImage(
        svgInfo.image,
        -svgWidth / 2,
        -svgHeight / 2,
        svgWidth,
        svgHeight
      );
    } else {
      // Fallback: Draw grenade as a small circle
      ctx.fillStyle = 'green';
      ctx.beginPath();
      ctx.arc(
        position.x,
        canvasY,
        boundingBox.width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    
    ctx.restore();

    // Debug bounding box
    if (typeof window !== 'undefined' && window.__DEBUG_MODE__) {
      ctx.save();
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      const absBounds = boundingBox.getAbsoluteBounds(position);
      const width = absBounds.lowerRight.x - absBounds.upperLeft.x;
      const height = absBounds.upperLeft.y - absBounds.lowerRight.y;
      ctx.strokeRect(absBounds.upperLeft.x, toCanvasY(absBounds.upperLeft.y), width, height);
      ctx.restore();
    }
  }
}
