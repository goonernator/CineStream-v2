import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import puppeteer from 'puppeteer';

interface Flix2dayStream {
  url: string;
  quality: string;
  type: string;
  flix2dayPageUrl?: string;
  cookies?: string;
}

interface Flix2dayResponse {
  success: boolean;
  streams: Flix2dayStream[];
  captions: any[];
  error?: string;
}

const FLIX2DAY_BASE_URL = 'https://flix2day.xyz';

/**
 * Extract stream URL from flix2day.xyz using Puppeteer
 * The page uses JWPlayer and decrypts the stream URL client-side
 */
async function extractStreamWithPuppeteer(
  url: string
): Promise<{ streamUrl: string | null; flix2dayPageUrl: string; cookies: string }> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const videoSources: string[] = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Intercept network responses to capture m3u8 URLs
    page.on('response', async (response) => {
      const responseUrl = response.url();
      const contentType = response.headers()['content-type'] || '';

      if (
        contentType.includes('application/vnd.apple.mpegurl') ||
        contentType.includes('application/x-mpegURL') ||
        responseUrl.includes('.m3u8')
      ) {
        if (!videoSources.includes(responseUrl)) {
          videoSources.push(responseUrl);
          logger.debug('Found m3u8 stream:', responseUrl);
        }
      }
    });

    // Intercept console logs for stream URLs
    page.on('console', (msg) => {
      const text = msg.text();
      const m3u8Match = text.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
      if (m3u8Match && !videoSources.includes(m3u8Match[1])) {
        videoSources.push(m3u8Match[1]);
        logger.debug('Found m3u8 in console:', m3u8Match[1]);
      }
    });

    logger.debug('Loading flix2day page:', url);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Try to trigger video playback
    try {
      const playButton = await page.$('button[aria-label*="play" i], button[class*="play" i], .play-button');
      if (playButton) {
        await playButton.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      // Ignore if no play button
    }

    // Wait for video to load and make network requests
    await page.waitForTimeout(10000);

    // Check video element for src
    try {
      const videoSrc = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.src && video.src.includes('.m3u8')) {
          return video.src;
        }
        const source = document.querySelector('video source');
        if (source && source.src && source.src.includes('.m3u8')) {
          return source.src;
        }
        return null;
      });

      if (videoSrc && !videoSources.includes(videoSrc)) {
        videoSources.push(videoSrc);
      }
    } catch (e) {
      // Ignore
    }

    // Get cookies
    const cookies = await page.cookies();
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    // Find the best m3u8 URL
    const validStream = videoSources.find((url) => url.includes('.m3u8') && !url.includes('woff2') && !url.includes('.js'));

    return {
      streamUrl: validStream || null,
      flix2dayPageUrl: url,
      cookies: cookieString,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Parse m3u8 playlist to extract all quality variants
 */
async function parseM3U8Playlist(
  playlistUrl: string,
  flix2dayPageUrl: string,
  cookies: string
): Promise<Flix2dayStream[]> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://flix2day.xyz/',
      'Origin': 'https://flix2day.xyz',
    };
    if (cookies) {
      headers['Cookie'] = cookies;
    }

    const response = await fetch(playlistUrl, { headers });
    if (!response.ok) {
      logger.warn(`Failed to fetch m3u8 playlist from ${playlistUrl}: ${response.statusText}`);
      return [];
    }

    const playlistText = await response.text();
    const lines = playlistText.split('\n');
    const streams: Flix2dayStream[] = [];
    let currentStreamInfo: { resolution?: string; bandwidth?: number; url?: string } = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        currentStreamInfo.resolution = resolutionMatch ? resolutionMatch[1] : undefined;
        currentStreamInfo.bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : undefined;
      } else if (line.startsWith('http') || line.startsWith('/')) {
        const variantUrl = new URL(line, playlistUrl).toString();
        let quality = 'Auto';
        if (currentStreamInfo.resolution) {
          const height = parseInt(currentStreamInfo.resolution.split('x')[1], 10);
          if (height >= 2160) quality = '4K';
          else if (height >= 1440) quality = '1440p';
          else if (height >= 1080) quality = '1080p';
          else if (height >= 720) quality = '720p';
          else if (height >= 480) quality = '480p';
          else if (height >= 360) quality = '360p';
        }
        streams.push({
          url: variantUrl,
          quality: quality,
          type: 'hls',
          flix2dayPageUrl,
          cookies,
        });
        currentStreamInfo = {};
      }
    }
    return streams;
  } catch (error) {
    logger.warn('Error parsing m3u8 playlist:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tmdbId = searchParams.get('tmdbId');
    const type = searchParams.get('type') || 'movie';
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!tmdbId) {
      return NextResponse.json(
        { success: false, streams: [], captions: [], error: 'Missing tmdbId parameter' },
        { status: 400 }
      );
    }

    // Construct flix2day URL from hash fragment
    // The hash is typically the stream identifier
    // For now, we'll need to get the hash from the URL or construct it
    // This is a placeholder - you'll need to determine how to get the hash from TMDB ID
    const hash = searchParams.get('hash') || tmdbId; // Placeholder - adjust based on actual implementation

    const flix2dayUrl = `${FLIX2DAY_BASE_URL}/#${hash}`;

    logger.debug('Extracting stream from flix2day:', flix2dayUrl);

    const { streamUrl, flix2dayPageUrl, cookies } = await extractStreamWithPuppeteer(flix2dayUrl);

    if (!streamUrl) {
      return NextResponse.json(
        { success: false, streams: [], captions: [], error: 'No stream URL found' },
        { status: 404 }
      );
    }

    // Parse m3u8 playlist to get all quality variants
    const streams = await parseM3U8Playlist(streamUrl, flix2dayPageUrl, cookies);

    // If no variants found, use the master playlist URL
    if (streams.length === 0) {
      streams.push({
        url: streamUrl,
        quality: 'Auto',
        type: 'hls',
        flix2dayPageUrl,
        cookies,
      });
    }

    // Extract captions from URL parameters if available
    const captions: any[] = [];
    try {
      const subsParam = new URL(flix2dayUrl).searchParams.get('subs');
      if (subsParam) {
        const decoded = decodeURIComponent(subsParam);
        const subs = JSON.parse(decoded);
        if (Array.isArray(subs)) {
          subs.forEach((sub: any) => {
            if (sub.url) {
              captions.push({
                language: sub.label || sub.language || 'unknown',
                url: sub.url,
                default: sub.default || false,
              });
            }
          });
        }
      }
    } catch (e) {
      // Ignore caption parsing errors
    }

    return NextResponse.json({
      success: true,
      streams,
      captions,
    });
  } catch (error) {
    logger.error('Error parsing flix2day:', error);
    return NextResponse.json(
      {
        success: false,
        streams: [],
        captions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

