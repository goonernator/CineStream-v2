import { fetchWithRetry } from './retry';
import { logger } from './logger';

export type StreamType = 'direct' | 'iframe';

export type StreamProvider = 'sanction' | 'flowcast' | 'hindicast' | 'vidlink';

export interface StreamSource {
  url: string;
  type: StreamType;
  provider: StreamProvider;
  quality?: string;
}

export interface StreamCaption {
  label: string;
  url: string;
  language: string;
  provider: StreamProvider;
}

export interface StreamResult {
  sources: StreamSource[];
  captions: StreamCaption[];
}

export interface StreamFetchOptions {
  // Skip Vidlink for lightweight checks (e.g. episode availability on details pages).
  // Vidlink can remain enabled for actual playback on the watch page.
  skipVidlink?: boolean;
}

export interface StreamAPIResponse {
  success?: boolean;
  provider?: string;
  source?: string;
  quality?: number;
  type?: string;
  sources?: Array<{
    file: string;
    quality?: number;
    type?: string;
  }>;
  headers?: {
    [key: string]: string;
  };
  streams?: {
    [provider: string]: {
      embed_url?: string;
      streams?: Array<{
        url: string;
        label?: string;
        type?: string;
        resolution?: string;
        bandwidth?: string;
      }>;
      quality_options?: Array<{
        url: string;
        resolution?: string;
        bandwidth?: string;
      }>;
    };
  };
  tmdb_info?: any;
  [key: string]: any;
}

function getRiveProvider(sourceLabel?: string, providerHint?: string): StreamProvider {
  const hint = (providerHint || '').toLowerCase();
  if (hint.includes('hindicast')) return 'hindicast';
  const label = (sourceLabel || '').toLowerCase();
  return label.includes('hindicast') ? 'hindicast' : 'flowcast';
}

function getRivePlayableUrl(url: string): string {
  if (!url) return url;
  if (!(url.startsWith('http://') || url.startsWith('https://'))) return url;
  const isValhalla = url.includes('valhallastream');

  const isElectron = typeof window !== 'undefined' && (window as any).electron;
  // Route Rivestream/Valhalla through Next.js API even in Electron.
  // Electron's custom protocol path has stricter header behavior and is harder to debug.
  if (isValhalla) {
    return `/api/proxy-hls?url=${encodeURIComponent(url)}`;
  }
  return isElectron
    ? `proxy-hls:?url=${encodeURIComponent(url)}`
    : `/api/proxy-hls?url=${encodeURIComponent(url)}`;
}

export const streaming = {
  // Helper to fetch with timeout and retry
  async fetchWithTimeout(url: string, timeoutMs: number = 60000): Promise<Response> { // 60 seconds default
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetchWithRetry(
        url,
        { signal: controller.signal },
        {
          maxRetries: 2,
          initialDelay: 1000,
          retryable: (error) => {
            // Don't retry on timeout or abort
            if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
              return false;
            }
            // Retry on network errors
            return error instanceof Error && (
              error.message.includes('fetch') ||
              error.message.includes('network') ||
              error.message.includes('ECONNREFUSED') ||
              error.message.includes('ENOTFOUND')
            );
          },
        }
      );
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - the streaming API took too long to respond');
      }
      throw error;
    }
  },

  // Fetch movie stream data from tlo.sh v3 API
  async getMovieStreamData(TMDB_ID: number): Promise<StreamAPIResponse | null> {
    const response = await this.fetchWithTimeout(`/api/proxy-stream?type=movie&tmdbId=${TMDB_ID}`, 60000); // 60 seconds
    if (!response.ok) {
      // 404 is expected when no stream is available - return null instead of throwing
      if (response.status === 404) {
        return null;
      }
      // 503 means API is not configured
      if (response.status === 503) {
        logger.warn('tlo.sh v3 API not configured - check TLO_V3_BASE_URL environment variable');
        return null;
      }
      throw new Error(`Failed to fetch movie stream: ${response.statusText}`);
    }
    return response.json();
  },

  // Fetch TV show stream data from tlo.sh v3 API
  async getTVStreamData(TMDB_ID: number, SEASON: number, EPISODE: number): Promise<StreamAPIResponse | null> {
    try {
      const response = await this.fetchWithTimeout(`/api/proxy-stream?type=tv&tmdbId=${TMDB_ID}&season=${SEASON}&episode=${EPISODE}`, 60000); // 60 seconds
      if (!response.ok) {
        // 404 is expected when no stream is available - return null instead of throwing
        if (response.status === 404) {
          return null;
        }
        // 503 means API is not configured
        if (response.status === 503) {
          logger.warn('tlo.sh v3 API not configured - check TLO_V3_BASE_URL environment variable');
          return null;
        }
        const errorText = await response.text();
        logger.warn('tlo.sh v3 TV API error:', response.status, errorText);
        throw new Error(`Failed to fetch TV stream: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
      } catch (error) {
        throw error;
      }
  },

  // Fetch movie stream data from Rivestream (Flowcast)
  async getRivestreamMovieData(TMDB_ID: number): Promise<{ sources: StreamSource[]; captions: StreamCaption[] }> {
    try {
      const response = await this.fetchWithTimeout(`/api/parse-rive-stream?type=movie&tmdbId=${TMDB_ID}`, 30000); // 30 seconds
      if (!response.ok) {
        logger.warn('Rivestream fetch failed:', response.statusText);
        return { sources: [], captions: [] };
      }
      const data = await response.json();
      
      // Convert Rivestream response to StreamSource format
      const sources: StreamSource[] = [];
      if (data.success && data.streams && data.streams.length > 0) {
        for (const stream of data.streams) {
          sources.push({
            url: getRivePlayableUrl(stream.url),
            type: 'direct' as StreamType,
            provider: getRiveProvider(stream.source, (stream as any).provider),
            quality: stream.quality || 'Auto',
          });
        }
      }
      
      // Convert captions - proxy through our API to avoid CORS
      const captions: StreamCaption[] = [];
      if (data.captions && data.captions.length > 0) {
        for (const caption of data.captions) {
          // Proxy subtitle URL to avoid CORS issues
          const proxiedUrl = `/api/proxy-subtitle?url=${encodeURIComponent(caption.url)}`;
          captions.push({
            label: caption.label,
            url: proxiedUrl,
            language: caption.language,
            provider: 'flowcast' as StreamProvider,
          });
        }
      }
      
      return { sources, captions };
    } catch (error) {
      logger.warn('Error fetching Rivestream movie data:', error);
      return { sources: [], captions: [] };
    }
  },

  // Fetch TV show stream data from Rivestream (Flowcast)
  async getRivestreamTVData(TMDB_ID: number, SEASON: number, EPISODE: number): Promise<{ sources: StreamSource[]; captions: StreamCaption[] }> {
    try {
      const response = await this.fetchWithTimeout(`/api/parse-rive-stream?type=tv&tmdbId=${TMDB_ID}&season=${SEASON}&episode=${EPISODE}`, 30000); // 30 seconds
      if (!response.ok) {
        logger.warn('Rivestream TV fetch failed:', response.statusText);
        return { sources: [], captions: [] };
      }
      const data = await response.json();
      
      // Convert Rivestream response to StreamSource format
      const sources: StreamSource[] = [];
      if (data.success && data.streams && data.streams.length > 0) {
        for (const stream of data.streams) {
          sources.push({
            url: getRivePlayableUrl(stream.url),
            type: 'direct' as StreamType,
            provider: getRiveProvider(stream.source, (stream as any).provider),
            quality: stream.quality || 'Auto',
          });
        }
      }
      
      // Convert captions - proxy through our API to avoid CORS
      const captions: StreamCaption[] = [];
      if (data.captions && data.captions.length > 0) {
        for (const caption of data.captions) {
          // Proxy subtitle URL to avoid CORS issues
          const proxiedUrl = `/api/proxy-subtitle?url=${encodeURIComponent(caption.url)}`;
          captions.push({
            label: caption.label,
            url: proxiedUrl,
            language: caption.language,
            provider: 'flowcast' as StreamProvider,
          });
        }
      }
      
      return { sources, captions };
    } catch (error) {
      logger.warn('Error fetching Rivestream TV data:', error);
      return { sources: [], captions: [] };
    }
  },

  // Fetch movie stream data from Vidlink
  async getVidlinkMovieData(TMDB_ID: number): Promise<{ sources: StreamSource[]; captions: StreamCaption[] }> {
    try {
      const response = await this.fetchWithTimeout(`/api/parse-vidlink?type=movie&tmdbId=${TMDB_ID}`, 60000); // 60 seconds (Puppeteer can be slow)
      if (!response.ok) {
        logger.warn('Vidlink fetch failed:', response.statusText);
        return { sources: [], captions: [] };
      }
      const data = await response.json();
      
      // Convert Vidlink response to StreamSource format
      const sources: StreamSource[] = [];
      if (data.success && data.streams && data.streams.length > 0) {
        for (const stream of data.streams) {
          // Use the .m3u8 URL exactly as extracted - don't modify it
          // Pass cookies separately through proxy URL params
          try {
            // Build proxy URL with stream URL and optional cookies
            let proxyUrl = `/api/proxy-hls?url=${encodeURIComponent(stream.url)}`;
            if ((stream as any).cookies) {
              proxyUrl += `&cookies=${encodeURIComponent((stream as any).cookies)}`;
            }
            
            sources.push({
              url: proxyUrl,
              type: 'direct' as StreamType,
              provider: 'vidlink' as StreamProvider,
              quality: stream.quality || 'Auto',
            });
          } catch (error) {
            logger.warn('Error processing vidlink stream URL:', error);
            // Fallback: just use the stream URL as-is
            const proxyUrl = `/api/proxy-hls?url=${encodeURIComponent(stream.url)}`;
            
            sources.push({
              url: proxyUrl,
              type: 'direct' as StreamType,
              provider: 'vidlink' as StreamProvider,
              quality: stream.quality || 'Auto',
            });
          }
        }
      }
      
      return { sources, captions: [] };
    } catch (error) {
      logger.warn('Error fetching Vidlink movie data:', error);
      return { sources: [], captions: [] };
    }
  },

  // Fetch TV show stream data from Vidlink
  async getVidlinkTVData(TMDB_ID: number, SEASON: number, EPISODE: number): Promise<{ sources: StreamSource[]; captions: StreamCaption[] }> {
    try {
      const response = await this.fetchWithTimeout(`/api/parse-vidlink?type=tv&tmdbId=${TMDB_ID}&season=${SEASON}&episode=${EPISODE}`, 60000); // 60 seconds
      if (!response.ok) {
        logger.warn('Vidlink TV fetch failed:', response.statusText);
        return { sources: [], captions: [] };
      }
      const data = await response.json();
      
      // Convert Vidlink response to StreamSource format
      const sources: StreamSource[] = [];
      if (data.success && data.streams && data.streams.length > 0) {
        for (const stream of data.streams) {
          // Use the .m3u8 URL exactly as extracted - don't modify it
          // Pass cookies separately through proxy URL params
          try {
            // Build proxy URL with stream URL and optional cookies
            let proxyUrl = `/api/proxy-hls?url=${encodeURIComponent(stream.url)}`;
            if ((stream as any).cookies) {
              proxyUrl += `&cookies=${encodeURIComponent((stream as any).cookies)}`;
            }
            
            sources.push({
              url: proxyUrl,
              type: 'direct' as StreamType,
              provider: 'vidlink' as StreamProvider,
              quality: stream.quality || 'Auto',
            });
          } catch (error) {
            logger.warn('Error processing vidlink stream URL:', error);
            // Fallback: just use the stream URL as-is
            const proxyUrl = `/api/proxy-hls?url=${encodeURIComponent(stream.url)}`;
            
            sources.push({
              url: proxyUrl,
              type: 'direct' as StreamType,
              provider: 'vidlink' as StreamProvider,
              quality: stream.quality || 'Auto',
            });
          }
        }
      }
      
      return { sources, captions: [] };
    } catch (error) {
      logger.warn('Error fetching Vidlink TV data:', error);
      return { sources: [], captions: [] };
    }
  },

  // Parse stream data and return sources
  parseStreamSources(streamData: StreamAPIResponse): StreamSource[] {
    const sources: StreamSource[] = [];

    // tlo.sh v3 API format: { success: true, source: "...", sources: [{ file: "...", quality: 720, type: "hls" }, ...] }
    if (streamData.success && Array.isArray(streamData.sources)) {
      // Handle new format with direct sources array
      const allSources = [];
      
      // Add the main source if it exists (exclude 1080p as most are actually 720p)
      if (streamData.source && streamData.quality !== 1080) {
        allSources.push({
          url: streamData.source,
          quality: streamData.quality || 720,
          type: streamData.type || 'hls',
        });
      }
      
      // Add all sources from the sources array (exclude 1080p as most are actually 720p)
      for (const source of streamData.sources) {
        if (source.file && source.quality !== 1080) {
          allSources.push({
            url: source.file,
            quality: source.quality || 720,
            type: source.type || 'hls',
          });
        }
      }
      
      // Remove duplicates based on URL
      const uniqueSources = allSources.filter((source, index, self) =>
        index === self.findIndex((s) => s.url === source.url)
      );
      
      // Sort by quality (highest first)
      uniqueSources.sort((a, b) => (b.quality || 0) - (a.quality || 0));
      
      // Add all quality options (proxied through Electron protocol to bypass CORS)
      for (const stream of uniqueSources) {
        if (stream.url) {
          // Use Electron protocol in Electron, Next.js API in browser
          const isElectron = typeof window !== 'undefined' && (window as any).electron;
          const proxyUrl = isElectron 
            ? `proxy-hls:?url=${encodeURIComponent(stream.url)}`
            : `/api/proxy-hls?url=${encodeURIComponent(stream.url)}`;
          
          sources.push({
            url: proxyUrl,
            type: 'direct',
            provider: 'sanction',
            quality: stream.quality ? `${stream.quality}p` : 'Unknown',
          });
        }
      }
    }
    // Legacy tlo.sh API format: { streams: { "provider-name": { streams: [...] } } }
    else if (streamData.streams && typeof streamData.streams === 'object' && !Array.isArray(streamData.streams)) {
      // Iterate through each provider (e.g., "vidsrc-embed.ru")
      for (const [providerName, providerData] of Object.entries(streamData.streams)) {
        if (providerData && typeof providerData === 'object') {
          // Get quality streams - ONLY use quality streams, NO embed URLs
          const qualityStreams = (providerData.streams as Array<{ url?: string; type?: string; bandwidth?: string; resolution?: string; label?: string }> | undefined)?.filter((s) => s.type === 'quality') || [];
          const options = (providerData.quality_options as Array<{ url?: string; bandwidth?: string; resolution?: string }> | undefined) || [];
          
          // Combine all available quality streams
          const allQualityStreams = [
            ...qualityStreams.map((s) => ({
              url: s.url,
              bandwidth: parseInt(s.bandwidth || '0'),
              resolution: s.resolution,
              label: s.label,
            })),
            ...options.map((o) => ({
              url: o.url,
              bandwidth: parseInt(o.bandwidth || '0'),
              resolution: o.resolution,
              label: o.resolution,
            })),
          ];
          
          if (allQualityStreams.length > 0) {
            // Sort by bandwidth (highest first)
            allQualityStreams.sort((a, b) => b.bandwidth - a.bandwidth);
            
            // Add all quality options (proxied through Electron protocol to bypass CORS)
            for (const stream of allQualityStreams) {
              if (stream.url) {
                // Use Electron protocol in Electron, Next.js API in browser
                const isElectron = typeof window !== 'undefined' && (window as any).electron;
                const proxyUrl = isElectron 
                  ? `proxy-hls:?url=${encodeURIComponent(stream.url)}`
                  : `/api/proxy-hls?url=${encodeURIComponent(stream.url)}`;
                
                sources.push({
                  url: proxyUrl,
                  type: 'direct',
                  provider: 'sanction',
                  quality: stream.label || stream.resolution || 'Unknown',
                });
              }
            }
          }
        }
        
        // If we found streams from first provider, use those
        if (sources.length > 0) break;
      }
    }

    return sources;
  },

  // Get all available stream sources for a movie (async)
  // Fetches from tlo.sh, Rivestream (Flowcast), and Vidlink in parallel
  async getMovieStreamSourcesAsync(TMDB_ID: number, options: StreamFetchOptions = {}): Promise<StreamResult> {
    try {
      const skipVidlinkInDev = process.env.NODE_ENV === 'development';
      const shouldSkipVidlink = skipVidlinkInDev || !!options.skipVidlink;
      // Fetch from all sources in parallel
      const [tloResult, rivestreamResult, vidlinkResult] = await Promise.allSettled([
        this.getMovieStreamData(TMDB_ID).then(data => data ? this.parseStreamSources(data) : []),
        this.getRivestreamMovieData(TMDB_ID),
        shouldSkipVidlink ? Promise.resolve({ sources: [], captions: [] }) : this.getVidlinkMovieData(TMDB_ID),
      ]);

      const tloSources = tloResult.status === 'fulfilled' ? tloResult.value : [];
      const rivestreamData = rivestreamResult.status === 'fulfilled' ? rivestreamResult.value : { sources: [], captions: [] };
      const vidlinkData = vidlinkResult.status === 'fulfilled' ? vidlinkResult.value : { sources: [], captions: [] };

      // Only log unexpected errors (not 404s which are expected)
      if (tloResult.status === 'rejected') {
        const error = tloResult.reason;
        // Don't log 404 errors as they're expected when no stream is available
        if (error instanceof Error && !error.message.includes('Not Found')) {
                logger.warn('tlo.sh movie fetch failed:', error.message);
        }
      }
      if (rivestreamResult.status === 'rejected') {
        const error = rivestreamResult.reason;
        // Don't log 404 errors as they're expected when no stream is available
        if (error instanceof Error && !error.message.includes('Not Found')) {
                logger.warn('Rivestream movie fetch failed:', error.message);
        }
      }
      if (vidlinkResult.status === 'rejected') {
        const error = vidlinkResult.reason;
        // Don't log 404 errors as they're expected when no stream is available
        if (error instanceof Error && !error.message.includes('Not Found')) {
                logger.warn('Vidlink movie fetch failed:', error.message);
        }
      }

      // Combine sources: Flowcast (rivestream) first as priority, then Vidlink, then tlo.sh as fallback
      const allSources = [...rivestreamData.sources, ...vidlinkData.sources, ...tloSources];
      
      logger.debug(`Movie sources: ${rivestreamData.sources.length} Flowcast, ${vidlinkData.sources.length} Vidlink, ${tloSources.length} tlo.sh, ${rivestreamData.captions.length} captions`);
      
      return { sources: allSources, captions: rivestreamData.captions };
          } catch (error) {
            logger.error('Error fetching movie streams:', error);
            return { sources: [], captions: [] };
          }
  },

  // Get all available stream sources for a TV show (async)
  // Fetches from tlo.sh, Rivestream (Flowcast), and Vidlink in parallel
  async getTVStreamSourcesAsync(TMDB_ID: number, SEASON: number, EPISODE: number, options: StreamFetchOptions = {}): Promise<StreamResult> {
    try {
      const skipVidlinkInDev = process.env.NODE_ENV === 'development';
      const shouldSkipVidlink = skipVidlinkInDev || !!options.skipVidlink;
      // Fetch from all sources in parallel
      const [tloResult, rivestreamResult, vidlinkResult] = await Promise.allSettled([
        this.getTVStreamData(TMDB_ID, SEASON, EPISODE).then(data => data ? this.parseStreamSources(data) : []),
        this.getRivestreamTVData(TMDB_ID, SEASON, EPISODE),
        shouldSkipVidlink ? Promise.resolve({ sources: [], captions: [] }) : this.getVidlinkTVData(TMDB_ID, SEASON, EPISODE),
      ]);

      const tloSources = tloResult.status === 'fulfilled' ? tloResult.value : [];
      const rivestreamData = rivestreamResult.status === 'fulfilled' ? rivestreamResult.value : { sources: [], captions: [] };
      const vidlinkData = vidlinkResult.status === 'fulfilled' ? vidlinkResult.value : { sources: [], captions: [] };

      // Only log unexpected errors (not 404s which are expected)
      if (tloResult.status === 'rejected') {
        const error = tloResult.reason;
        // Don't log 404 errors as they're expected when no stream is available
        if (error instanceof Error && !error.message.includes('Not Found')) {
          logger.warn('tlo.sh TV fetch failed:', error.message);
        }
      }
      if (rivestreamResult.status === 'rejected') {
        const error = rivestreamResult.reason;
        // Don't log 404 errors as they're expected when no stream is available
        if (error instanceof Error && !error.message.includes('Not Found')) {
                logger.warn('Rivestream TV fetch failed:', error.message);
        }
      }
      if (vidlinkResult.status === 'rejected') {
        const error = vidlinkResult.reason;
        // Don't log 404 errors as they're expected when no stream is available
        if (error instanceof Error && !error.message.includes('Not Found')) {
                logger.warn('Vidlink TV fetch failed:', error.message);
        }
      }

      // Combine sources: Flowcast (rivestream) first as priority, then Vidlink, then tlo.sh as fallback
      const allSources = [...rivestreamData.sources, ...vidlinkData.sources, ...tloSources];
      
            logger.debug(`TV sources: ${rivestreamData.sources.length} Flowcast, ${vidlinkData.sources.length} Vidlink, ${tloSources.length} tlo.sh, ${rivestreamData.captions.length} captions`);
      
      return { sources: allSources, captions: rivestreamData.captions };
          } catch (error) {
            logger.error('Error fetching TV streams:', error);
            return { sources: [], captions: [] };
          }
  },
};
