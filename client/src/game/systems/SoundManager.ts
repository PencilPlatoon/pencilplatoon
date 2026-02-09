import { useAudio } from "../../stores/useAudio";

export class SoundManager {
  private hitSound: HTMLAudioElement | null = null;
  private shootSound: HTMLAudioElement | null = null;

  constructor() {
    this.loadSounds();
  }

  private loadSounds() {
    try {
      this.hitSound = new Audio("sounds/hit.mp3");
      this.shootSound = new Audio("sounds/ak47_1.mp3");
      this.hitSound.volume = 0.3;
      this.shootSound.volume = 0.2;
    } catch (error) {
      console.log("Failed to load sounds:", error);
    }
  }

  playHit() {
    if (this.hitSound && !useAudio.getState().isSoundMuted) {
      const clone = this.hitSound.cloneNode() as HTMLAudioElement;
      clone.volume = 0.3;
      clone.play().catch(console.log);
    }
  }

  playShoot() {
    if (this.shootSound && !useAudio.getState().isSoundMuted) {
      const clone = this.shootSound.cloneNode() as HTMLAudioElement;
      clone.volume = 0.2;
      clone.play().catch(console.log);
    }
  }
}
