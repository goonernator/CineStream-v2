import { NextRequest, NextResponse } from 'next/server';

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
    // Determine the origin based on the URL
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    
    // Fetch the HLS content (manifest or segment)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
      },
      // Don't follow redirects automatically for better control
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error('HLS proxy fetch failed:', response.status, url);
      return new NextResponse(`Failed to fetch: ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Check if this is an m3u8 playlist
    if (url.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8')) {
      // Get the playlist content
      const playlistText = await response.text();
      
      // Rewrite URLs in the playlist to go through our proxy
      const baseUrl = new URL(url);
      const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
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
          
          // Rewrite to use our proxy
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
    
    // For video segments, just proxy the binary data
    const arrayBuffer = await response.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error proxying HLS:', error);
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

