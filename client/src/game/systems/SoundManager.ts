import { useAudio } from "@/stores/useAudio";

export class SoundManager {
  private static readonly DEFAULT_SHOOT_SOUND = "sounds/ak47_1.mp3";
  private static readonly EMPTY_MAGAZINE_SOUND = "sounds/ak-47-type-ii-empty-magazine.mp3";
  private static readonly RELOAD_SOUND = "sounds/type-99-rifle-loading-bullets-into-the-gun.mp3";

  private hitSound: HTMLAudioElement | null = null;
  private shootSound: HTMLAudioElement | null = null;
  private emptyMagazineSound: HTMLAudioElement | null = null;
  private reloadSound: HTMLAudioElement | null = null;
  private soundCache = new Map<string, HTMLAudioElement>();

  constructor() {
    this.loadSounds();
  }

  private loadSounds() {
    try {
      this.hitSound = new Audio("sounds/hit.mp3");
      this.shootSound = new Audio(SoundManager.DEFAULT_SHOOT_SOUND);
      this.emptyMagazineSound = new Audio(SoundManager.EMPTY_MAGAZINE_SOUND);
      this.reloadSound = new Audio(SoundManager.RELOAD_SOUND);
      this.hitSound.volume = 0.3;
      this.shootSound.volume = 0.2;
      this.emptyMagazineSound.volume = 0.3;
      this.reloadSound.volume = 0.3;
    } catch (error) {
      console.log("Failed to load sounds:", error);
    }
  }

  private getSound(path: string): HTMLAudioElement {
    let sound = this.soundCache.get(path);
    if (!sound) {
      sound = new Audio(path);
      this.soundCache.set(path, sound);
    }
    return sound;
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

  playShoot(soundEffect?: string) {
    const sound = soundEffect
      ? this.getSound(`sounds/${soundEffect}`)
      : this.shootSound;
    this.playSound(sound, 0.2);
  }

  playEmptyMagazine() {
    this.playSound(this.emptyMagazineSound, 0.3);
  }

  playReload() {
    this.playSound(this.reloadSound, 0.3);
  }
}
