import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { fetchWithRetry } from '@/lib/retry';
import { fetch as undiciFetch } from 'undici';

export const runtime = 'nodejs';

async function fetchWithNodeRequest(
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await undiciFetch(targetUrl, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: new Headers(res.headers as any),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'Missing URL parameter' },
      { status: 400 }
    );
  }

  try {
    // IMPORTANT: Do not decode valid URLs here.
    // Some providers (Valhalla/Flowcast) intentionally contain a nested percent-encoded `url=` query param.
    // Decoding the full outer URL corrupts the nested params/signature (e.g. `%26t=` becomes outer `&t=`).
    let decodedUrl = url;
    let urlObj: URL;
    try {
      urlObj = new URL(decodedUrl);
    } catch {
      // Fallback only for genuinely double-encoded URLs.
      const testDecoded = decodeURIComponent(url);
      decodedUrl = testDecoded;
      urlObj = new URL(decodedUrl);
    }
    
    // Check if this is a vidlink URL that requires special headers
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    
    const isValhallaProxy = urlObj.hostname.includes('valhallastream');

    // Rivestream/Flowcast URLs are often wrapped by Valhalla with a nested `headers=` query param.
    // Those headers are intended for Valhalla to forward to the *inner* target, not for our outer request.
    if (isValhallaProxy) {
      headers['Referer'] = 'https://rivestream.org/';
      headers['Origin'] = 'https://rivestream.org';
    } else {
      // Apply upstream header hints encoded in the target URL when we're fetching the actual target directly.
      // Example: ?headers={"Referer":"https://filmboom.top/","Origin":"https://filmboom.top"}
      const hintedHeadersParam = urlObj.searchParams.get('headers');
      if (hintedHeadersParam) {
        try {
          const parsed = JSON.parse(hintedHeadersParam);
          if (parsed?.Referer || parsed?.referer) headers['Referer'] = parsed.Referer || parsed.referer;
          if (parsed?.Origin || parsed?.origin) headers['Origin'] = parsed.Origin || parsed.origin;
        } catch {
          try {
            const parsed = JSON.parse(decodeURIComponent(hintedHeadersParam));
            if (parsed?.Referer || parsed?.referer) headers['Referer'] = parsed.Referer || parsed.referer;
            if (parsed?.Origin || parsed?.origin) headers['Origin'] = parsed.Origin || parsed.origin;
          } catch {
            // Ignore malformed header hints
          }
        }
      }
    }

    // Forward client Range requests (important for MP4 seeking/partial content)
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    } else if (isValhallaProxy) {
      // Flowcast/HindiCast Valhalla proxy often rejects non-range GETs.
      headers['Range'] = 'bytes=0-';
    }

    // For vidlink URLs, always apply required headers and clean the URL
    // Vidlink requires specific Referer and Origin headers to work
    // Check both decoded and original URL to catch vidlink domains
    const isVidlink = decodedUrl.includes('storm.vodvidl.site') || 
                     decodedUrl.includes('vodvidl.site') ||
                     url.includes('storm.vodvidl.site') || 
                     url.includes('vodvidl.site');
    
    let cleanUrl = decodedUrl;
    if (isVidlink) {
      // ALWAYS use exactly https://vidlink.pro/ as Referer - nothing more, nothing less
      headers['Referer'] = 'https://vidlink.pro/';
      headers['Origin'] = 'https://vidlink.pro';
      
      // Extract cookies from proxy URL query params (not from the stream URL itself)
      const cookies = searchParams.get('cookies');
      
      // Add cookies if available
      if (cookies) {
        headers['Cookie'] = cookies;
      }
      
      // Use the stream URL exactly as-is - don't modify it
      // The stream URL should be the .m3u8 URL exactly as extracted
      cleanUrl = decodedUrl;
      
      // Also add additional headers that browsers typically send
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma'] = 'no-cache';
    }
    
    // Next's patched fetch can strip/alter headers on some hosts (notably Valhalla/Cloudflare).
    // Use Node's http/https client for Valhalla so Referer/Origin are sent exactly.
    const response = isValhallaProxy
      ? await fetchWithNodeRequest(cleanUrl, headers, 30000)
      : await fetchWithRetry(
          cleanUrl,
          {
            headers,
            // Don't follow redirects automatically for better control
            redirect: 'follow',
          },
          {
            maxRetries: 2,
            initialDelay: 500,
            retryable: (error) => {
              // Retry on network errors and 5xx errors, but not on 4xx (except 429)
              if (error instanceof Error && error.message.includes('Server error: 4')) {
                const statusMatch = error.message.match(/Server error: (\d+)/);
                if (statusMatch && statusMatch[1] !== '429') {
                  return false; // Don't retry on 4xx errors except 429
                }
              }
              return error instanceof Error && (
                error.message.includes('fetch') ||
                error.message.includes('network') ||
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('Server error: 5') ||
                error.message.includes('Server error: 429')
              );
            },
          }
        );

    if (!response.ok) {
      // Get response body for more details
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        // Ignore if we can't read the body
      }
      
      logger.error('HLS proxy fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        url: cleanUrl.substring(0, 200),
        isVidlink: cleanUrl.includes('storm.vodvidl.site') || cleanUrl.includes('vodvidl.site'),
        headers: Object.keys(headers).map(k => `${k}: ${headers[k]}`).join(', '),
        errorBody: errorBody.substring(0, 200)
      });
      
      // For 403 errors, return error
      if (response.status === 403) {
        return NextResponse.json(
          { 
            error: 'Access forbidden (403)', 
            message: 'The server rejected the request. This may be due to missing or incorrect headers.',
            url: cleanUrl.substring(0, 200),
            headers: {
              referer: headers['Referer'],
              origin: headers['Origin']
            }
          },
          { status: 403 }
        );
      }
      
      return new NextResponse(`Failed to fetch: ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Check if this is an m3u8 playlist
    if (cleanUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8')) {
      // Get the playlist content
      const playlistText = await response.text();
      
      // Validate that this is actually an m3u8 file
      if (!playlistText.trim().startsWith('#EXTM3U') && !playlistText.includes('#EXT')) {
        logger.error('Invalid m3u8 response - does not start with #EXTM3U:', {
          url: cleanUrl.substring(0, 200),
          contentType,
          firstChars: playlistText.substring(0, 200),
          status: response.status
        });
        return NextResponse.json(
          { 
            error: 'Invalid m3u8 file', 
            message: 'The response does not appear to be a valid HLS playlist',
            details: playlistText.substring(0, 500)
          },
          { status: 500 }
        );
      }
      
      // Rewrite URLs in the playlist to go through our proxy
      const baseUrl = new URL(cleanUrl);
      const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
      // For vidlink manifests, segments will also be from vidlink domains
      // The proxy will automatically detect vidlink domains and apply headers
      const rewrittenPlaylist = playlistText
        .split('\n')
        .map(line => {
          const trimmed = line.trim();
          
          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith('#')) {
            return line;
          }
          
          // This is a URL line
          let segmentUrl = trimmed;
          
          // Convert relative URLs to absolute
          if (!segmentUrl.startsWith('http://') && !segmentUrl.startsWith('https://')) {
            if (segmentUrl.startsWith('/')) {
              segmentUrl = baseUrl.origin + segmentUrl;
            } else {
              segmentUrl = basePath + segmentUrl;
            }
          }
          
          // Validate URL before rewriting
          try {
            new URL(segmentUrl);
          } catch (e) {
            logger.warn('Invalid segment URL in playlist, skipping:', segmentUrl);
            return line; // Return original line if URL is invalid
          }
          
          // For vidlink segments, mark them so the proxy applies headers
          // The proxy will detect vidlink domains and apply headers automatically
          // No need to add headers to the URL - the proxy handles it by domain
          
          // Rewrite to use our proxy
          const proxyUrl = `/api/proxy-hls?url=${encodeURIComponent(segmentUrl)}`;
          return proxyUrl;
        })
        .join('\n');
      
      return new NextResponse(rewrittenPlaylist, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
    
    // For video segments, just proxy the binary data
    const arrayBuffer = await response.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      status: response.status,
      headers: {
        'Content-Type': contentType || 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        ...(response.headers.get('content-range') ? { 'Content-Range': response.headers.get('content-range')! } : {}),
        ...(response.headers.get('accept-ranges') ? { 'Accept-Ranges': response.headers.get('accept-ranges')! } : {}),
        ...(response.headers.get('content-length') ? { 'Content-Length': response.headers.get('content-length')! } : {}),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    logger.error('Error proxying HLS:', error);
    return NextResponse.json(
      { error: 'Failed to proxy HLS', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}
