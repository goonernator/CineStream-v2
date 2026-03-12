import { fetchWithRetry } from './retry';
import { logger } from './logger';
import { appSettings } from './appSettings';

export type StreamType = 'direct' | 'iframe';

export type StreamProvider = 'sanction' | 'flowcast' | 'hindicast' | 'guru' | 'vidlink';

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
        quality?: number;
      }>;
      quality_options?: Array<{
        url: string;
        resolution?: string;
        bandwidth?: string;
      }>;
      subtitles?: Array<{ format?: string; label: string; url: string }>;
    };
  };
  episode_info?: { episode_number?: number; name?: string; overview?: string; season_number?: number; still_path?: string };
  tmdb_info?: any;
  [key: string]: any;
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
    const baseUrl = appSettings.getTloV3BaseUrl();
    const params = new URLSearchParams({ type: 'movie', tmdbId: String(TMDB_ID) });
    if (baseUrl) params.set('baseUrl', baseUrl);
    const response = await this.fetchWithTimeout(`/api/proxy-stream?${params.toString()}`, 60000); // 60 seconds
    if (!response.ok) {
      // 404 is expected when no stream is available - return null instead of throwing
      if (response.status === 404) {
        return null;
      }
      // 503 means API is not configured
      if (response.status === 503) {
        logger.warn('Streaming API not configured - set TLO V3 Base URL in Settings');
        return null;
      }
      throw new Error(`Failed to fetch movie stream: ${response.statusText}`);
    }
    return response.json();
  },

  // Fetch TV show stream data from tlo.sh v3 API
  async getTVStreamData(TMDB_ID: number, SEASON: number, EPISODE: number): Promise<StreamAPIResponse | null> {
    try {
      const baseUrl = appSettings.getTloV3BaseUrl();
      const params = new URLSearchParams({ type: 'tv', tmdbId: String(TMDB_ID), season: String(SEASON), episode: String(EPISODE) });
      if (baseUrl) params.set('baseUrl', baseUrl);
      const response = await this.fetchWithTimeout(`/api/proxy-stream?${params.toString()}`, 60000); // 60 seconds
      if (!response.ok) {
        // 404 is expected when no stream is available - return null instead of throwing
        if (response.status === 404) {
          return null;
        }
        // 503 means API is not configured
        if (response.status === 503) {
          logger.warn('Streaming API not configured - set TLO V3 Base URL in Settings');
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

  // Map API provider name to StreamProvider
  mapProvider(providerName: string): StreamProvider {
    const name = (providerName || '').toLowerCase();
    if (name.includes('flowcast')) return 'flowcast';
    if (name.includes('hindicast')) return 'hindicast';
    if (name.includes('sanction')) return 'sanction';
    if (name.includes('guru')) return 'guru';
    if (name.includes('vidlink')) return 'vidlink';
    return 'sanction';
  },

  // Parse stream data and return sources (v3 and v4 API formats)
  parseStreamSources(streamData: StreamAPIResponse): StreamSource[] {
    const sources: StreamSource[] = [];
    const addProxied = (url: string, quality: string, provider: StreamProvider) => {
      if (!url) return;
      // Use Next.js proxy in both browser and Electron so streams are same-origin (avoids custom-protocol/206 issues in Electron)
      const proxyUrl = `/api/proxy-hls?url=${encodeURIComponent(url)}`;
      sources.push({ url: proxyUrl, type: 'direct', provider, quality });
    };

    // tlo.sh v3 API format: { success: true, source: "...", sources: [{ file: "...", quality: 720, type: "hls" }, ...] }
    if (streamData.success && Array.isArray(streamData.sources)) {
      const allSources: { url: string; quality: number }[] = [];
      if (streamData.source && streamData.quality !== 1080) {
        allSources.push({ url: streamData.source, quality: streamData.quality || 720 });
      }
      for (const source of streamData.sources) {
        if (source.file && source.quality !== 1080) {
          allSources.push({ url: source.file, quality: source.quality || 720 });
        }
      }
      const unique = allSources.filter((s, i, self) => self.findIndex((x) => x.url === s.url) === i);
      unique.sort((a, b) => b.quality - a.quality);
      for (const s of unique) {
        addProxied(s.url, `${s.quality}p`, 'sanction');
      }
      return sources;
    }

    // tlo.sh v4 (and legacy) format: { streams: { "Provider": { streams: [...], quality_options: [...] } } }
    if (streamData.streams && typeof streamData.streams === 'object' && !Array.isArray(streamData.streams)) {
      const seenUrls = new Set<string>();
      for (const [providerName, providerData] of Object.entries(streamData.streams)) {
        if (!providerData || typeof providerData !== 'object') continue;
        const provider = this.mapProvider(providerName);
        const rawStreams = providerData.streams as Array<{ url?: string; type?: string; quality?: number; bandwidth?: string; resolution?: string; label?: string }> | undefined;
        const options = (providerData.quality_options as Array<{ url?: string; bandwidth?: string; resolution?: string }> | undefined) || [];

        // v4 Flowcast/Hindicast: streams[] with { quality, url }
        const v4Streams = (rawStreams || [])
          .filter((s) => s.url && typeof (s as { quality?: number }).quality === 'number')
          .map((s) => ({
            url: s.url!,
            quality: (s as { quality: number }).quality,
            label: `${(s as { quality: number }).quality}p`,
          }));
        // Sanction-style: type === 'quality' or quality_options
        const qualityStreams = (rawStreams || []).filter((s) => s.url && s.type === 'quality').map((s) => ({
          url: s.url!,
          bandwidth: parseInt(s.bandwidth || '0'),
          resolution: s.resolution,
          label: s.label || s.resolution || 'Unknown',
        }));
        const optionStreams = options.map((o) => ({
          url: o.url!,
          bandwidth: parseInt(o.bandwidth || '0'),
          resolution: o.resolution,
          label: o.resolution || 'Unknown',
        }));

        const combined = [
          ...v4Streams.map((s) => ({ url: s.url, sortKey: s.quality, label: s.label })),
          ...qualityStreams.map((s) => ({ url: s.url, sortKey: s.bandwidth, label: s.label })),
          ...optionStreams.map((s) => ({ url: s.url, sortKey: s.bandwidth, label: s.label })),
        ].filter((s) => s.url && !seenUrls.has(s.url));

        for (const s of combined) {
          seenUrls.add(s.url);
        }
        combined.sort((a, b) => b.sortKey - a.sortKey);
        for (const s of combined) {
          addProxied(s.url, s.label, provider);
        }
      }
    }

    return sources;
  },

  // Parse captions from v4 (and legacy) stream response: streams[provider].subtitles
  parseStreamCaptions(streamData: StreamAPIResponse): StreamCaption[] {
    const captions: StreamCaption[] = [];
    const seen = new Set<string>();
    if (!streamData.streams || typeof streamData.streams !== 'object' || Array.isArray(streamData.streams)) {
      return captions;
    }
    for (const [providerName, providerData] of Object.entries(streamData.streams)) {
      const subs = (providerData as { subtitles?: Array<{ label: string; url: string }> })?.subtitles;
      if (!Array.isArray(subs)) continue;
      const provider = this.mapProvider(providerName);
      for (const sub of subs) {
        if (!sub.url || !sub.label) continue;
        const key = `${provider}:${sub.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const isExternal = sub.url.startsWith('http://') || sub.url.startsWith('https://');
        const captionUrl = isExternal ? `/api/proxy-subtitle?url=${encodeURIComponent(sub.url)}` : sub.url;
        captions.push({
          label: sub.label,
          url: captionUrl,
          language: sub.label.split(/\s*[-–]\s*/)[0]?.trim() || sub.label,
          provider,
        });
      }
    }
    return captions;
  },

  // Get all available stream sources for a movie (TLO v3/v4 API)
  async getMovieStreamSourcesAsync(TMDB_ID: number, _options: StreamFetchOptions = {}): Promise<StreamResult> {
    try {
      const data = await this.getMovieStreamData(TMDB_ID);
      const sources = data ? this.parseStreamSources(data) : [];
      const captions = data ? this.parseStreamCaptions(data) : [];
      if (!data && process.env.NODE_ENV !== 'test') {
        logger.debug('No stream for movie TMDB_ID:', TMDB_ID);
      }
      return { sources, captions };
    } catch (error) {
      if (error instanceof Error && !error.message.includes('Not Found')) {
        logger.warn('Movie stream fetch failed:', error.message);
      }
      return { sources: [], captions: [] };
    }
  },

  // Get all available stream sources for a TV show (TLO v3/v4 API)
  async getTVStreamSourcesAsync(TMDB_ID: number, SEASON: number, EPISODE: number, _options: StreamFetchOptions = {}): Promise<StreamResult> {
    try {
      const data = await this.getTVStreamData(TMDB_ID, SEASON, EPISODE);
      const sources = data ? this.parseStreamSources(data) : [];
      const captions = data ? this.parseStreamCaptions(data) : [];
      if (!data && process.env.NODE_ENV !== 'test') {
        logger.debug('No stream for TV TMDB_ID:', TMDB_ID, 'S' + SEASON + 'E' + EPISODE);
      }
      return { sources, captions };
    } catch (error) {
      if (error instanceof Error && !error.message.includes('Not Found')) {
        logger.warn('TV stream fetch failed:', error.message);
      }
      return { sources: [], captions: [] };
    }
  },
};
