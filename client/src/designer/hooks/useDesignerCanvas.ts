import { useEffect } from 'react';
import { Player } from '@/game/entities/Player';
import { MoveableControl, ControlId } from '../MoveableControl';
import { DesignerModePositions } from '../DesignerModePositions';

const { CANVAS_WIDTH, CANVAS_HEIGHT } = DesignerModePositions;

export function useDesignerCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  playerRef: React.RefObject<Player | null>,
  controlsRef: React.RefObject<MoveableControl[]>,
  hoveredControlRef: React.RefObject<ControlId | null>,
  deps: unknown[]
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playerRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      const currentHoveredControl = hoveredControlRef.current;

      ctx.save();
      DesignerModePositions.applyGameTransform(ctx);

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (playerRef.current) {
        playerRef.current.render(ctx, { skipHealthBar: true });

        for (const control of controlsRef.current ?? []) {
          const pos = control.getAbsPosition();
          if (pos) {
            const position = DesignerModePositions.gameToTransformedCanvas(pos);
            const isHovered = currentHoveredControl === control.id;
            control.render({ ctx, position, isHovered });
          }
        }
      }

      ctx.restore();
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, deps);
}
