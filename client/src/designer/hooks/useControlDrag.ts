import { useEffect, useRef, useState } from 'react';
import { Vector2, Vector2Utils } from '@/game/types/Vector2';
import { Player } from '@/game/entities/Player';
import { MoveableControl, ControlId } from '../MoveableControl';
import { DesignerModePositions } from '../DesignerModePositions';

export function useControlDrag(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  playerRef: React.RefObject<Player | null>,
  controlsRef: React.RefObject<MoveableControl[]>,
  onControlMoved: () => void
) {
  const [draggedControl, setDraggedControl] = useState<ControlId | null>(null);
  const [hoveredControl, setHoveredControl] = useState<ControlId | null>(null);
  const draggedControlRef = useRef<ControlId | null>(null);
  const hoveredControlRef = useRef<ControlId | null>(null);
  const dragOffsetRef = useRef<Vector2 | null>(null);

  useEffect(() => { draggedControlRef.current = draggedControl; }, [draggedControl]);
  useEffect(() => { hoveredControlRef.current = hoveredControl; }, [hoveredControl]);

  const getGameMousePos = (e: React.MouseEvent<HTMLCanvasElement>): Vector2 | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return DesignerModePositions.screenToGame({ x: e.clientX, y: e.clientY }, rect);
  };

  const detectControlUnderMouse = (mousePos: Vector2): MoveableControl | null => {
    if (!playerRef.current) return null;
    const controls = controlsRef.current ?? [];
    for (const control of controls) {
      if (control.isMouseWithin(mousePos)) return control;
    }
    return null;
  };

  const updateControlPosition = (mousePos: Vector2) => {
    if (!playerRef.current || !draggedControl || !dragOffsetRef.current) return;
    const controls = controlsRef.current ?? [];
    const control = controls.find(c => c.id === draggedControl);
    if (control) {
      const controlPos = Vector2Utils.subtract(mousePos, dragOffsetRef.current);
      control.updateAbsPosition(controlPos);
      onControlMoved();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!playerRef.current) return;
    const mousePos = getGameMousePos(e);
    if (!mousePos) return;

    if (!draggedControl) {
      const controlUnderMouse = detectControlUnderMouse(mousePos);
      setHoveredControl(controlUnderMouse?.id || null);
    }

    if (draggedControl) {
      updateControlPosition(mousePos);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!playerRef.current) return;
    const mousePos = getGameMousePos(e);
    if (!mousePos) return;

    const controlUnderMouse = detectControlUnderMouse(mousePos);
    if (controlUnderMouse) {
      const controlPos = controlUnderMouse.getAbsPosition();
      if (controlPos) {
        dragOffsetRef.current = Vector2Utils.subtract(mousePos, controlPos);
        setDraggedControl(controlUnderMouse.id);
      }
    }
  };

  const handleMouseUp = () => {
    setDraggedControl(null);
    dragOffsetRef.current = null;
  };

  return {
    hoveredControlRef,
    handleMouseMove,
    handleMouseDown,
    handleMouseUp,
  };
}
