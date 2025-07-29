import React, { useRef, useEffect, useState } from 'react';

interface TouchArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  action: string;
}

interface MobileControlsProps {
  onInput: (input: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    jump: boolean;
    shoot: boolean;
    aimUp: boolean;
    aimDown: boolean;
  }) => void;
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
    shoot: false,
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

  const handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const newActiveTouches = new Set(activeTouches);
    const newInput = { ...input };

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const area = getTouchArea(touch.clientX, touch.clientY);
      
      if (area) {
        newActiveTouches.add(area.id);
        switch (area.action) {
          case 'left':
            newInput.left = true;
            break;
          case 'right':
            newInput.right = true;
            break;
          case 'jump':
            newInput.jump = true;
            break;
          case 'shoot':
            newInput.shoot = true;
            break;
          case 'aimUp':
            newInput.aimUp = true;
            break;
          case 'aimDown':
            newInput.aimDown = true;
            break;
        }
      }
    }

    setActiveTouches(newActiveTouches);
    setInput(newInput);
    onInput(newInput);
  };

  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    const newActiveTouches = new Set(activeTouches);
    const newInput = { ...input };

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const area = getTouchArea(touch.clientX, touch.clientY);
      
      if (area) {
        newActiveTouches.delete(area.id);
        switch (area.action) {
          case 'left':
            newInput.left = false;
            break;
          case 'right':
            newInput.right = false;
            break;
          case 'jump':
            newInput.jump = false;
            break;
          case 'shoot':
            newInput.shoot = false;
            break;
          case 'aimUp':
            newInput.aimUp = false;
            break;
          case 'aimDown':
            newInput.aimDown = false;
            break;
        }
      }
    }

    setActiveTouches(newActiveTouches);
    setInput(newInput);
    onInput(newInput);
  };

  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    // Handle continuous touch movement for aiming
    const newInput = { ...input };

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const area = getTouchArea(touch.clientX, touch.clientY);
      
      if (area && area.action === 'shoot') {
        newInput.shoot = true;
      }
    }

    setInput(newInput);
    onInput(newInput);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
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