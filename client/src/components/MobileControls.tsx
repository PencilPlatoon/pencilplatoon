import React, { useRef, useEffect, useState } from 'react';

export const ACTION_TO_INPUT_KEY: Record<string, keyof MobileInput> = {
  left: 'left',
  right: 'right',
  jump: 'jump',
  shoot: 'triggerPressed',
  aimUp: 'aimUp',
  aimDown: 'aimDown',
};

interface TouchArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  action: string;
}

export interface MobileInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  triggerPressed: boolean;
  aimUp: boolean;
  aimDown: boolean;
}

interface MobileControlsProps {
  onInput: (input: MobileInput) => void;
}

export default function MobileControls({ onInput }: MobileControlsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTouches, setActiveTouches] = useState<Set<string>>(new Set());
  const [input, setInput] = useState({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    triggerPressed: false,
    aimUp: false,
    aimDown: false
  });

  // Define touch areas - positioned for better mobile ergonomics
  const touchAreas: TouchArea[] = [
    // Left side - Movement controls (bottom left)
    { id: 'left', x: 30, y: 450, width: 70, height: 70, action: 'left' },
    { id: 'right', x: 120, y: 450, width: 70, height: 70, action: 'right' },
    { id: 'jump', x: 75, y: 360, width: 70, height: 70, action: 'jump' },
    
    // Right side - Aiming and shooting (bottom right)
    { id: 'shoot', x: 700, y: 450, width: 80, height: 80, action: 'shoot' },
    { id: 'aimUp', x: 700, y: 350, width: 60, height: 60, action: 'aimUp' },
    { id: 'aimDown', x: 700, y: 520, width: 60, height: 60, action: 'aimDown' },
  ];

  const getTouchArea = (clientX: number, clientY: number): TouchArea | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    // Calculate scale factors
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    return touchAreas.find(area => 
      x >= area.x && x <= area.x + area.width &&
      y >= area.y && y <= area.y + area.height
    ) || null;
  };

  const handleTouch = (e: TouchEvent, isStart: boolean) => {
    const newActiveTouches = new Set(activeTouches);
    const newInput = { ...input };
    let handledTouch = false;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const area = getTouchArea(touch.clientX, touch.clientY);

      if (area) {
        const inputKey = ACTION_TO_INPUT_KEY[area.action];
        if (inputKey) {
          handledTouch = true;
          if (isStart) {
            newActiveTouches.add(area.id);
          } else {
            newActiveTouches.delete(area.id);
          }
          newInput[inputKey] = isStart;
        }
      }
    }

    if (handledTouch) {
      e.preventDefault();
    }

    setActiveTouches(newActiveTouches);
    setInput(newInput);
    onInput(newInput);
  };

  const handleTouchMove = (e: TouchEvent) => {
    // Handle continuous touch movement for aiming
    const newInput = { ...input };
    let handledTouch = false;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const area = getTouchArea(touch.clientX, touch.clientY);
      
      if (area && area.action === 'shoot') {
        handledTouch = true;
        newInput.triggerPressed = true;
      }
    }

    // Only prevent default if we handled the touch
    if (handledTouch) {
      e.preventDefault();
    }

    setInput(newInput);
    onInput(newInput);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => handleTouch(e, true);
    const onTouchEnd = (e: TouchEvent) => handleTouch(e, false);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [activeTouches, input]);

  const renderTouchAreas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);



    touchAreas.forEach(area => {
      const isActive = activeTouches.has(area.id);
      
      // Draw touch area with rounded corners effect
      ctx.fillStyle = isActive ? 'rgba(0, 255, 0, 0.4)' : 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(area.x, area.y, area.width, area.height);
      
      // Draw border with different colors for different action types
      let borderColor = '#ffffff';
      if (isActive) {
        borderColor = '#00ff00';
      } else if (area.action === 'shoot') {
        borderColor = '#ff4444';
      } else if (area.action === 'jump') {
        borderColor = '#4444ff';
      } else if (area.action === 'aimUp' || area.action === 'aimDown') {
        borderColor = '#ffaa00';
      }
      
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(area.x, area.y, area.width, area.height);
      
      // Draw label with better styling
      ctx.fillStyle = isActive ? '#ffffff' : '#000000';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      
      // Draw action-specific icons
      let icon = '';
      switch (area.action) {
        case 'left':
          icon = '←';
          break;
        case 'right':
          icon = '→';
          break;
        case 'jump':
          icon = '↑';
          break;
        case 'shoot':
          icon = '🔫';
          break;
        case 'aimUp':
          icon = '↑';
          break;
        case 'aimDown':
          icon = '↓';
          break;
        default:
          icon = area.action.toUpperCase();
      }
      
      ctx.font = 'bold 16px Arial';
      ctx.fillText(
        icon,
        area.x + area.width / 2,
        area.y + area.height / 2 + 6
      );
      

    });
  };

  useEffect(() => {
    renderTouchAreas();
  }, [activeTouches]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      className="absolute inset-0 pointer-events-auto z-10 w-full h-full"
      style={{ 
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
    />
  );
} 