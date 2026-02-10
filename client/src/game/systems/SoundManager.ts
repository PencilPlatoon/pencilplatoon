import { useAudio } from "@/stores/useAudio";

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

  private playSound(sound: HTMLAudioElement | null, volume: number): void {
    if (sound && !useAudio.getState().isSoundMuted) {
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = volume;
      clone.play().catch(console.log);
    }
  }

  playHit() {
    this.playSound(this.hitSound, 0.3);
  }

  playShoot() {
    this.playSound(this.shootSound, 0.2);
  }
}
