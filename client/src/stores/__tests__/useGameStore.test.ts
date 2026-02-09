import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "@/stores/useGameStore";

const getState = () => useGameStore.getState();

describe("useGameStore", () => {
  beforeEach(() => {
    // Reset to initial state
    useGameStore.setState({
      phase: "ready",
      score: 0,
      enemiesKilled: 0,
      currentLevel: 1,
      debugMode: false,
    });
  });

  describe("initial state", () => {
    it("starts in ready phase", () => {
      expect(getState().phase).toBe("ready");
    });

    it("starts with zero score and kills", () => {
      expect(getState().score).toBe(0);
      expect(getState().enemiesKilled).toBe(0);
    });

    it("starts at level 1", () => {
      expect(getState().currentLevel).toBe(1);
    });

    it("has debug mode off", () => {
      expect(getState().debugMode).toBe(false);
    });
  });

  describe("start()", () => {
    it("transitions from ready to playing", () => {
      getState().start();
      expect(getState().phase).toBe("playing");
    });

    it("transitions from levelComplete to playing", () => {
      useGameStore.setState({ phase: "levelComplete" });
      getState().start();
      expect(getState().phase).toBe("playing");
    });

    it("does not transition from ended", () => {
      useGameStore.setState({ phase: "ended" });
      getState().start();
      expect(getState().phase).toBe("ended");
    });

    it("does not transition from playing", () => {
      useGameStore.setState({ phase: "playing" });
      getState().start();
      expect(getState().phase).toBe("playing");
    });
  });

  describe("end()", () => {
    it("transitions from playing to ended", () => {
      useGameStore.setState({ phase: "playing" });
      getState().end();
      expect(getState().phase).toBe("ended");
    });

    it("does not transition from ready", () => {
      getState().end();
      expect(getState().phase).toBe("ready");
    });

    it("does not transition from ended", () => {
      useGameStore.setState({ phase: "ended" });
      getState().end();
      expect(getState().phase).toBe("ended");
    });
  });

  describe("completeLevel()", () => {
    it("transitions from playing to levelComplete", () => {
      useGameStore.setState({ phase: "playing" });
      getState().completeLevel();
      expect(getState().phase).toBe("levelComplete");
    });

    it("does not transition from ready", () => {
      getState().completeLevel();
      expect(getState().phase).toBe("ready");
    });
  });

  describe("nextLevel()", () => {
    it("increments currentLevel and sets phase to ready", () => {
      useGameStore.setState({ phase: "levelComplete", currentLevel: 1 });
      getState().nextLevel();
      expect(getState().currentLevel).toBe(2);
      expect(getState().phase).toBe("ready");
    });

    it("increments from level 2 to level 3", () => {
      useGameStore.setState({ phase: "levelComplete", currentLevel: 2 });
      getState().nextLevel();
      expect(getState().currentLevel).toBe(3);
    });
  });

  describe("restart()", () => {
    it("resets to ready with zero score, kills, and level 1", () => {
      useGameStore.setState({
        phase: "ended",
        score: 500,
        enemiesKilled: 10,
        currentLevel: 3,
      });
      getState().restart();
      expect(getState().phase).toBe("ready");
      expect(getState().score).toBe(0);
      expect(getState().enemiesKilled).toBe(0);
      expect(getState().currentLevel).toBe(1);
    });
  });

  describe("addScore()", () => {
    it("adds points to the score", () => {
      getState().addScore(100);
      expect(getState().score).toBe(100);
      getState().addScore(50);
      expect(getState().score).toBe(150);
    });
  });

  describe("incrementEnemiesKilled()", () => {
    it("increments the kill count by 1", () => {
      getState().incrementEnemiesKilled();
      expect(getState().enemiesKilled).toBe(1);
      getState().incrementEnemiesKilled();
      expect(getState().enemiesKilled).toBe(2);
    });
  });

  describe("toggleDebugMode()", () => {
    it("toggles debug mode on and off", () => {
      getState().toggleDebugMode();
      expect(getState().debugMode).toBe(true);
      getState().toggleDebugMode();
      expect(getState().debugMode).toBe(false);
    });
  });

  describe("setSeed()", () => {
    it("sets the seed value", () => {
      getState().setSeed(99999);
      expect(getState().seed).toBe(99999);
    });
  });

  describe("generateRandomSeed()", () => {
    it("sets a numeric seed", () => {
      getState().generateRandomSeed();
      expect(typeof getState().seed).toBe("number");
      expect(getState().seed).toBeGreaterThanOrEqual(0);
    });
  });
});
