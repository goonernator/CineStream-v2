import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { fetchWithRetry } from '@/lib/retry';

interface VidlinkStream {
  url: string;
  quality: string;
  type: string;
  vidlinkPageUrl?: string; // The vidlink.pro page URL where this stream was found
  cookies?: string; // Cookies from the vidlink.pro page visit
}

interface VidlinkResponse {
  success: boolean;
  streams: VidlinkStream[];
  captions: any[];
  error?: string;
}

const VIDLINK_BASE_URL = 'https://vidlink.pro';

/**
 * Extract stream URL from vidlink.pro API response
 * The API returns JSON with stream URLs embedded in the response
 */
async function extractStreamFromVidlinkAPI(url: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://vidlink.pro/',
          'Origin': 'https://vidlink.pro',
        },
      },
      {
        maxRetries: 2,
        initialDelay: 1000,
        retryable: (error) => {
          if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
            return false;
          }
          return error instanceof Error && (
            error.message.includes('fetch') ||
            error.message.includes('network') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('Server error: 5')
          );
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    
    // The API response contains the stream URL in the JSON
    // Look for the m3u8 URL pattern
    const m3u8Match = text.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
    if (m3u8Match) {
      return m3u8Match[0];
    }

    // Try to parse as JSON and extract stream URL
    try {
      const json = JSON.parse(text);
      
      // Recursively search for stream URLs
      const findStreamUrl = (obj: any): string | null => {
        if (typeof obj === 'string' && obj.includes('.m3u8')) {
          return obj;
        }
        if (typeof obj === 'object' && obj !== null) {
          for (const value of Object.values(obj)) {
            const found = findStreamUrl(value);
            if (found) return found;
          }
        }
        return null;
      };
      
      return findStreamUrl(json);
    } catch {
      // Not JSON, continue
    }

    return null;
  } catch (error) {
    logger.warn('Error extracting stream from vidlink API:', error);
    return null;
  }
}

/**
 * Parse m3u8 playlist to extract all quality variants
 */
async function parseM3U8Playlist(m3u8Url: string, cookies: string): Promise<Array<{ url: string; quality: string }>> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://vidlink.pro/',
      'Origin': 'https://vidlink.pro',
    };
    
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    const response = await fetchWithRetry(m3u8Url, { headers }, {
      maxRetries: 2,
      initialDelay: 500,
      retryable: (error) => {
        return error instanceof Error && (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND')
        );
      },
    });
    if (!response.ok) {
      return [];
    }
    
    const playlistText = await response.text();
    const lines = playlistText.split('\n');
    
    const variants: Array<{ url: string; quality: string }> = [];
    let currentResolution: string | null = null;
    let currentBandwidth: number | null = null;
    
    // Parse base URL for relative paths
    const baseUrl = new URL(m3u8Url);
    const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Parse EXT-X-STREAM-INF line
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Extract RESOLUTION
        const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
        if (resolutionMatch) {
          currentResolution = resolutionMatch[1];
        }
        
        // Extract BANDWIDTH
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/i);
        if (bandwidthMatch) {
          currentBandwidth = parseInt(bandwidthMatch[1], 10);
        }
      }
      // Next line should be the URL
      else if (line && !line.startsWith('#') && (currentResolution || currentBandwidth)) {
        // Build full URL (handle relative paths)
        let variantUrl: string;
        if (line.startsWith('http://') || line.startsWith('https://')) {
          variantUrl = line;
        } else if (line.startsWith('/')) {
          variantUrl = `${baseUrl.origin}${line}`;
        } else {
          variantUrl = `${baseUrl.origin}${basePath}${line}`;
        }
        
        // Determine quality label
        let quality = 'Auto';
        if (currentResolution) {
          const [width, height] = currentResolution.split('x').map(Number);
          if (height >= 2160) quality = '4K';
          else if (height >= 1440) quality = '1440p';
          else if (height >= 1080) quality = '1080p';
          else if (height >= 720) quality = '720p';
          else if (height >= 480) quality = '480p';
          else if (height >= 360) quality = '360p';
          else quality = `${height}p`;
        } else if (currentBandwidth) {
          // Estimate quality from bandwidth
          if (currentBandwidth >= 15000000) quality = '4K';
          else if (currentBandwidth >= 8000000) quality = '1080p';
          else if (currentBandwidth >= 5000000) quality = '720p';
          else if (currentBandwidth >= 2000000) quality = '480p';
          else quality = '360p';
        }
        
        variants.push({ url: variantUrl, quality });
        currentResolution = null;
        currentBandwidth = null;
      }
    }
    
    // If no variants found but we have the main URL, return it as Auto
    if (variants.length === 0) {
      variants.push({ url: m3u8Url, quality: 'Auto' });
    }
    
    return variants;
  } catch (error) {
    logger.warn('Error parsing m3u8 playlist:', error);
    // Return the original URL as fallback
    return [{ url: m3u8Url, quality: 'Auto' }];
  }
}

/**
 * Use Puppeteer to extract stream URL from vidlink.pro page
 * This is a fallback when the API doesn't work directly
 * Returns all quality variants, vidlink page URL, and cookies
 */
async function extractStreamWithPuppeteer(url: string): Promise<{ streams: Array<{ url: string; quality: string }>; vidlinkPageUrl: string; cookies: string }> {
  // Skip puppeteer in development with Turbopack to avoid panics
  // The API fallback method will be used instead
  if (process.env.NODE_ENV === 'development') {
    logger.info('Skipping puppeteer in development mode to avoid Turbopack issues');
    return { streams: [], vidlinkPageUrl: url, cookies: '' };
  }

  try {
    // Load puppeteer from separate file to prevent Turbopack analysis
    let puppeteer: any;
    try {
      // Import lazily at runtime to avoid Turbopack analyzing puppeteer paths in dev.
      const { loadPuppeteer } = await import('@/lib/puppeteer-loader');
      puppeteer = await loadPuppeteer();
    } catch (importError) {
      logger.error('Failed to load puppeteer:', importError);
      return { streams: [], vidlinkPageUrl: url, cookies: '' };
    }
    
    let browser: any;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch (launchError) {
      logger.error('Failed to launch puppeteer browser:', launchError);
      return { streams: [], vidlinkPageUrl: url, cookies: '' };
    }

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const videoSources: string[] = [];
      
      // Intercept network responses
      page.on('response', async (response: any) => {
        const responseUrl = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        if (contentType.includes('application/vnd.apple.mpegurl') || 
            contentType.includes('application/x-mpegURL') ||
            responseUrl.includes('.m3u8')) {
          if (!videoSources.includes(responseUrl)) {
            videoSources.push(responseUrl);
          }
        }
      });
      
      // Intercept console logs for stream URLs
      page.on('console', (msg: any) => {
        const text = msg.text();
        const m3u8Match = text.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
        if (m3u8Match && !videoSources.includes(m3u8Match[1])) {
          videoSources.push(m3u8Match[1]);
        }
      });
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      
      // Wait a bit for JavaScript to execute
      await page.waitForTimeout(3000);
      
      // Check window object for video URL
      const pageVideoUrl = await page.evaluate(() => {
        if ((window as any).__VIDEO_URL__) {
          return (window as any).__VIDEO_URL__;
        }
        return null;
      });
      
      if (pageVideoUrl && !videoSources.includes(pageVideoUrl)) {
        videoSources.push(pageVideoUrl);
      }
      
      // Also check page content for m3u8 URLs
      try {
        const pageContent = await page.content();
        const m3u8Pattern = /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/gi;
        let match;
        while ((match = m3u8Pattern.exec(pageContent)) !== null) {
          const foundUrl = match[1];
          if (!videoSources.includes(foundUrl) && 
              !foundUrl.includes('woff2') && 
              !foundUrl.includes('.js')) {
            videoSources.push(foundUrl);
          }
        }
      } catch (e) {
        logger.warn('Error searching page content for m3u8:', e);
      }
      
      // Check video elements for src
      try {
        const videoSrc = await page.evaluate(() => {
          const video = document.querySelector('video') as HTMLVideoElement | null;
          if (video && video.src && video.src.includes('.m3u8')) {
            return video.src;
          }
          // Check source elements
          const source = document.querySelector('video source') as HTMLSourceElement | null;
          if (source && source.src && source.src.includes('.m3u8')) {
            return source.src;
          }
          return null;
        });
        
        if (videoSrc && !videoSources.includes(videoSrc)) {
          videoSources.push(videoSrc);
        }
      } catch (e) {
        logger.warn('Error checking video elements:', e);
      }
      
      // Get the first valid stream URL (main m3u8 playlist)
      const validStream = videoSources.find(url => 
        url.includes('.m3u8') && 
        !url.includes('woff2') && 
        !url.includes('.js') &&
        (url.includes('storm.vodvidl.site') || url.includes('vodvidl.site') || url.includes('vidlink'))
      ) || videoSources.find(url => 
        url.includes('.m3u8') && 
        !url.includes('woff2') && 
        !url.includes('.js')
      );
      
      // Get cookies from the page
      const cookies = await page.cookies();
      const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
      
      if (!validStream) {
        return {
          streams: [],
          vidlinkPageUrl: url,
          cookies: cookieString
        };
      }
      
      // Parse the m3u8 playlist to get all quality variants
      const qualityVariants = await parseM3U8Playlist(validStream, cookieString);
      
      return {
        streams: qualityVariants,
        vidlinkPageUrl: url,
        cookies: cookieString
      };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          logger.warn('Error closing browser:', closeError);
        }
      }
    }
  } catch (error) {
    logger.error('Error using Puppeteer to extract vidlink stream:', error);
    return { streams: [], vidlinkPageUrl: url, cookies: '' };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<VidlinkResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type'); // 'movie' or 'tv'
  const tmdbId = searchParams.get('tmdbId');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');

  if (!type || !tmdbId) {
    return NextResponse.json(
      { success: false, streams: [], captions: [], error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    // Build vidlink.pro URL
    let vidlinkUrl: string;
    
    if (type === 'movie') {
      vidlinkUrl = `${VIDLINK_BASE_URL}/movie/${tmdbId}`;
    } else if (type === 'tv') {
      if (!season || !episode) {
        return NextResponse.json(
          { success: false, streams: [], captions: [], error: 'Missing season or episode for TV show' },
          { status: 400 }
        );
      }
      vidlinkUrl = `${VIDLINK_BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
    } else {
      return NextResponse.json(
        { success: false, streams: [], captions: [], error: 'Invalid type parameter' },
        { status: 400 }
      );
    }

    // Try API method first (faster and doesn't require puppeteer)
    let extractionResult: { streams: Array<{ url: string; quality: string }>; vidlinkPageUrl: string; cookies: string };
    
    logger.info('Trying API method first for vidlink extraction');
    const apiStreamUrl = await extractStreamFromVidlinkAPI(vidlinkUrl);
    
    if (apiStreamUrl) {
      // Parse the m3u8 playlist to get quality variants
      const qualityVariants = await parseM3U8Playlist(apiStreamUrl, '');
      extractionResult = {
        streams: qualityVariants,
        vidlinkPageUrl: vidlinkUrl,
        cookies: ''
      };
    } else {
      // If API method fails, try Puppeteer as fallback (only in production)
      logger.info('API method failed, trying Puppeteer fallback');
      extractionResult = await extractStreamWithPuppeteer(vidlinkUrl);
    }
    
    if (!extractionResult.streams || extractionResult.streams.length === 0) {
      return NextResponse.json(
        { success: false, streams: [], captions: [], error: 'No stream URLs found' },
        { status: 404 }
      );
    }

    // Convert quality variants to VidlinkStream format
    const streams: VidlinkStream[] = extractionResult.streams.map(variant => ({
      url: variant.url,
      quality: variant.quality,
      type: 'hls',
      vidlinkPageUrl: extractionResult.vidlinkPageUrl,
      cookies: extractionResult.cookies,
    }));

    return NextResponse.json(
      {
        success: true,
        streams: streams,
        captions: [], // Vidlink doesn't provide captions in the same way
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Error fetching vidlink stream:', {
      message: errorMessage,
      stack: errorStack,
      type: type,
      tmdbId: tmdbId,
      season: season,
      episode: episode,
    });
    
    return NextResponse.json(
      {
        success: false,
        streams: [],
        captions: [],
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

