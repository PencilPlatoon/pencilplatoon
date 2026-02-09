import { create } from "zustand";

interface AudioState {
  backgroundMusic: HTMLAudioElement | null;
  isSoundMuted: boolean;
  isMusicMuted: boolean;
  
  // Setter functions
  setBackgroundMusic: (music: HTMLAudioElement) => void;
  
  // Control functions
  toggleSoundMute: () => void;
  toggleMusicMute: () => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  backgroundMusic: null,
  isSoundMuted: false, // Start unmuted by default
  isMusicMuted: true, // Start muted by default
  
  setBackgroundMusic: (music) => set({ backgroundMusic: music }),
  
  toggleSoundMute: () => {
    const { isSoundMuted } = get();
    const newMutedState = !isSoundMuted;
    set({ isSoundMuted: newMutedState });
    console.log(`Sound effects ${newMutedState ? 'muted' : 'unmuted'}`);
  },
  toggleMusicMute: () => {
    const { isMusicMuted } = get();
    const newMutedState = !isMusicMuted;
    set({ isMusicMuted: newMutedState });
    console.log(`Music ${newMutedState ? 'muted' : 'unmuted'}`);
  },
}));
