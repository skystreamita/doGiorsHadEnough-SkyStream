/// <reference path="../src/types.d.ts" />
import { post, parseJsonSafe } from '../src/utils/http';

const RESOLVE_UA = 'MediaHubMX/2';
const DEFAULT_POSTER = 'https://raw.githubusercontent.com/doGior/doGiorsHadEnough/master/Vavoo/Vavoo.jpg';

interface CatalogItem {
  type: string;
  ids: { id: string };
  url: string;
  name: string;
  group: string;
  logo?: string;
}

interface CatalogResponse {
  items: CatalogItem[];
  nextCursor?: number;
}

interface ResolveItem {
  id: string;
  name: string;
  url: string;
}

function itemToMultimedia(item: CatalogItem): MultimediaItem {
  const logoUrl = item.logo || DEFAULT_POSTER;
  const payload = JSON.stringify({
    url: item.url,
    title: item.name,
    logo: logoUrl
  });

  return new MultimediaItem({
    title: item.name,
    url: payload,
    posterUrl: logoUrl,
    bannerUrl: logoUrl,
    type: 'livestream',
    description: `Canale Live: ${item.name} [${item.group}]`,
    status: 'ongoing'
  });
}

export async function getHome(cb: (res: Result<Record<string, MultimediaItem[]>>) => void) {
  try {
    const catalogUrl = `${manifest.baseUrl.replace(/\/+$/, '')}/mediahubmx-catalog.json`;
    const payload = {
      language: 'en',
      region: 'UK',
      catalogId: 'iptv',
      id: 'iptv',
      adult: true,
      search: '',
      sort: 'name',
      filter: {
        group: 'Italy'
      },
      cursor: 0,
      clientVersion: '3.0.2'
    };

    const res = await post(catalogUrl, payload, {
      headers: {
        'User-Agent': RESOLVE_UA,
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'Referer': `${manifest.baseUrl}/`,
        'Origin': manifest.baseUrl
      }
    });

    const data = parseJsonSafe<CatalogResponse>(res.body);
    const items = (data?.items || []).map(itemToMultimedia);

    const result: Record<string, MultimediaItem[]> = {
      'Trending': items.slice(0, 30),
      'Canali Italiani': items
    };

    cb({ success: true, data: result });
  } catch (err: any) {
    cb({ success: false, errorCode: 'HOME_ERROR', message: err.message });
  }
}

export async function search(query: string, cb: (res: Result<MultimediaItem[]>) => void) {
  try {
    const catalogUrl = `${manifest.baseUrl.replace(/\/+$/, '')}/mediahubmx-catalog.json`;
    const payload = {
      language: 'en',
      region: 'UK',
      catalogId: 'iptv',
      id: 'iptv',
      adult: true,
      search: query,
      sort: 'name',
      filter: {
        group: 'Italy'
      },
      cursor: 0,
      clientVersion: '3.0.2'
    };

    const res = await post(catalogUrl, payload, {
      headers: {
        'User-Agent': RESOLVE_UA,
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'Referer': `${manifest.baseUrl}/`,
        'Origin': manifest.baseUrl
      }
    });

    const data = parseJsonSafe<CatalogResponse>(res.body);
    const items = (data?.items || []).map(itemToMultimedia);

    cb({ success: true, data: items });
  } catch (err: any) {
    cb({ success: false, errorCode: 'SEARCH_ERROR', message: err.message });
  }
}

export async function load(url: string, cb: (res: Result<MultimediaItem>) => void) {
  try {
    let playUrl = url;
    let title = 'Canale TV';
    let logo = DEFAULT_POSTER;

    try {
      const parsed = JSON.parse(url);
      if (parsed.url) {
        playUrl = parsed.url;
        title = parsed.title || title;
        logo = parsed.logo || logo;
      }
    } catch {}

    const item = new MultimediaItem({
      title,
      url: playUrl,
      posterUrl: logo,
      bannerUrl: logo,
      type: 'livestream',
      description: `Diretta TV: ${title}`,
      status: 'ongoing',
      episodes: [
        new Episode({
          name: `${title} (Live)`,
          url: playUrl,
          episode: 1
        })
      ]
    });

    cb({ success: true, data: item });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_ERROR', message: err.message });
  }
}

export async function loadStreams(streamUrl: string, cb: (res: Result<StreamResult[]>) => void) {
  try {
    let resolveTarget = streamUrl;
    try {
      const parsed = JSON.parse(streamUrl);
      if (parsed.url) resolveTarget = parsed.url;
    } catch {}

    const resolveEndpoint = `${manifest.baseUrl.replace(/\/+$/, '')}/mediahubmx-resolve.json`;
    const payload = {
      language: 'en',
      region: 'UK',
      url: resolveTarget,
      clientVersion: '3.0.2'
    };

    const res = await post(resolveEndpoint, payload, {
      headers: {
        'User-Agent': RESOLVE_UA,
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'Referer': `${manifest.baseUrl}/`,
        'Origin': manifest.baseUrl
      }
    });

    const list = parseJsonSafe<ResolveItem[]>(res.body);
    const streams: StreamResult[] = [];

    if (Array.isArray(list)) {
      for (const item of list) {
        if (item.url && item.url.startsWith('http')) {
          streams.push(new StreamResult({
            url: item.url,
            source: 'Vavoo Live (HLS)',
            headers: {
              'User-Agent': RESOLVE_UA,
              'Referer': `${manifest.baseUrl}/`
            }
          }));
        }
      }
    }

    cb({ success: true, data: streams });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_STREAMS_ERROR', message: err.message });
  }
}
