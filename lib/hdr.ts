/**
 * HDR (High Dynamic Range) support detection and utilities
 * Supports HDR10, HDR10+, and Dolby Vision
 */

// Cache HDR detection result to prevent repeated checks
let cachedHDRCapabilities: HDRCapabilities | null = null;
let isDetecting = false;

export interface HDRCapabilities {
  supported: boolean;
  formats: {
    hdr10: boolean;
    hdr10Plus: boolean;
    dolbyVision: boolean;
  };
  display: {
    colorGamut: string | null;
    colorDepth: string | null;
    peakBrightness: number | null;
  };
}

/**
 * Detects HDR support on the current browser/device
 * Uses caching to prevent repeated detection calls
 */
export function detectHDRSupport(): HDRCapabilities {
  // Return cached result if available
  if (cachedHDRCapabilities !== null) {
    return cachedHDRCapabilities;
  }

  // Prevent concurrent detection
  if (isDetecting) {
    // Return default while detection is in progress
    return {
      supported: false,
      formats: {
        hdr10: false,
        hdr10Plus: false,
        dolbyVision: false,
      },
      display: {
        colorGamut: null,
        colorDepth: null,
        peakBrightness: null,
      },
    };
  }

  if (typeof window === 'undefined') {
    const defaultCapabilities: HDRCapabilities = {
      supported: false,
      formats: {
        hdr10: false,
        hdr10Plus: false,
        dolbyVision: false,
      },
      display: {
        colorGamut: null,
        colorDepth: null,
        peakBrightness: null,
      },
    };
    cachedHDRCapabilities = defaultCapabilities;
    return defaultCapabilities;
  }

  isDetecting = true;

  const capabilities: HDRCapabilities = {
    supported: false,
    formats: {
      hdr10: false,
      hdr10Plus: false,
      dolbyVision: false,
    },
    display: {
      colorGamut: null,
      colorDepth: null,
      peakBrightness: null,
    },
  };

  // Check for HDR support via MediaCapabilities API (most reliable)
  if ('MediaCapabilities' in window && 'decodingInfo' in window.MediaCapabilities.prototype) {
    // This is async, but we'll use it for runtime checks
    // For now, we'll use other methods for synchronous detection
  }

  // Check for HDR via CSS media queries
  const mediaQuery = window.matchMedia('(dynamic-range: high)');
  capabilities.supported = mediaQuery.matches;

  // Check for specific HDR formats via CSS
  const hdr10Query = window.matchMedia('(color-gamut: rec2020)');
  const wideColorQuery = window.matchMedia('(color-gamut: p3)');
  
  // HDR10 typically uses rec2020 color space
  capabilities.formats.hdr10 = hdr10Query.matches || capabilities.supported;
  
  // Check for Dolby Vision (less reliable, but we can check for wide color gamut)
  capabilities.formats.dolbyVision = wideColorQuery.matches && capabilities.supported;

  // Get display color gamut
  if (hdr10Query.matches) {
    capabilities.display.colorGamut = 'rec2020';
  } else if (wideColorQuery.matches) {
    capabilities.display.colorGamut = 'p3';
  } else {
    capabilities.display.colorGamut = 'srgb';
  }

  // Check color depth
  const colorDepthQuery = window.matchMedia('(color-depth: 10)');
  if (colorDepthQuery.matches) {
    capabilities.display.colorDepth = '10-bit';
  } else {
    const colorDepthQuery8 = window.matchMedia('(color-depth: 8)');
    capabilities.display.colorDepth = colorDepthQuery8.matches ? '8-bit' : 'unknown';
  }

  // Check for HDR via video element codec support
  // Use a single cached video element to avoid creating many elements
  // Only create video element if we're in a browser environment and haven't cached yet
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const testVideo = document.createElement('video');
      if (testVideo && testVideo.canPlayType) {
        // Check for HDR codecs
        const hdrCodecs = [
          'video/mp4; codecs="hev1.1.6.L120.B0"', // HEVC HDR10
          'video/mp4; codecs="hev1.2.4.L120.B0"', // HEVC HDR10+
          'video/mp4; codecs="dvh1.08.07"', // Dolby Vision HEVC
          'video/mp4; codecs="av01.0.08M.10"', // AV1 HDR
        ];

        for (const codec of hdrCodecs) {
          try {
            const support = testVideo.canPlayType(codec);
            if (support === 'probably' || support === 'maybe') {
              capabilities.supported = true;
              if (codec.includes('dvh1')) {
                capabilities.formats.dolbyVision = true;
              } else if (codec.includes('hev1')) {
                capabilities.formats.hdr10 = true;
                if (codec.includes('L120')) {
                  capabilities.formats.hdr10Plus = true;
                }
              }
            }
          } catch (e) {
            // Ignore codec check errors
          }
        }
      }
    }
  } catch (e) {
    // Ignore all errors - fall back to CSS media query detection only
  }

  // Try to get peak brightness (experimental, not widely supported)
  try {
    // @ts-ignore - experimental API
    if (window.screen && 'requestHDRMetadata' in window.screen) {
      // This would be async, so we'll handle it separately if needed
    }
  } catch (e) {
    // Ignore
  }

  // Cache the result
  cachedHDRCapabilities = capabilities;
  isDetecting = false;
  return capabilities;
}

/**
 * Checks if HDR is currently supported
 */
export function isHDRSupported(): boolean {
  return detectHDRSupport().supported;
}

/**
 * Gets the preferred HDR format for the current device
 */
export function getPreferredHDRFormat(): 'hdr10' | 'hdr10plus' | 'dolby-vision' | null {
  const capabilities = detectHDRSupport();
  
  if (capabilities.formats.dolbyVision) {
    return 'dolby-vision';
  }
  if (capabilities.formats.hdr10Plus) {
    return 'hdr10plus';
  }
  if (capabilities.formats.hdr10) {
    return 'hdr10';
  }
  
  return null;
}

/**
 * Checks if the video element can play HDR content
 */
export async function checkVideoHDRSupport(videoElement: HTMLVideoElement): Promise<boolean> {
  if (!videoElement) return false;

  try {
    // Check if video has HDR metadata (experimental API)
    // @ts-ignore - experimental API
    if (videoElement.getVideoTracks) {
      // @ts-ignore - experimental API
      const videoTrack = videoElement.getVideoTracks();
      if (videoTrack && videoTrack.length > 0) {
        // Modern browsers expose HDR info via video tracks
        // @ts-ignore - experimental API
        const settings = videoTrack[0].getSettings?.();
        if (settings) {
          // @ts-ignore
          return settings.transferFunction === 'pq' || settings.transferFunction === 'hlg';
        }
      }
    }

    // Fallback: check if video is playing in HDR mode
    // This is detected by checking the video's color space
    // @ts-ignore - experimental API
    if (videoElement.getVideoPlaybackQuality) {
      const quality = videoElement.getVideoPlaybackQuality();
      // @ts-ignore
      if (quality && quality.totalVideoFrames > 0) {
        // If we can detect it, the browser likely supports it
        return true;
      }
    }
  } catch (e) {
    // Ignore errors
  }

  return false;
}

