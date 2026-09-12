/// <reference path="../types.d.ts" />
import { get } from '../utils/http';

export interface VixCloudOptions {
  sourceName?: string;
  displayName?: string;
  referer?: string;
}

export async function extractVixCloud(embedUrl: string, options?: VixCloudOptions): Promise<StreamResult[]> {
  try {
    const cleanEmbedUrl = embedUrl.replace(/&amp;/g, '&');
    const res = await get(cleanEmbedUrl, {
      headers: {
        'Referer': options?.referer || cleanEmbedUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res || !res.body) {
      return [];
    }

    const html = res.body;

    let token = '';
    let expires = '';
    let playlistBase = '';
    let canPlayFHD = false;

    // Pattern: masterPlaylist = { ... }
    const masterPlaylistMatch = html.match(/masterPlaylist\s*=\s*\{([\s\S]*?)\}/);
    if (masterPlaylistMatch) {
      const block = masterPlaylistMatch[1];
      const tokenM = block.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
      if (tokenM) token = tokenM[1];

      const expiresM = block.match(/['"]?expires['"]?\s*:\s*['"]?([0-9]+)['"]?/);
      if (expiresM) expires = expiresM[1];

      const urlM = block.match(/['"]?url['"]?\s*:\s*['"]([^'"]+)['"]/);
      if (urlM) playlistBase = urlM[1];
    }

    // Fallback if not found inside block
    if (!token) {
      const tokenM = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
      if (tokenM) token = tokenM[1];
    }
    if (!expires) {
      const expiresM = html.match(/['"]?expires['"]?\s*:\s*['"]?([0-9]+)['"]?/);
      if (expiresM) expires = expiresM[1];
    }
    if (!playlistBase) {
      const urlM = html.match(/['"]?url['"]?\s*:\s*['"](https?:\/\/[^'"]*vixcloud[^'"]*\/playlist\/[^'"]+)['"]/);
      if (urlM) playlistBase = urlM[1];
    }

    if (/canPlayFHD\s*=\s*true/i.test(html) || /['"]?canPlayFHD['"]?\s*:\s*(true|1)/i.test(html)) {
      canPlayFHD = true;
    }

    if (!playlistBase) {
      // Direct m3u8 link in html?
      const directM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (directM3u8) {
        return [
          new StreamResult({
            url: directM3u8[0],
            source: options?.sourceName || 'VixCloud',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Referer': cleanEmbedUrl
            }
          })
        ];
      }
      return [];
    }

    let finalUrl = playlistBase;
    const queryParts = [];
    if (token) queryParts.push(`token=${encodeURIComponent(token)}`);
    if (expires) queryParts.push(`expires=${encodeURIComponent(expires)}`);

    const queryString = queryParts.join('&');
    if (playlistBase.includes('?b')) {
      finalUrl = `${playlistBase.replace('?b:1', '?b=1')}${queryString ? '&' + queryString : ''}`;
    } else if (playlistBase.includes('?')) {
      finalUrl = `${playlistBase}${queryString ? '&' + queryString : ''}`;
    } else {
      finalUrl = `${playlistBase}${queryString ? '?' + queryString : ''}`;
    }

    if (canPlayFHD) {
      finalUrl += '&h=1';
    }

    return [
      new StreamResult({
        url: finalUrl,
        source: options?.sourceName || 'VixCloud',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': cleanEmbedUrl
        }
      })
    ];
  } catch (err) {
    console.error('VixCloud extractor failed:', err);
    return [];
  }
}
