export abstract class TimedAnimation {
  private active = false;
  private startTime = 0;
  private animationDuration = 0;
  protected getNow: () => number;

  constructor(getNow: () => number = Date.now) {
    this.getNow = getNow;
  }

  protected startAnimation(duration: number): void {
    this.active = true;
    this.startTime = this.getNow();
    this.animationDuration = duration;
  }

  protected stopAnimation(): void {
    this.active = false;
  }

  isInProgress(): boolean {
    return this.active;
  }

  getElapsedTime(): number {
    if (!this.active) return 0;
    return this.getNow() - this.startTime;
  }

  getProgress(): number {
    if (!this.active || this.animationDuration === 0) return 0;
    return Math.min(1, this.getElapsedTime() / this.animationDuration);
  }

  isComplete(): boolean {
    return this.active && this.getElapsedTime() >= this.animationDuration;
  }

  reset(): void {
    this.active = false;
    this.startTime = 0;
    this.animationDuration = 0;
  }
}
