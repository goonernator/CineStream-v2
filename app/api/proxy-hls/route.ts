import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { logger } from '@/lib/logger';
import { fetchWithRetry } from '@/lib/retry';
import { fetch as undiciFetch } from 'undici';

export const runtime = 'nodejs';

function decompressBody(buffer: ArrayBuffer, encoding: string): ArrayBuffer {
  const uint = new Uint8Array(buffer);
  const enc = encoding.toLowerCase();
  let out: Buffer;
  if (enc.includes('br')) {
    out = brotliDecompressSync(Buffer.from(uint));
  } else if (enc.includes('gzip')) {
    out = gunzipSync(Buffer.from(uint));
  } else if (enc.includes('deflate')) {
    out = inflateSync(Buffer.from(uint));
  } else {
    return buffer;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

function isPlaylistUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\.m3u8($|[?#])/i.test(value) || value.includes('mpegurl');
}

function safeDecodeUriComponent(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
    const body = Buffer.from(await res.arrayBuffer());
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
    let decodedUrl = url;
    let urlObj: URL;
    try {
      urlObj = new URL(decodedUrl);
    } catch {
      decodedUrl = decodeURIComponent(url);
      urlObj = new URL(decodedUrl);
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    let fetchUrl = decodedUrl;
    const isValhalla = urlObj.hostname.includes('valhallastream');

    if (isValhalla) {
      const innerUrl = urlObj.searchParams.get('url');
      const headersParam = urlObj.searchParams.get('headers');
      const decodedInnerUrl = safeDecodeUriComponent(innerUrl);
      const shouldTreatAsPlaylist =
        isPlaylistUrl(fetchUrl) ||
        isPlaylistUrl(decodedInnerUrl);
      const forwardedRange = !shouldTreatAsPlaylist ? headers['Range'] : undefined;
      const valhallaOrigin = 'https://proxy.valhallastream.dpdns.org';
      const valhallaHeaders: Record<string, string> = {
        'Host': 'proxy.valhallastream.dpdns.org',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer': `${valhallaOrigin}/`,
        'Origin': valhallaOrigin,
      };
      if (forwardedRange) {
        valhallaHeaders['Range'] = forwardedRange;
      }
      Object.keys(headers).forEach((k) => delete headers[k]);
      Object.assign(headers, valhallaHeaders);

      let directHeaders: Record<string, string> | null = null;
      let directUrl: string | null = null;
      if (innerUrl && headersParam) {
        try {
          const parsed = JSON.parse(headersParam) as { Referer?: string; referer?: string; Origin?: string; origin?: string };
          directUrl = decodedInnerUrl;
          directHeaders = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',
          };
          if (forwardedRange) {
            directHeaders['Range'] = forwardedRange;
          }
          if (parsed?.Referer ?? parsed?.referer) directHeaders['Referer'] = (parsed.Referer ?? parsed.referer) ?? '';
          if (parsed?.Origin ?? parsed?.origin) directHeaders['Origin'] = (parsed.Origin ?? parsed.origin) ?? '';
        } catch {
          try {
            const parsed = JSON.parse(decodeURIComponent(headersParam)) as { Referer?: string; referer?: string; Origin?: string; origin?: string };
            directUrl = decodedInnerUrl;
            directHeaders = {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'identity',
            };
            if (forwardedRange) {
              directHeaders['Range'] = forwardedRange;
            }
            if (parsed?.Referer ?? parsed?.referer) directHeaders['Referer'] = (parsed.Referer ?? parsed.referer) ?? '';
            if (parsed?.Origin ?? parsed?.origin) directHeaders['Origin'] = (parsed.Origin ?? parsed.origin) ?? '';
          } catch {
            directUrl = null;
            directHeaders = null;
          }
        }
      }

      const retryOpts = {
        maxRetries: 2,
        initialDelay: 500,
        retryable: (error: unknown) => {
          if (error instanceof Error && error.message.includes('Server error: 4')) {
            const statusMatch = error.message.match(/Server error: (\d+)/);
            if (statusMatch && statusMatch[1] !== '429') return false;
          }
          return error instanceof Error && (
            error.message.includes('fetch') || error.message.includes('network') ||
            error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND') ||
            error.message.includes('Server error: 5') || error.message.includes('Server error: 429')
          );
        },
      };

      let response: Response;
      // Prefer direct CDN when we have inner URL + headers (more reliable for range requests)
      if (directUrl && directHeaders) {
        try {
          response = await fetchWithRetry(directUrl, { headers: directHeaders, redirect: 'follow' }, retryOpts);
          if (response.ok) fetchUrl = directUrl;
        } catch {
          response = await fetchWithRetry(fetchUrl, { headers, redirect: 'follow' }, retryOpts);
        }
      } else {
        response = await fetchWithRetry(fetchUrl, { headers, redirect: 'follow' }, retryOpts);
      }
      if (!response.ok && directUrl && directHeaders) {
        try {
          const fallback = await fetchWithRetry(fetchUrl, { headers, redirect: 'follow' }, retryOpts);
          if (fallback.ok) {
            response = fallback;
            fetchUrl = decodedUrl;
          }
        } catch {
          // keep response
        }
      }

      if (!response.ok) {
        logger.error('HLS proxy fetch failed:', {
          status: response.status,
          statusText: response.statusText,
          url: fetchUrl.substring(0, 200),
        });
        return new NextResponse(`Failed to fetch: ${response.statusText}`, {
          status: response.status,
        });
      }

      const contentType = response.headers.get('content-type') || '';
      // Pass through 206 for Valhalla segments (Next.js proxy is same-origin so 206 is fine; enables seeking)
      if (fetchUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8')) {
        const playlistText = await response.text();
        if (!playlistText.trim().startsWith('#EXTM3U') && !playlistText.includes('#EXT')) {
          logger.error('Invalid m3u8 response:', { url: fetchUrl.substring(0, 200), contentType });
          return NextResponse.json(
            { error: 'Invalid m3u8 file', message: 'The response does not appear to be a valid HLS playlist' },
            { status: 500 }
          );
        }
        const baseUrl = new URL(fetchUrl);
        const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
        const rewrittenPlaylist = playlistText
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            let segmentUrl = trimmed;
            if (!segmentUrl.startsWith('http://') && !segmentUrl.startsWith('https://')) {
              if (segmentUrl.startsWith('/')) segmentUrl = baseUrl.origin + segmentUrl;
              else segmentUrl = basePath + segmentUrl;
            }
            try {
              new URL(segmentUrl);
            } catch {
              return line;
            }
            return `/api/proxy-hls?url=${encodeURIComponent(segmentUrl)}`;
          })
          .join('\n');
        const playlistStatus = response.status === 206 ? 200 : response.status;
        return new NextResponse(rewrittenPlaylist, {
          status: playlistStatus,
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
      const isMp4 = fetchUrl.includes('.mp4') || contentType.includes('mp4');
      const responseContentType = contentType || (isMp4 ? 'video/mp4' : 'video/mp2t');
      const contentEncoding = response.headers.get('content-encoding');
      let body: ArrayBuffer;
          
      if (contentEncoding && /gzip|deflate|br/i.test(contentEncoding)) {
        const raw = await response.arrayBuffer();
        body = decompressBody(raw, contentEncoding);
      } else {
        body = await response.arrayBuffer();
      }
      const passThroughHeaders: Record<string, string> = {
        'Content-Type': responseContentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'public, max-age=86400',
      };
      // Pass Content-Range and Accept-Ranges so the video element can seek (range requests)
      if (response.headers.get('content-range')) {
        passThroughHeaders['Content-Range'] = response.headers.get('content-range')!;
      }
      if (response.headers.get('accept-ranges')) {
        passThroughHeaders['Accept-Ranges'] = response.headers.get('accept-ranges')!;
      }
      return new NextResponse(body, {
        status: response.status,
        headers: passThroughHeaders,
      });
    }

    const retryOpts = {
      maxRetries: 2,
      initialDelay: 500,
      retryable: (error: unknown) => {
        if (error instanceof Error && error.message.includes('Server error: 4')) {
          const statusMatch = error.message.match(/Server error: (\d+)/);
          if (statusMatch && statusMatch[1] !== '429') return false;
        }
        return error instanceof Error && (
          error.message.includes('fetch') || error.message.includes('network') ||
          error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND') ||
          error.message.includes('Server error: 5') || error.message.includes('Server error: 429')
        );
      },
    };

    let response = await fetchWithRetry(fetchUrl, { headers, redirect: 'follow' }, retryOpts);

    if (!response.ok) {
      logger.error('HLS proxy fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        url: fetchUrl.substring(0, 200),
      });
      return new NextResponse(`Failed to fetch: ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get('content-type') || '';

    if (fetchUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8')) {
      const playlistText = await response.text();

      if (!playlistText.trim().startsWith('#EXTM3U') && !playlistText.includes('#EXT')) {
        logger.error('Invalid m3u8 response:', { url: fetchUrl.substring(0, 200), contentType });
        return NextResponse.json(
          { error: 'Invalid m3u8 file', message: 'The response does not appear to be a valid HLS playlist' },
          { status: 500 }
        );
      }

      const baseUrl = new URL(fetchUrl);
      const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);

      const rewrittenPlaylist = playlistText
        .split('\n')
        .map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
          let segmentUrl = trimmed;
          if (!segmentUrl.startsWith('http://') && !segmentUrl.startsWith('https://')) {
            if (segmentUrl.startsWith('/')) {
              segmentUrl = baseUrl.origin + segmentUrl;
            } else {
              segmentUrl = basePath + segmentUrl;
            }
          }
          try {
            new URL(segmentUrl);
          } catch {
            return line;
          }
          return `/api/proxy-hls?url=${encodeURIComponent(segmentUrl)}`;
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

    const passThroughHeaders: Record<string, string> = {
      'Content-Type': contentType || 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      ...(response.headers.get('content-range') ? { 'Content-Range': response.headers.get('content-range')! } : {}),
      ...(response.headers.get('accept-ranges') ? { 'Accept-Ranges': response.headers.get('accept-ranges')! } : {}),
      ...(response.headers.get('content-length') ? { 'Content-Length': response.headers.get('content-length')! } : {}),
      'Cache-Control': 'public, max-age=86400',
    };
    const body = response.body ?? (await response.arrayBuffer());
    return new NextResponse(body, {
      status: response.status,
      headers: passThroughHeaders,
    });
  } catch (error) {
    logger.error('Error proxying HLS:', error);
    return NextResponse.json(
      { error: 'Failed to proxy HLS', details: error instanceof Error ? error.message : 'Unknown error' },
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
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}
