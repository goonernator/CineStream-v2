/**
 * Puppeteer loader - separated to prevent Turbopack from analyzing puppeteer imports
 * This file uses require() at runtime to avoid compile-time analysis
 */

export async function loadPuppeteer(): Promise<any> {
  try {
    // Use require() at runtime - this prevents Turbopack from analyzing the import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer');
    // Handle both CommonJS and ESM exports
    return puppeteer.default || puppeteer;
  } catch (error) {
    throw new Error(`Failed to load puppeteer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

