import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { fetchWithRetry } from '@/lib/retry';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Fetch the subtitle file with retry
    const response = await fetchWithRetry(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/vtt, text/plain, */*',
          'Referer': 'https://rivestream.org/',
        },
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
      logger.error(`Failed to fetch subtitle: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch subtitle: ${response.statusText}` },
        { status: response.status }
      );
    }

    const subtitleText = await response.text();
    
    // Return the subtitle file with proper headers
    return new NextResponse(subtitleText, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    logger.error('Error proxying subtitle:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
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

