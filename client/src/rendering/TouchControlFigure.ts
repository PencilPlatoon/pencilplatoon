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
 * Draws a single on-screen touch control as a pencil-style disc: a translucent
 * white fill so the dark outline reads over terrain, and a dark outline so the
 * button reads over blank paper. Glyphs are vector paths rather than text so
 * they stay correctly proportioned at any button size.
 */
export class TouchControlFigure {
  private static readonly INK = "#1a1a1a";
  private static readonly PAPER = "#ffffff";
  private static readonly IDLE_FILL = "rgba(255, 255, 255, 0.65)";
  private static readonly ACTIVE_FILL = "rgba(26, 26, 26, 0.85)";
  private static readonly SHADOW = "rgba(0, 0, 0, 0.28)";

  private static readonly RING_WIDTH_RATIO = 0.075;
  private static readonly GLYPH_WIDTH_RATIO = 0.1;
  private static readonly GLYPH_SIZE_RATIO = 0.5;
  private static readonly SHADOW_BLUR_RATIO = 0.15;
  private static readonly SHADOW_OFFSET_RATIO = 0.04;

  static render({
    ctx,
    cx,
    cy,
    radius,
    glyph,
    isActive,
  }: {
    ctx: CanvasRenderingContext2D;
    cx: number;
    cy: number;
    radius: number;
    glyph: TouchGlyph;
    isActive: boolean;
  }) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const ink = isActive ? this.PAPER : this.INK;
    const ringWidth = radius * this.RING_WIDTH_RATIO;

    // Disc, lifted off the artwork with a soft shadow
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? this.ACTIVE_FILL : this.IDLE_FILL;
    ctx.shadowColor = this.SHADOW;
    ctx.shadowBlur = radius * this.SHADOW_BLUR_RATIO;
    ctx.shadowOffsetY = radius * this.SHADOW_OFFSET_RATIO;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Ring, inset so the stroke stays inside the disc
    ctx.beginPath();
    ctx.arc(cx, cy, radius - ringWidth / 2, 0, Math.PI * 2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = radius * this.GLYPH_WIDTH_RATIO;
    this.drawGlyph(ctx, cx, cy, radius * this.GLYPH_SIZE_RATIO, glyph);

    ctx.restore();
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
