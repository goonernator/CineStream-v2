import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type'); // 'movie' or 'tv'
  const tmdbId = searchParams.get('tmdbId');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');

  if (!type || !tmdbId) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    // Build the tlo.sh API URL (using public /stream/api endpoint, not v3)
    // Movies: https://tlo.sh/stream/api/movie/TMDB_ID
    // TV: https://tlo.sh/stream/api/tv/TMDB_ID/SEASON/EPISODE
    const STREAMING_BASE_URL = 'https://tlo.sh/stream/api';
    let streamUrl: string;

    if (type === 'movie') {
      streamUrl = `${STREAMING_BASE_URL}/movie/${tmdbId}`;
    } else if (type === 'tv') {
      if (!season || !episode) {
        return NextResponse.json(
          { error: 'Missing season or episode for TV show' },
          { status: 400 }
        );
      }
      streamUrl = `${STREAMING_BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
    } else {
      return NextResponse.json(
        { error: 'Invalid type parameter' },
        { status: 400 }
      );
    }

    // Fetch the stream data (JSON response) with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout
    
    let response: Response;
    try {
      response = await fetch(streamUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout - the streaming API took too long to respond' },
          { status: 504 }
        );
      }
      throw error;
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch stream: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Parse JSON response
    const streamData = await response.json();

    // Return the JSON data
    return NextResponse.json(streamData, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error fetching stream:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stream', details: error instanceof Error ? error.message : 'Unknown error' },
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

