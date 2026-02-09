export class SeededRandom {
  private seed: number;
  private m: number = 0x80000000; // 2**31
  private a: number = 1103515245;
  private c: number = 12345;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.a * this.seed + this.c) % this.m;
    return this.seed / this.m;
  }

  // Generate a random number between min and max (inclusive)
  random(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Generate a random integer between min and max (inclusive)
  randomInt(min: number, max: number): number {
    return Math.floor(this.random(min, max + 1));
  }

  // Generate a random element from an array
  randomChoice<T>(array: T[]): T {
    return array[this.randomInt(0, array.length - 1)];
  }

  // Generate a random boolean with given probability
  randomBoolean(probability: number = 0.5): boolean {
    return this.next() < probability;
  }
}

// Global seeded random instance
let globalSeededRandom: SeededRandom | null = null;

export function setGlobalSeed(seed: number): void {
  globalSeededRandom = new SeededRandom(seed);
}

export function getGlobalSeededRandom(): SeededRandom {
  if (!globalSeededRandom) {
    // Fallback to a default seed if none is set
    globalSeededRandom = new SeededRandom(12345);
  }
  return globalSeededRandom;
}

// Convenience functions that use the global seeded random
export function seededRandom(min: number, max: number): number {
  return getGlobalSeededRandom().random(min, max);
}

export function seededRandomInt(min: number, max: number): number {
  return getGlobalSeededRandom().randomInt(min, max);
}

export function seededRandomChoice<T>(array: T[]): T {
  return getGlobalSeededRandom().randomChoice(array);
}

export function seededRandomBoolean(probability: number = 0.5): boolean {
  return getGlobalSeededRandom().randomBoolean(probability);
}
