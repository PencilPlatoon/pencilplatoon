export type TouchGlyph =
  | "arrowLeft"
  | "arrowRight"
  | "jump"
  | "crosshair"
  | "chevronUp"
  | "chevronDown"
  | "weaponSwap"
  | "reload";

/**
 * Draws a single on-screen touch control as a hand-drawn pencil outline: a
 * lightly wobbling graphite ring (no filled disc) with a vector glyph inside, so
 * it reads like a sketch on the paper rather than a UI chip. Pressing fills the
 * ring in, as if coloured over. Glyphs are vector paths rather than text so they
 * stay correctly proportioned at any button size.
 */
export class TouchControlFigure {
  private static readonly INK = "#423d35"; // warm graphite
  private static readonly PAPER = "#f3efe4"; // paper cream, for the pressed glyph

  private static readonly RING_WIDTH_RATIO = 0.07;
  private static readonly GLYPH_WIDTH_RATIO = 0.1;
  private static readonly GLYPH_SIZE_RATIO = 0.5;

  // The outline wobbles at two levels: a low-frequency undulation and a
  // higher-frequency ripple on top of it. Amplitudes are fractions of the
  // radius.
  private static readonly LOW_FREQUENCY = 4;
  private static readonly LOW_AMPLITUDE = 1.1;
  private static readonly HIGH_FREQUENCY = 10;
  private static readonly HIGH_AMPLITUDE = 0.45;
  private static readonly WOBBLE_RATIO = 0.05;
  // How far the base shape is squashed off-round and rotated (hand-drawn circles
  // are never perfectly circular to begin with).
  private static readonly SKEW_RATIO = 0.03;
  private static readonly ROTATION = 0.2;
  // High enough to render the higher-frequency ripple smoothly.
  private static readonly RING_SEGMENTS = 80;

  static render({
    ctx,
    cx,
    cy,
    radius,
    glyph,
    isActive,
    seed,
  }: {
    ctx: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    radius: number;
    glyph: TouchGlyph;
    isActive: boolean;
    /**
     * A value in [0, 1) that fixes this button's wobble. The caller draws these
     * in order from one shared sequence, so every button gets a different shape
     * (see MobileControls).
     */
    seed: number;
  }) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const shape = this.sketchyCircle(cx, cy, radius, seed);

    // Pressed buttons are coloured in; idle ones are just the outline.
    if (isActive) {
      ctx.fillStyle = this.INK;
      ctx.fill(shape);
    }

    // A single hand-drawn graphite stroke — no filled disc, no shadow.
    ctx.strokeStyle = this.INK;
    ctx.lineWidth = radius * this.RING_WIDTH_RATIO;
    ctx.stroke(shape);

    const glyphInk = isActive ? this.PAPER : this.INK;
    ctx.strokeStyle = glyphInk;
    ctx.fillStyle = glyphInk;
    ctx.lineWidth = radius * this.GLYPH_WIDTH_RATIO;
    this.drawGlyph(ctx, cx, cy, radius * this.GLYPH_SIZE_RATIO, glyph);

    ctx.restore();
  }

  /**
   * A closed circle path whose radius wobbles at two frequencies — a low
   * undulation and a higher ripple — for a hand-drawn pencil edge. `seed` (in
   * [0, 1)) fixes the phases and off-round base, so a button looks the same on
   * every redraw and no two seeds produce the same shape.
   */
  private static sketchyCircle(cx: number, cy: number, r: number, seed: number): Path2D {
    const path = new Path2D();
    const TAU = Math.PI * 2;
    const lowPhase = seed * TAU;
    const highPhase = ((seed * 7) % 1) * TAU; // decorrelated from the low level

    const skewX = 1 + this.SKEW_RATIO * Math.sin(seed * TAU);
    const skewY = 1 + this.SKEW_RATIO * Math.sin(seed * TAU + 2.1);
    const rot = this.ROTATION * Math.sin(seed * TAU + 1);
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    for (let i = 0; i <= this.RING_SEGMENTS; i++) {
      const t = (i / this.RING_SEGMENTS) * TAU;
      const wobble =
        this.LOW_AMPLITUDE * Math.sin(this.LOW_FREQUENCY * t + lowPhase) +
        this.HIGH_AMPLITUDE * Math.sin(this.HIGH_FREQUENCY * t + highPhase);
      const rr = r * (1 + this.WOBBLE_RATIO * wobble);
      const bx = Math.cos(t) * rr * skewX;
      const by = Math.sin(t) * rr * skewY;
      const x = cx + bx * cosR - by * sinR;
      const y = cy + bx * sinR + by * cosR;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  }

  private static drawGlyph(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    glyph: TouchGlyph
  ) {
    switch (glyph) {
      case "arrowLeft":
        return this.drawArrow(ctx, cx, cy, size, Math.PI);
      case "arrowRight":
        return this.drawArrow(ctx, cx, cy, size, 0);
      case "jump":
        return this.drawJump(ctx, cx, cy, size);
      case "chevronUp":
        return this.drawChevron(ctx, cx, cy, size, true);
      case "chevronDown":
        return this.drawChevron(ctx, cx, cy, size, false);
      case "crosshair":
        return this.drawCrosshair(ctx, cx, cy, size);
      case "weaponSwap":
        return this.drawWeaponSwap(ctx, cx, cy, size);
      case "reload":
        return this.drawReload(ctx, cx, cy, size);
    }
  }

  /** Two opposing horizontal arrows — a swap/exchange glyph. */
  private static drawWeaponSwap(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number
  ) {
    const halfW = size * 0.8;
    const yOff = size * 0.4;
    const head = size * 0.32;

    // Top arrow pointing right.
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy - yOff);
    ctx.lineTo(cx + halfW, cy - yOff);
    ctx.moveTo(cx + halfW - head, cy - yOff - head);
    ctx.lineTo(cx + halfW, cy - yOff);
    ctx.lineTo(cx + halfW - head, cy - yOff + head);
    ctx.stroke();

    // Bottom arrow pointing left.
    ctx.beginPath();
    ctx.moveTo(cx + halfW, cy + yOff);
    ctx.lineTo(cx - halfW, cy + yOff);
    ctx.moveTo(cx - halfW + head, cy + yOff - head);
    ctx.lineTo(cx - halfW, cy + yOff);
    ctx.lineTo(cx - halfW + head, cy + yOff + head);
    ctx.stroke();
  }

  /** Circular arrow — a reload/refresh glyph. */
  private static drawReload(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number
  ) {
    const radius = size * 0.62;
    const openGap = 1.0; // radians left open for the arrowhead
    const start = -Math.PI / 2 + openGap / 2;
    const end = start + (Math.PI * 2 - openGap);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.stroke();

    // Arrowhead at the arc's end, barbs trailing back along the tangent.
    const tipX = cx + radius * Math.cos(end);
    const tipY = cy + radius * Math.sin(end);
    const tangent = Math.atan2(Math.cos(end), -Math.sin(end));
    const head = size * 0.42;
    const spread = 0.6;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + head * Math.cos(tangent + Math.PI - spread), tipY + head * Math.sin(tangent + Math.PI - spread));
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + head * Math.cos(tangent + Math.PI + spread), tipY + head * Math.sin(tangent + Math.PI + spread));
    ctx.stroke();
  }

  /** Arrow pointing along +x, rotated into place. */
  private static drawArrow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    angle: number
  ) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-size * 0.85, 0);
    ctx.lineTo(size * 0.6, 0);
    ctx.moveTo(size * 0.05, -size * 0.6);
    ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(size * 0.05, size * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  /** Up arrow lifting off a baseline — distinct from the aim chevrons. */
  private static drawJump(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number
  ) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(-size * 0.75, size * 0.85);
    ctx.lineTo(size * 0.75, size * 0.85);
    ctx.moveTo(0, size * 0.45);
    ctx.lineTo(0, -size * 0.8);
    ctx.moveTo(-size * 0.55, -size * 0.25);
    ctx.lineTo(0, -size * 0.85);
    ctx.lineTo(size * 0.55, -size * 0.25);
    ctx.stroke();
    ctx.restore();
  }

  private static drawChevron(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    pointingUp: boolean
  ) {
    const tipY = pointingUp ? -size * 0.45 : size * 0.45;
    const baseY = pointingUp ? size * 0.35 : -size * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.7, cy + baseY);
    ctx.lineTo(cx, cy + tipY);
    ctx.lineTo(cx + size * 0.7, cy + baseY);
    ctx.stroke();
  }

  private static drawCrosshair(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number
  ) {
    const ring = size * 0.55;
    const tickOuter = size;
    const tickInner = ring * 0.75;

    ctx.beginPath();
    ctx.arc(cx, cy, ring, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - tickOuter, cy);
    ctx.lineTo(cx - tickInner, cy);
    ctx.moveTo(cx + tickInner, cy);
    ctx.lineTo(cx + tickOuter, cy);
    ctx.moveTo(cx, cy - tickOuter);
    ctx.lineTo(cx, cy - tickInner);
    ctx.moveTo(cx, cy + tickInner);
    ctx.lineTo(cx, cy + tickOuter);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}
