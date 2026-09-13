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

    let subtitles: IStreamSubtitle[] = [];

    try {
      const masterRes = await get(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': cleanEmbedUrl
        }
      });

      if (masterRes && masterRes.body) {
        const lines = masterRes.body.split('\n');
        const subLines = lines.filter(l => l.includes('TYPE=SUBTITLES'));

        if (subLines.length > 0) {
          interface ParsedSub {
            name: string;
            lang: string;
            uri: string;
            isForced: boolean;
            isItalian: boolean;
            default?: boolean;
            url?: string;
          }

          const parsedSubs: ParsedSub[] = [];

          for (const line of subLines) {
            const nameMatch = line.match(/NAME="([^"]+)"/);
            const langMatch = line.match(/LANGUAGE="([^"]+)"/);
            const uriMatch = line.match(/URI="([^"]+)"/);
            if (!nameMatch || !uriMatch) continue;

            const name = nameMatch[1];
            const lang = langMatch ? langMatch[1] : 'und';
            const uri = uriMatch[1];
            const isForced = /forced/i.test(name) || /forzat/i.test(name) || /FORCED=YES/i.test(line);
            const isItalian = /ita/i.test(name) || /ita/i.test(lang);

            parsedSubs.push({
              name,
              lang,
              uri,
              isForced,
              isItalian
            });
          }

          // Sort priority:
          // 1. Italian [Forced] / Italian forced
          // 2. Any other Forced
          // 3. Italian non-forced
          // 4. Other languages alphabetically
          parsedSubs.sort((a, b) => {
            const aItaForced = a.isItalian && a.isForced;
            const bItaForced = b.isItalian && b.isForced;
            if (aItaForced && !bItaForced) return -1;
            if (!aItaForced && bItaForced) return 1;

            if (a.isForced && !b.isForced) return -1;
            if (!a.isForced && b.isForced) return 1;

            if (a.isItalian && !b.isItalian) return -1;
            if (!a.isItalian && b.isItalian) return 1;

            return a.name.localeCompare(b.name);
          });

          // Set default: true for the top forced track (or first Italian if no forced)
          const hasForced = parsedSubs.some(s => s.isForced);
          parsedSubs.forEach((s, idx) => {
            if (hasForced) {
              s.default = s.isForced && idx === 0;
            } else {
              s.default = idx === 0 && s.isItalian;
            }
          });

          // Resolve direct .vtt for top priority tracks (up to 5)
          for (let i = 0; i < Math.min(parsedSubs.length, 5); i++) {
            const s = parsedSubs[i];
            try {
              const subRes = await get(s.uri, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                  'Referer': cleanEmbedUrl
                }
              });
              if (subRes && subRes.body) {
                const vttMatch = subRes.body.match(/https?:\/\/[^\s"'<>\r\n]+\.vtt[^\s"'<>\r\n]*/i);
                if (vttMatch) {
                  s.url = vttMatch[0];
                }
              }
            } catch {
              // Fallback to playlist URI on fetch error
            }
            if (!s.url) {
              s.url = s.uri;
            }
          }

          // Any remaining tracks use uri directly
          for (let i = 5; i < parsedSubs.length; i++) {
            parsedSubs[i].url = parsedSubs[i].uri;
          }

          subtitles = parsedSubs.map(s => ({
            url: s.url!,
            label: s.name,
            name: s.name,
            lang: s.lang,
            default: !!s.default
          }));
        }
      }
    } catch (subErr) {
      console.warn('Could not extract VixCloud subtitles:', subErr);
    }

    return [
      new StreamResult({
        url: finalUrl,
        source: options?.sourceName || 'VixCloud',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': cleanEmbedUrl
        },
        subtitles: subtitles.length > 0 ? subtitles : undefined
      })
    ];
  } catch (err) {
    console.error('VixCloud extractor failed:', err);
    return [];
  }
}
