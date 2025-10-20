import { toCanvasY } from "../game/Terrain";
import type { Rocket } from "../game/Rocket";
import type { EntityTransform } from "../game/EntityTransform";

export class RocketFigure {
  private static readonly STABILIZER_LENGTH_RATIO = 0.3;

  static render({
    ctx,
    rocket,
    transform
  }: {
    ctx: CanvasRenderingContext2D;
    rocket: Rocket;
    transform: EntityTransform;
  }) {
    const svgInfo = rocket.svgInfo;
    const boundingBox = rocket.bounds;
    const position = transform.position;
    const canvasY = toCanvasY(position.y);

    ctx.save();
    ctx.translate(position.x, canvasY);
    
    // Draw rocket SVG if loaded, otherwise fallback to shape
    if (svgInfo) {
      ctx.save();
      ctx.rotate(-transform.rotation);
      
      const svgWidth = svgInfo.boundingBox.width;
      const svgHeight = svgInfo.boundingBox.height;
      const scale = rocket.type.size / svgWidth;
      
      ctx.scale(scale, scale);
      
      // Draw centered on the rocket position
      ctx.drawImage(
        svgInfo.image,
        -svgWidth / 2,
        -svgHeight / 2,
        svgWidth,
        svgHeight
      );
      ctx.restore();
    } else {
      // Fallback: Draw rocket as a rectangle
      ctx.save();
      ctx.rotate(-transform.rotation);
      ctx.fillStyle = 'red';
      const rocketWidth = boundingBox.width;
      const rocketHeight = boundingBox.width * 0.4; // Make it elongated
      ctx.fillRect(-rocketWidth / 2, -rocketHeight / 2, rocketWidth, rocketHeight);
      ctx.restore();
    }
    
    // Draw spinning stabilizers on the rocket tail (only if launched)
    if (rocket.isLaunched) {
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      const stabilizerLength = boundingBox.width * RocketFigure.STABILIZER_LENGTH_RATIO;
      
      // Position stabilizers at the tail (opposite direction of motion)
      const tailAngle = transform.rotation + Math.PI;
      const tailOffset = boundingBox.width / 2;
      const tailX = Math.cos(tailAngle) * tailOffset;
      const tailY = Math.sin(tailAngle) * tailOffset;
      
      // All stabilizer lines start from the central tail point
      for (let i = 0; i < 3; i++) {
        const angle = rocket.stabilizerRotation + (i * Math.PI * 2 / 3);
        const x2 = tailX + Math.cos(angle) * stabilizerLength;
        const y2 = tailY + Math.sin(angle) * stabilizerLength;
        
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
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

