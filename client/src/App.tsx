import { useEffect } from "react";
import Game from "./components/Game";
import { useAudio } from "./stores/useAudio";
import "./index.css";

function App() {
  const { setBackgroundMusic } = useAudio();

  useEffect(() => {
    // Initialize audio
    const bgMusic = new Audio("/sounds/background.mp3");
    bgMusic.loop = true;
    bgMusic.volume = 0.3;
    setBackgroundMusic(bgMusic);
  }, [setBackgroundMusic]);

  return (
    <div className="w-full h-screen bg-white overflow-hidden">
      <Game />
    </div>
  );
}

export default App;
