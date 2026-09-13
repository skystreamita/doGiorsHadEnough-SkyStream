/// <reference path="../src/types.d.ts" />
import { get, post, parseJsonSafe } from '../src/utils/http';
import { extractVixCloud } from '../src/extractors/vixcloud';
import { fetchAniListIds, fetchTitleAliases, ensureQueryInTitle } from '../src/utils/anilist';

let cachedCsrfToken = '';
let cachedCookies = '';

async function getCsrfHeaders(): Promise<Record<string, string>> {
  if (cachedCsrfToken && cachedCookies) {
    return {
      'X-CSRF-TOKEN': cachedCsrfToken,
      'Cookie': cachedCookies,
      'Referer': `${manifest.baseUrl}/archivio`,
      'X-Requested-With': 'XMLHttpRequest'
    };
  }

  try {
    const res = await get(`${manifest.baseUrl}/archivio`);
    const tokenMatch = res.body.match(/<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/i);
    if (tokenMatch) cachedCsrfToken = tokenMatch[1];

    if (res.headers && res.headers['set-cookie']) {
      const setCookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      cachedCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
    }

    return {
      'X-CSRF-TOKEN': cachedCsrfToken,
      'Cookie': cachedCookies,
      'Referer': `${manifest.baseUrl}/archivio`,
      'X-Requested-With': 'XMLHttpRequest'
    };
  } catch (err) {
    console.error('Failed to get AnimeUnity CSRF headers:', err);
    return {
      'Referer': `${manifest.baseUrl}/archivio`,
      'X-Requested-With': 'XMLHttpRequest'
    };
  }
}

function decodeHtml(str: string): string {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseAnimeToMultimediaItem(record: any): MultimediaItem {
  const isDub = record.dub === 1 ||
                (typeof record.slug === 'string' && record.slug.toLowerCase().includes('-ita')) ||
                (typeof record.title === 'string' && record.title.toLowerCase().includes('(ita)'));
  const rawTitle = decodeHtml(record.title_it || record.title_eng || record.title || record.slug || 'Anime');
  const cleanTitle = rawTitle.replace(/\s*\(ITA\)\s*$/i, '').replace(/\s*\(SUB ITA\)\s*$/i, '').replace(/\s*\(SUB\)\s*$/i, '').trim();
  const displayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;
  const score = record.score ? parseFloat(record.score) : undefined;
  const itemUrl = `${manifest.baseUrl}/anime/${record.id}-${record.slug}`;

  return new MultimediaItem({
    title: displayTitle,
    url: itemUrl,
    posterUrl: record.imageurl || '',
    bannerUrl: record.imageurl_cover || record.imageurl || '',
    type: 'anime',
    status: record.status === 'In corso' ? 'ongoing' : 'completed',
    score,
    tags: [isDub ? 'DOPPIATO ITA' : 'SUB ITA'],
    description: (isDub ? '[DOPPIATO ITA] ' : '[SUB ITA] ') + (record.plot || '')
  });
}

export async function getHome(cb: (res: Result<Record<string, MultimediaItem[]>>) => void) {
  try {
    const headers = await getCsrfHeaders();

    // 1. Trending / Popular
    const popularReq = post(`${manifest.baseUrl}/archivio/get-animes`, {
      title: false,
      type: false,
      year: false,
      order: 'Visite',
      status: false,
      genres: false,
      season: false,
      dubbed: 1,
      offset: 0
    }, { headers });

    // 2. Ongoing
    const ongoingReq = post(`${manifest.baseUrl}/archivio/get-animes`, {
      title: false,
      type: false,
      year: false,
      order: false,
      status: 'In corso',
      genres: false,
      season: false,
      dubbed: 1,
      offset: 0
    }, { headers });

    // 3. Latest
    const latestReq = post(`${manifest.baseUrl}/archivio/get-animes`, {
      title: false,
      type: false,
      year: false,
      order: 'Data',
      status: false,
      genres: false,
      season: false,
      dubbed: 1,
      offset: 0
    }, { headers });

    const [popRes, onRes, latRes] = await Promise.all([popularReq, ongoingReq, latestReq]);

    const popJson = JSON.parse(popRes.body || '{}');
    const onJson = JSON.parse(onRes.body || '{}');
    const latJson = JSON.parse(latRes.body || '{}');

    const popularItems = (popJson.records || []).map(parseAnimeToMultimediaItem);
    const ongoingItems = (onJson.records || []).map(parseAnimeToMultimediaItem);
    const latestItems = (latJson.records || []).map(parseAnimeToMultimediaItem);

    const result: Record<string, MultimediaItem[]> = {
      'Trending': popularItems.length > 0 ? popularItems : ongoingItems,
      'In Corso': ongoingItems,
      'Ultimi Aggiunti': latestItems,
      'Più Popolari': popularItems
    };

    cb({ success: true, data: result });
  } catch (err: any) {
    cb({ success: false, errorCode: 'HOME_ERROR', message: err.message });
  }
}

export async function search(query: string, cb: (res: Result<MultimediaItem[]>) => void) {
  try {
    const cleanQ = query.trim();
    const headers = await getCsrfHeaders();
    const res = await post(`${manifest.baseUrl}/archivio/get-animes`, {
      title: cleanQ,
      type: false,
      year: false,
      order: false,
      status: false,
      genres: false,
      season: false,
      dubbed: 1,
      offset: 0
    }, { headers });

    let json: any = {};
    try {
      json = JSON.parse(res.body);
    } catch {
      return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid search JSON' });
    }

    const records = json.records || [];
    let items = records.map(parseAnimeToMultimediaItem);

    // If few or no results found, search using AniList title aliases (e.g. Romaji, English, Italian)
    if (items.length < 3) {
      try {
        const aliases = await fetchTitleAliases(cleanQ);
        const seenUrls = new Set(items.map((i: MultimediaItem) => i.url));

        const aliasPromises = aliases.slice(0, 3).map(async (alias) => {
          try {
            const aliasRes = await post(`${manifest.baseUrl}/archivio/get-animes`, {
              title: alias,
              type: false,
              year: false,
              order: false,
              status: false,
              genres: false,
              season: false,
              dubbed: 1,
              offset: 0
            }, { headers });

            const aliasJson = parseJsonSafe(aliasRes.body);
            const aliasRecords = aliasJson?.records || [];
            return aliasRecords.map(parseAnimeToMultimediaItem);
          } catch {
            return [];
          }
        });

        const aliasResultLists = await Promise.all(aliasPromises);
        for (const list of aliasResultLists) {
          for (const parsed of list) {
            if (!seenUrls.has(parsed.url)) {
              seenUrls.add(parsed.url);
              items.push(parsed);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    cb({ success: true, data: items.map((item: MultimediaItem) => ensureQueryInTitle(item, cleanQ)) });
  } catch (err: any) {
    cb({ success: false, errorCode: 'SEARCH_ERROR', message: err.message });
  }
}

export async function load(url: string, cb: (res: Result<MultimediaItem>) => void) {
  try {
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = `${manifest.baseUrl}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    const res = await get(targetUrl);
    const html = res.body;

    // Extract embedded anime JSON object
    let animeData: any = null;
    const animeMatch = html.match(/<video-player[^>]*\s+anime=(["'])([\s\S]*?)\1/i) ||
                       html.match(/anime:\s*(\{[\s\S]*?\})\s*,\s*episodes/);
    if (animeMatch) {
      try {
        const rawJson = animeMatch[2] ? animeMatch[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : animeMatch[1];
        animeData = JSON.parse(rawJson);
      } catch {
        // ignore
      }
    }

    // Extract episodes JSON
    let episodesList: any[] = [];
    const epMatch = html.match(/<video-player[^>]*\s+episodes=(["'])([\s\S]*?)\1/i) ||
                    html.match(/episodes:\s*(\[[\s\S]*?\])/);
    if (epMatch) {
      try {
        const rawJson = epMatch[2] ? epMatch[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : epMatch[1];
        episodesList = JSON.parse(rawJson);
      } catch {
        // ignore
      }
    }

    const titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    const rawDisplayTitle = decodeHtml(animeData?.title_it || animeData?.title_eng || animeData?.title || (titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Anime'));
    const isDub = Boolean(
      animeData?.dub === 1 ||
      (typeof animeData?.slug === 'string' && animeData.slug.toLowerCase().endsWith('-ita')) ||
      targetUrl.toLowerCase().includes('-ita') ||
      (typeof rawDisplayTitle === 'string' && rawDisplayTitle.toLowerCase().includes('(ita)'))
    );
    const cleanTitle = rawDisplayTitle.replace(/\s*\(ITA\)\s*$/i, '').replace(/\s*\(SUB ITA\)\s*$/i, '').replace(/\s*\(SUB\)\s*$/i, '').trim();
    const finalDisplayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;

    const posterMatch = html.match(/class="[^"]*poster[^"]*"[^>]*img[^>]+src="([^"]+)"/i) ||
                         html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i);
    const posterUrl = animeData?.imageurl || (posterMatch ? posterMatch[1] : '');

    const descMatch = html.match(/class="[^"]*plot[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = animeData?.plot || (descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '');

    const score = animeData?.score ? parseFloat(animeData.score) : undefined;

    const syncData: Record<string, string> = {};
    if (animeData?.mal_id) syncData.mal = String(animeData.mal_id);
    if (animeData?.anilist_id) syncData.anilist = String(animeData.anilist_id);

    if (!syncData.mal && !syncData.anilist) {
      try {
        const extIds = await fetchAniListIds(cleanTitle);
        if (extIds?.mal) syncData.mal = extIds.mal;
        if (extIds?.anilist) syncData.anilist = extIds.anilist;
      } catch {}
    }

    const item = new MultimediaItem({
      title: finalDisplayTitle,
      url: targetUrl,
      posterUrl,
      type: 'anime',
      description: (isDub ? '[DOPPIATO ITA] ' : '[SUB ITA] ') + description,
      score,
      status: animeData?.status === 'In corso' ? 'ongoing' : 'completed',
      tags: [isDub ? 'DOPPIATO ITA' : 'SUB ITA'],
      syncData: Object.keys(syncData).length > 0 ? syncData : undefined
    });

    const episodes: Episode[] = [];
    if (episodesList && Array.isArray(episodesList) && episodesList.length > 0) {
      for (const ep of episodesList) {
        const epNum = parseFloat(ep.number) || 1;
        // Construct stream URL pointing to the episode page which contains the video-player
        const epUrl = `${targetUrl}/${ep.id}`;

        episodes.push(new Episode({
          name: `Episodio ${ep.number}`,
          url: epUrl,
          season: 1,
          episode: Math.floor(epNum),
          dubStatus: isDub ? 'dubbed' : 'subbed'
        }));
      }
    } else {
      // Single movie or episode
      episodes.push(new Episode({
        name: finalDisplayTitle,
        url: targetUrl,
        season: 1,
        episode: 1,
        dubStatus: isDub ? 'dubbed' : 'subbed'
      }));
    }

    item.episodes = episodes;
    cb({ success: true, data: item });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_ERROR', message: err.message });
  }
}

export async function loadStreams(url: string, cb: (res: Result<StreamResult[]>) => void) {
  try {
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = `${manifest.baseUrl}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    // Fetch the page to find the video-player tag
    const res = await get(targetUrl, {
      headers: {
        'Referer': manifest.baseUrl
      }
    });

    // Look for embed_url="https://vixcloud.co/embed/..."
    const embedMatch = res.body.match(/embed_url=["']([^"']+)["']/i);
    if (!embedMatch) {
      // Check if this is already an embed URL
      if (targetUrl.includes('vixcloud.co')) {
        const streams = await extractVixCloud(targetUrl, {
          sourceName: 'AnimeUnity',
          referer: manifest.baseUrl
        });
        return cb({ success: true, data: streams });
      }
      return cb({ success: false, errorCode: 'NO_EMBED', message: 'No embed_url found in player' });
    }

    const embedUrl = embedMatch[1];
    const streams = await extractVixCloud(embedUrl, {
      sourceName: 'AnimeUnity',
      referer: manifest.baseUrl
    });

    cb({ success: true, data: streams });
  } catch (err: any) {
    cb({ success: false, errorCode: 'STREAM_ERROR', message: err.message });
  }
}

// Global exports
declare const globalThis: any;
globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
