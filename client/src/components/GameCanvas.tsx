import { forwardRef, useEffect } from "react";

interface GameCanvasProps {
  className?: string;
}

const GameCanvas = forwardRef<HTMLCanvasElement, GameCanvasProps>(
  ({ className = "" }, ref) => {
    useEffect(() => {
      const canvas = ref as React.RefObject<HTMLCanvasElement>;
      if (canvas.current) {
        const ctx = canvas.current.getContext("2d");
        if (ctx) {
          // Set canvas size to match viewport
          const resizeCanvas = () => {
            canvas.current!.width = window.innerWidth;
            canvas.current!.height = window.innerHeight;
          };
          
          resizeCanvas();
          window.addEventListener("resize", resizeCanvas);
          
          return () => window.removeEventListener("resize", resizeCanvas);
        }
      }
    }, [ref]);

    return (
      <canvas
        ref={ref}
        className={`block w-full h-full ${className}`}
        style={{ imageRendering: "pixelated" }}
      />
    );
  }
);

GameCanvas.displayName = "GameCanvas";

export default GameCanvas;
