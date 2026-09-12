/// <reference path="../src/types.d.ts" />
import { get, parseJsonSafe } from '../src/utils/http';

interface EventStream {
  label: string;
  lang: string;
  source: string;
  url: string;
}

interface EventItem {
  id: string;
  title: string;
  home_team?: string;
  away_team?: string;
  home_team_badge?: string;
  away_team_badge?: string;
  sport?: string;
  league?: string;
  start_time?: string;
  status: string;
  streams?: EventStream[];
}

interface EventsApiResponse {
  events: EventItem[];
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i >> 1] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function xorDecrypt(ch: string, kh: string): string {
  const c = hexToBytes(ch);
  const k = hexToBytes(kh);
  let s = '';
  for (let i = 0; i < c.length; i++) {
    s += String.fromCharCode(c[i] ^ k[i % k.length]);
  }
  return s;
}

function b64Decode(str: string): string {
  if (typeof atob !== 'undefined') {
    return atob(str);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString('latin1');
  }
  return '';
}

function decodeEconfig(html: string): string | null {
  const match = html.match(/window\._econfig\s*=\s*['"]([^'"]+)['"]/);
  if (!match) return null;

  try {
    const rawB64 = match[1];
    const padLen = (-rawB64.length % 4 + 4) % 4;
    const padded = rawB64 + '='.repeat(padLen);
    const decoded1 = b64Decode(padded);

    const partOrder = [2, 0, 3, 1];
    const partLength = Math.floor((decoded1.length + 3) / 4);
    const encodedParts: string[] = [];
    let offset = 0;

    for (let i = 0; i < 4; i++) {
      const part = decoded1.substring(offset, Math.min(offset + partLength, decoded1.length));
      offset += partLength;
      encodedParts.push(part.slice(0, 3) + part.slice(4));
    }

    const decodedParts: string[] = new Array(4);
    encodedParts.forEach((part, index) => {
      const pLen = (-part.length % 4 + 4) % 4;
      const pPadded = part + '='.repeat(pLen);
      decodedParts[partOrder[index]] = b64Decode(pPadded);
    });

    const joined = decodedParts.join('');
    const jLen = (-joined.length % 4 + 4) % 4;
    const jPadded = joined + '='.repeat(jLen);
    const jsonStr = b64Decode(jPadded);

    const config = JSON.parse(jsonStr);
    return config.stream_url_nop2p || config.stream_url || null;
  } catch {
    return null;
  }
}

function resolvePoster(item: EventItem, baseUrl: string): string {
  if (item.home_team_badge) {
    if (item.home_team_badge.startsWith('http')) {
      return item.home_team_badge;
    }
    return `${baseUrl.replace(/\/+$/, '')}/${item.home_team_badge.replace(/^\/+/, '')}`;
  }
  return 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=500';
}

function mapEventToMultimedia(event: EventItem, baseUrl: string): MultimediaItem {
  const poster = resolvePoster(event, baseUrl);
  const desc = `${event.league || ''} • ${event.sport || ''} (${event.start_time || ''})`;
  return new MultimediaItem({
    title: event.title,
    url: event.id,
    posterUrl: poster,
    bannerUrl: poster,
    type: 'livestream',
    description: desc,
    status: event.status === 'live' ? 'ongoing' : 'upcoming'
  });
}

export async function getHome(cb: (res: Result<Record<string, MultimediaItem[]>>) => void) {
  try {
    const apiUrl = `${manifest.baseUrl.replace(/\/+$/, '')}/api/events.php`;
    const res = await get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    const apiData = parseJsonSafe<EventsApiResponse>(res.body);
    const liveItems: MultimediaItem[] = [];
    const upcomingItems: MultimediaItem[] = [];

    for (const ev of apiData?.events || []) {
      const item = mapEventToMultimedia(ev, manifest.baseUrl);
      if (ev.status === 'live') {
        liveItems.push(item);
      } else {
        upcomingItems.push(item);
      }
    }

    const result: Record<string, MultimediaItem[]> = {};
    if (liveItems.length > 0) {
      result['Trending'] = liveItems;
      result['In Diretta'] = liveItems;
    }
    if (upcomingItems.length > 0) {
      if (!result['Trending']) {
        result['Trending'] = upcomingItems.slice(0, 30);
      }
      result['Prossimi Eventi'] = upcomingItems.slice(0, 30);
    }

    cb({ success: true, data: result });
  } catch (err: any) {
    cb({ success: false, errorCode: 'HOME_ERROR', message: err.message });
  }
}

export async function search(query: string, cb: (res: Result<MultimediaItem[]>) => void) {
  try {
    const apiUrl = `${manifest.baseUrl.replace(/\/+$/, '')}/api/events.php`;
    const res = await get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    const apiData = parseJsonSafe<EventsApiResponse>(res.body);
    const q = query.toLowerCase().trim();
    const results: MultimediaItem[] = [];

    for (const ev of apiData?.events || []) {
      const matchesTitle = ev.title.toLowerCase().includes(q);
      const matchesHome = ev.home_team?.toLowerCase().includes(q);
      const matchesAway = ev.away_team?.toLowerCase().includes(q);
      const matchesLeague = ev.league?.toLowerCase().includes(q);

      if (matchesTitle || matchesHome || matchesAway || matchesLeague) {
        results.push(mapEventToMultimedia(ev, manifest.baseUrl));
      }
    }

    cb({ success: true, data: results });
  } catch (err: any) {
    cb({ success: false, errorCode: 'SEARCH_ERROR', message: err.message });
  }
}

export async function load(url: string, cb: (res: Result<MultimediaItem>) => void) {
  try {
    const apiUrl = `${manifest.baseUrl.replace(/\/+$/, '')}/api/events.php`;
    const res = await get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    const apiData = parseJsonSafe<EventsApiResponse>(res.body);
    const event = apiData?.events?.find(e => e.id === url || e.title === url);
    if (!event) {
      throw new Error(`Event ${url} not found`);
    }

    const poster = resolvePoster(event, manifest.baseUrl);
    const episodes: Episode[] = [];

    if (event.streams && event.streams.length > 0) {
      event.streams.forEach((s, idx) => {
        episodes.push(new Episode({
          name: `${s.label || 'Opzione ' + (idx + 1)} [${s.lang || 'Multi'}] - ${s.source || 'Stream'}`,
          url: s.url,
          episode: idx + 1
        }));
      });
    }

    const item = new MultimediaItem({
      title: event.title,
      url: event.id,
      posterUrl: poster,
      bannerUrl: poster,
      type: 'livestream',
      description: `${event.league || ''} • ${event.sport || ''}\nOrario d'inizio: ${event.start_time || ''}`,
      status: event.status === 'live' ? 'ongoing' : 'upcoming',
      episodes: episodes.length > 0 ? episodes : undefined
    });

    cb({ success: true, data: item });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_ERROR', message: err.message });
  }
}

export async function loadStreams(streamUrl: string, cb: (res: Result<StreamResult[]>) => void) {
  try {
    if (streamUrl.includes('.m3u8')) {
      cb({
        success: true,
        data: [new StreamResult({
          url: streamUrl,
          source: 'Calcio Live (Direct HLS)'
        })]
      });
      return;
    }

    const streams: StreamResult[] = [];

    const pageRes = await get(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `${manifest.baseUrl}/`
      }
    });
    const html = pageRes.body;

    // 1. Check for modern _c and _k XOR encrypted streams
    const cMatch = html.match(/var _c = "([^"]+)";/);
    const kMatch = html.match(/var _k = "([^"]+)";/);
    if (cMatch && kMatch) {
      const decrypted = xorDecrypt(cMatch[1], kMatch[1]);
      if (decrypted && decrypted.startsWith('http')) {
        let domainReferer = 'https://videocdn-4726.website/';
        try {
          domainReferer = `${new URL(streamUrl).origin}/`;
        } catch {}
        streams.push(new StreamResult({
          url: decrypted,
          source: 'Calcio Live (HLS)',
          headers: {
            'Referer': domainReferer,
            'Origin': domainReferer.replace(/\/+$/, '')
          }
        }));
      }
    }

    // 2. Check for window._econfig 4-part base64 permutation
    const econfigUrl = decodeEconfig(html);
    if (econfigUrl && econfigUrl.startsWith('http')) {
      streams.push(new StreamResult({
        url: econfigUrl,
        source: 'Calcio Live (eConfig HLS)'
      }));
    }

    // 3. Check for ZT_SOURCES
    const ztMatch = html.match(/ZT_SOURCES\s*=\s*(\[[^;]+\])/);
    if (ztMatch) {
      try {
        const sources = JSON.parse(ztMatch[1]);
        for (const s of sources) {
          if (s.url && s.url.startsWith('http')) {
            streams.push(new StreamResult({
              url: s.url,
              source: `Zico Live (${s.label || 'Stream'})`
            }));
          }
        }
      } catch {}
    }

    // 4. Follow iframe if no streams were extracted yet
    if (streams.length === 0) {
      const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch) {
        let iframeUrl = iframeMatch[1];
        if (iframeUrl.startsWith('//')) {
          iframeUrl = 'https:' + iframeUrl;
        } else if (iframeUrl.startsWith('/')) {
          const origin = new URL(streamUrl).origin;
          iframeUrl = origin + iframeUrl;
        }

        const iframeRes = await get(iframeUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': streamUrl
          }
        });
        const iframeHtml = iframeRes.body;

        const icMatch = iframeHtml.match(/var _c = "([^"]+)";/);
        const ikMatch = iframeHtml.match(/var _k = "([^"]+)";/);
        if (icMatch && ikMatch) {
          const decrypted = xorDecrypt(icMatch[1], ikMatch[1]);
          if (decrypted && decrypted.startsWith('http')) {
            streams.push(new StreamResult({
              url: decrypted,
              source: 'Calcio Live (Iframe HLS)',
              headers: {
                'Referer': iframeUrl,
                'Origin': new URL(iframeUrl).origin
              }
            }));
          }
        }

        const iEconfig = decodeEconfig(iframeHtml);
        if (iEconfig && iEconfig.startsWith('http')) {
          streams.push(new StreamResult({
            url: iEconfig,
            source: 'Calcio Live (Iframe eConfig HLS)'
          }));
        }
      }
    }

    cb({ success: true, data: streams });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_STREAMS_ERROR', message: err.message });
  }
}
