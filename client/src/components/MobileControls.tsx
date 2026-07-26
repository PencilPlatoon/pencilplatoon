import { useRef, useEffect, useState, useMemo } from 'react';
import { TouchControlFigure } from '@/rendering/TouchControlFigure';
import {
  createTouchButtons,
  findButtonAt,
  inputFromHeldActions,
  MobileInput,
  TouchButton,
} from './MobileControlsLayout';

export type { MobileInput } from './MobileControlsLayout';
export { ACTION_TO_INPUT_KEY } from './MobileControlsLayout';

// A golden-ratio (low-discrepancy) step gives each successive button a wobble
// seed far from its neighbours', so adjacent buttons never look alike — unlike a
// plain PRNG, whose consecutive draws can happen to land close together.
const WOBBLE_SEQUENCE_STEP = 0.618033988749895;

interface MobileControlsProps {
  onInput: (input: MobileInput) => void;
  onSwitchWeapon?: () => void;
  onReload?: () => void;
}

interface ViewportSize {
  width: number;
  height: number;
}

export default function MobileControls({ onInput, onSwitchWeapon, onReload }: MobileControlsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [heldActions, setHeldActions] = useState<ReadonlySet<string>>(new Set());

  const buttons = useMemo(
    () => createTouchButtons(size.width, size.height),
    [size.width, size.height]
  );

  // Refs keep the touch listeners stable while still seeing current values.
  const buttonsRef = useRef<TouchButton[]>(buttons);
  const onInputRef = useRef(onInput);
  const onSwitchWeaponRef = useRef(onSwitchWeapon);
  const onReloadRef = useRef(onReload);
  buttonsRef.current = buttons;
  onInputRef.current = onInput;
  onSwitchWeaponRef.current = onSwitchWeapon;
  onReloadRef.current = onReload;

  // Match the canvas bitmap to its on-screen size so nothing is stretched.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applySize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      setSize({ width, height });
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const touchedActions = new Map<number, string>();

    const syncHeld = () => {
      const held = new Set(touchedActions.values());
      setHeldActions(held);
      onInputRef.current(inputFromHeldActions(held));
    };

    const buttonUnder = (touch: Touch): TouchButton | null => {
      const rect = canvas.getBoundingClientRect();
      return findButtonAt(
        buttonsRef.current,
        touch.clientX - rect.left,
        touch.clientY - rect.top
      );
    };

    const fireMomentary = (action: string) => {
      if (action === 'weapon') onSwitchWeaponRef.current?.();
      else if (action === 'reload') onReloadRef.current?.();
    };

    const press = (e: TouchEvent) => {
      let handled = false;
      for (const touch of Array.from(e.changedTouches)) {
        const button = buttonUnder(touch);
        if (button) {
          touchedActions.set(touch.identifier, button.action);
          // Weapon-swap and reload act on the press itself, not while held,
          // so a resting finger triggers them exactly once.
          if (button.momentary) fireMomentary(button.action);
          handled = true;
        }
      }
      if (handled) e.preventDefault();
      syncHeld();
    };

    // A finger sliding between buttons re-targets; sliding off releases.
    const drag = (e: TouchEvent) => {
      let handled = false;
      for (const touch of Array.from(e.changedTouches)) {
        if (!touchedActions.has(touch.identifier)) continue;
        const button = buttonUnder(touch);
        if (button) {
          touchedActions.set(touch.identifier, button.action);
        } else {
          touchedActions.delete(touch.identifier);
        }
        handled = true;
      }
      if (handled) e.preventDefault();
      syncHeld();
    };

    const release = (e: TouchEvent) => {
      let handled = false;
      for (const touch of Array.from(e.changedTouches)) {
        if (touchedActions.delete(touch.identifier)) {
          handled = true;
        }
      }
      if (handled) e.preventDefault();
      syncHeld();
    };

    canvas.addEventListener('touchstart', press, { passive: false });
    canvas.addEventListener('touchmove', drag, { passive: false });
    canvas.addEventListener('touchend', release, { passive: false });
    canvas.addEventListener('touchcancel', release, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', press);
      canvas.removeEventListener('touchmove', drag);
      canvas.removeEventListener('touchend', release);
      canvas.removeEventListener('touchcancel', release);
    };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || size.width === 0 || size.height === 0) return;

    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    // One deterministic sequence, walked in button order, gives every button a
    // different-but-stable wobble (rather than each reseeding from itself).
    buttons.forEach((button, index) =>
      TouchControlFigure.render({
        ctx,
        cx: button.cx,
        cy: button.cy,
        radius: button.radius,
        glyph: button.glyph,
        isActive: heldActions.has(button.action),
        seed: ((index + 1) * WOBBLE_SEQUENCE_STEP) % 1,
      })
    );
  }, [buttons, heldActions, size]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-auto z-10 w-full h-full"
      style={{
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    />
  );
}
