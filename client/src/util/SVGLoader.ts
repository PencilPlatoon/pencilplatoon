// Utility for loading and parsing SVGs to extract bounding box info

import { BoundingBox } from "../game/BoundingBox";

export type SVGInfo = {
  image: HTMLImageElement;
  boundingBox: BoundingBox;
};

export class SVGLoader {
  private static cache: { [path: string]: SVGInfo } = {};
  private static errorPaths: Set<string> = new Set();

  /**
   * Returns a Promise for SVGInfo for the given path, loading and caching if needed.
   */
  static async get(path: string): Promise<SVGInfo | null> {
    if (this.errorPaths.has(path)) return null;
    if (this.cache[path]) return this.cache[path];
    // Fetch SVG
    const res = await fetch(path);
    const svgText = await res.text();
    // Try to parse viewBox
    let width = 192, height = 196;
    const viewBoxMatch = svgText.match(/viewBox\s*=\s*"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
    if (viewBoxMatch) {
      width = parseFloat(viewBoxMatch[3]);
      height = parseFloat(viewBoxMatch[4]);
    } else {
      // Fallback: try width/height attributes
      const widthMatch = svgText.match(/width\s*=\s*"([\d.]+)[a-zA-Z]*"/);
      const heightMatch = svgText.match(/height\s*=\s*"([\d.]+)[a-zA-Z]*"/);
      if (widthMatch && heightMatch) {
        width = parseFloat(widthMatch[1]);
        height = parseFloat(heightMatch[1]);
      }
    }
    // Create image
    const image = new window.Image();
    image.src = path;
    const svgInfo: SVGInfo = { image, boundingBox: new BoundingBox(width, height, 0.5, 0.5) };
    // Wait for image to be loaded if not already
    if (!image.complete) {
      const loaded = await new Promise<boolean>((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
      });
      if (!loaded) {
        console.error(`Failed to load SVG image: ${path}`);
        this.errorPaths.add(path);
        return null;
      }
    }
    this.cache[path] = svgInfo;
    return svgInfo;
  }
} 