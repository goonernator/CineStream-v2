import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { fetchWithRetry } from '@/lib/retry';

// Key array extracted from rivestream JS
const KEY_ARRAY = [
  "4Z7lUo","gwIVSMD","PLmz2elE2v","Z4OFV0","SZ6RZq6Zc","zhJEFYxrz8","FOm7b0","axHS3q4KDq",
  "o9zuXQ","4Aebt","wgjjWwKKx","rY4VIxqSN","kfjbnSo","2DyrFA1M","YUixDM9B","JQvgEj0",
  "mcuFx6JIek","eoTKe26gL","qaI9EVO1rB","0xl33btZL","1fszuAU","a7jnHzst6P","wQuJkX",
  "cBNhTJlEOf","KNcFWhDvgT","XipDGjST","PCZJlbHoyt","2AYnMZkqd","HIpJh","KH0C3iztrG",
  "W81hjts92","rJhAT","NON7LKoMQ","NMdY3nsKzI","t4En5v","Qq5cOQ9H","Y9nwrp","VX5FYVfsf",
  "cE5SJG","x1vj1","HegbLe","zJ3nmt4OA","gt7rxW57dq","clIE9b","jyJ9g","B5jTwI1f",
  "qgiK0E","cx9wQ","5F9bGa","7UjkKrp","Yvhrj","wYXez5Dg3","pG4GMU","MwMAu","rFRD5wlM"
];

// Hash function 1 - applied to the result of hash2
function hash1(input: string): string {
  const t = String(input);
  let n = (3735928559 ^ t.length) >>> 0; // 0xDEADBEEF ^ length
  
  for (let e = 0; e < t.length; e++) {
    let r = t.charCodeAt(e);
    r = (r ^ ((131 * e + 89 ^ r << e % 5) & 255)) >>> 0;
    n = ((n << 7 | n >>> 25) >>> 0 ^ r) >>> 0;
    const i = ((65535 & n) * 60205) >>> 0;
    const o = (((n >>> 16) * 60205) << 16) >>> 0;
    n = (i + o) >>> 0;
    n = (n ^ (n >>> 11)) >>> 0;
  }
  
  n = (n ^ (n >>> 15)) >>> 0;
  n = (((65535 & n) * 49842) + (((n >>> 16) * 49842 << 16) >>> 0)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = (((65535 & n) * 40503) + (((n >>> 16) * 40503 << 16) >>> 0)) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  n = (((65535 & n) * 10196) + (((n >>> 16) * 10196 << 16) >>> 0)) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  
  return n.toString(16).padStart(8, "0");
}

// Hash function 2 - applied to the combined string
function hash2(input: string): string {
  const e = String(input);
  let t = 0;
  
  for (let n = 0; n < e.length; n++) {
    const r = e.charCodeAt(n);
    t = (r + (t << 6) + (t << 16) - t) >>> 0;
    const i = ((t << n % 5) | (t >>> (32 - n % 5))) >>> 0;
    t = (t ^ (i ^ ((r << n % 7) | (r >>> (8 - n % 7))))) >>> 0;
    t = (t + ((t >>> 11) ^ (t << 3))) >>> 0;
  }
  
  t = (t ^ (t >>> 15)) >>> 0;
  t = (((65535 & t) * 49842) + ((((t >>> 16) * 49842) & 65535) << 16)) >>> 0;
  t = (t ^ (t >>> 13)) >>> 0;
  t = (((65535 & t) * 40503) + ((((t >>> 16) * 40503) & 65535) << 16)) >>> 0;
  t = (t ^ (t >>> 16)) >>> 0;
  
  return t.toString(16).padStart(8, "0");
}

// Generate secret key for rivestream API
function generateSecretKey(input: string | undefined): string {
  if (input === undefined || input === null) {
    return "rive";
  }
  
  try {
    let t: string;
    let n: number;
    const r = String(input);
    
    if (isNaN(Number(input))) {
      // Non-numeric input (strings)
      const e = r.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      t = KEY_ARRAY[e % KEY_ARRAY.length] || Buffer.from(r).toString('base64');
      n = Math.floor(e % r.length / 2);
    } else {
      // Numeric input (TMDB IDs)
      const i = Number(input);
      t = KEY_ARRAY[i % KEY_ARRAY.length] || Buffer.from(r).toString('base64');
      n = Math.floor(i % r.length / 2);
    }
    
    // Combine: insert t in the middle of r
    const combined = r.slice(0, n) + t + r.slice(n);
    
    // Apply both hash functions: hash1(hash2(combined))
    const h2 = hash2(combined);
    const h1 = hash1(h2);
    
    // Return base64 encoded
    return Buffer.from(h1).toString('base64');
  } catch {
    return "topSecret";
  }
}

interface FlowcastStream {
  url: string;
  quality: string;
  source: string;
  format: string;
}

interface FlowcastCaption {
  label: string;
  url: string;
  language: string;
}

interface RivestreamResponse {
  success: boolean;
  streams: FlowcastStream[];
  captions: FlowcastCaption[];
  error?: string;
}

interface ScrapperProviderResponse {
  data: {
    sources?: Array<{
      url: string;
      quality: string;
      source: string;
      format: string;
    }>;
    captions?: Array<{
      label: string;
      file: string;
    }>;
  } | null;
}

const SCRAPPER_URL = 'https://scrapper.rivestream.org';

export async function GET(request: NextRequest): Promise<NextResponse<RivestreamResponse>> {
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
    // Generate secret key using the TMDB ID
    const secretKey = generateSecretKey(tmdbId);
    
    // Build the provider URL
    // Movies: /api/provider?provider=flowcast&id={TMDB_ID}
    // TV: /api/provider?provider=flowcast&id={TMDB_ID}&season={S}&episode={E}
    let providerUrl: string;
    
    if (type === 'movie') {
      providerUrl = `${SCRAPPER_URL}/api/provider?provider=flowcast&id=${tmdbId}&secretKey=${encodeURIComponent(secretKey)}&proxyMode=`;
    } else if (type === 'tv') {
      if (!season || !episode) {
        return NextResponse.json(
          { success: false, streams: [], captions: [], error: 'Missing season or episode for TV show' },
          { status: 400 }
        );
      }
      providerUrl = `${SCRAPPER_URL}/api/provider?provider=flowcast&id=${tmdbId}&season=${season}&episode=${episode}&secretKey=${encodeURIComponent(secretKey)}&proxyMode=`;
    } else {
      return NextResponse.json(
        { success: false, streams: [], captions: [], error: 'Invalid type parameter' },
        { status: 400 }
      );
    }

    // Fetch from rivestream scrapper with retry
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response: Response;
    try {
      response = await fetchWithRetry(
        providerUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Origin': 'https://rivestream.org',
            'Referer': 'https://rivestream.org/',
          },
          signal: controller.signal,
        },
        {
          maxRetries: 2,
          initialDelay: 1000,
          retryable: (error) => {
            // Don't retry on timeout, abort, or 4xx errors (except 429)
            if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
              return false;
            }
            // Retry on network errors and 5xx errors
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
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { success: false, streams: [], captions: [], error: 'Request timeout' },
          { status: 504 }
        );
      }
      throw error;
    }

    if (!response.ok) {
      return NextResponse.json(
        { success: false, streams: [], captions: [], error: `Failed to fetch: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data: ScrapperProviderResponse = await response.json();
    
    // Extract Flowcast streams
    const flowcastStreams: FlowcastStream[] = [];
    
    if (data.data?.sources && data.data.sources.length > 0) {
      for (const source of data.data.sources) {
        // Only include sources with valhallastream proxy URLs (Flowcast)
        if (source.url && source.url.includes('valhallastream')) {
          flowcastStreams.push({
            url: source.url,
            quality: source.quality || 'Auto',
            source: source.source || 'Flowcast',
            format: source.format || 'mp4',
          });
        }
      }
    }

    // Extract captions/subtitles
    const flowcastCaptions: FlowcastCaption[] = [];
    
    if (data.data?.captions && data.data.captions.length > 0) {
      for (const caption of data.data.captions) {
        if (caption.file && caption.label) {
          // Parse label to extract language (e.g., "English - FlowCast" → "English")
          const language = caption.label.replace(' - FlowCast', '').trim();
          
          flowcastCaptions.push({
            label: caption.label,
            url: caption.file,
            language: language,
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: flowcastStreams.length > 0,
        streams: flowcastStreams,
        captions: flowcastCaptions,
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
    logger.error('Error fetching rivestream:', error);
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
