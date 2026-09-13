/// <reference path="../src/types.d.ts" />
import { get } from '../src/utils/http';
import { fetchAniListIds, fetchTitleAliases, ensureQueryInTitle } from '../src/utils/anilist';
import { fetchAnimeEpisodeMetadata } from '../src/utils/anime_episodes';

function decodeHtml(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseHtmlItems(html: string): MultimediaItem[] {
  const items: MultimediaItem[] = [];
  const itemMatches = html.matchAll(/<div class="item">([\s\S]*?)<\/div>\s*<\/div>/g);

  for (const match of itemMatches) {
    const block = match[1];

    // URL & Poster
    const posterMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*class="poster"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"/i);
    const nameMatch = block.match(/<a[^>]+class="name"[^>]*>([\s\S]*?)<\/a>/i);

    if (!posterMatch || !nameMatch) continue;

    const relUrl = posterMatch[1];
    let posterUrl = posterMatch[2];
    if (posterUrl.startsWith('//')) posterUrl = 'https:' + posterUrl;

    const fullUrl = relUrl.startsWith('http') ? relUrl : `${manifest.baseUrl}${relUrl.startsWith('/') ? '' : '/'}${relUrl}`;
    const rawTitle = decodeHtml(nameMatch[1].replace(/<[^>]+>/g, '').trim());
    const isDub = block.includes('class="dub"') || rawTitle.includes('(ITA)') || fullUrl.includes('-ita.');
    const cleanTitle = rawTitle.replace(/\s*\(ITA\)\s*$/i, '').replace(/\s*\(SUB ITA\)\s*$/i, '').replace(/\s*\(SUB\)\s*$/i, '').trim();
    const displayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;

    items.push(new MultimediaItem({
      title: displayTitle,
      url: fullUrl,
      posterUrl,
      type: 'anime',
      status: 'ongoing',
      tags: [isDub ? 'DOPPIATO ITA' : 'SUB ITA'],
      description: isDub ? '[DOPPIATO ITA]' : '[SUB ITA]'
    }));
  }

  return items;
}

export async function getHome(cb: (res: Result<Record<string, MultimediaItem[]>>) => void) {
  try {
    const trendingRes = await get(`${manifest.baseUrl}/filter?status=0&sort=1`);
    const trendingItems = parseHtmlItems(trendingRes.body);

    const latestRes = await get(`${manifest.baseUrl}/filter?sort=1`);
    const latestItems = parseHtmlItems(latestRes.body);

    const topRes = await get(`${manifest.baseUrl}/tops/all?sort=1`);
    const topItems = parseHtmlItems(topRes.body);

    const result: Record<string, MultimediaItem[]> = {
      'Trending': trendingItems.length > 0 ? trendingItems : latestItems,
      'In Corso': trendingItems,
      'Ultimi Aggiunti': latestItems,
      'Top Anime': topItems
    };

    cb({ success: true, data: result });
  } catch (err: any) {
    cb({ success: false, errorCode: 'HOME_ERROR', message: err.message });
  }
}

export async function search(query: string, cb: (res: Result<MultimediaItem[]>) => void) {
  try {
    const cleanQ = query.trim();
    const searchUrl = `${manifest.baseUrl}/filter?sort=0&keyword=${encodeURIComponent(cleanQ)}`;
    const res = await get(searchUrl);
    const items = parseHtmlItems(res.body);

    // If few or no results found, search using AniList title aliases (e.g. English, Romaji, Italian)
    if (items.length < 3) {
      try {
        const aliases = await fetchTitleAliases(cleanQ);
        const seenUrls = new Set(items.map(i => i.url));

        const aliasPromises = aliases.slice(0, 3).map(async (alias) => {
          try {
            const aliasUrl = `${manifest.baseUrl}/filter?sort=0&keyword=${encodeURIComponent(alias)}`;
            const aliasRes = await get(aliasUrl);
            return parseHtmlItems(aliasRes.body);
          } catch {
            return [];
          }
        });

        const aliasResultLists = await Promise.all(aliasPromises);
        for (const list of aliasResultLists) {
          for (const item of list) {
            if (!seenUrls.has(item.url)) {
              seenUrls.add(item.url);
              items.push(item);
            }
          }
        }
      } catch {
        // ignore alias errors
      }
    }

    cb({ success: true, data: items.map(item => ensureQueryInTitle(item, cleanQ)) });
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

    const titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<div class="info">[\s\S]*?<div class="title"[^>]*>([\s\S]*?)<\/div>/i);
    const rawTitleStr = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')).trim() : 'Anime';
    const isDub = targetUrl.includes('-ita.') || html.includes('class="dub"') || rawTitleStr.includes('(ITA)');
    const cleanTitle = rawTitleStr.replace(/\s*\(ITA\)\s*$/i, '').replace(/\s*\(SUB ITA\)\s*$/i, '').replace(/\s*\(SUB\)\s*$/i, '').trim();
    const displayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;

    const posterMatch = html.match(/class="thumb">[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"/i) ||
                        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<img[^>]+src=["'](https?:\/\/img\.animeworld\.[^"']+)["']/i);
    let posterUrl = posterMatch ? posterMatch[1] : '';
    if (posterUrl.startsWith('//')) posterUrl = 'https:' + posterUrl;

    const descMatch = html.match(/<div class="desc"[^>]*>([\s\S]*?)<\/div>/i);
    let description = '';
    if (descMatch) {
      const longMatch = descMatch[1].match(/<div class="long">([\s\S]*?)<\/div>/i);
      description = (longMatch ? longMatch[1] : descMatch[1]).replace(/<[^>]+>/g, '').trim();
    }

    const scoreMatch = html.match(/id="average-vote"[^>]*>([\s\S]*?)<\//i);
    const score = scoreMatch ? parseFloat(scoreMatch[1].trim()) : undefined;

    // Genres
    const genreMatches = [...html.matchAll(/href="[^"]*\/genre\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    const tags = genreMatches.map(m => m[1].replace(/<[^>]+>/g, '').trim());
    tags.unshift(isDub ? 'DOPPIATO ITA' : 'SUB ITA');

    // Episodes
    const episodes: Episode[] = [];
    const epMatches = [...html.matchAll(/<li[^>]*class="[^"]*episode[^"]*"[^>]*><a[^>]+data-id="([^"]+)"[^>]+data-episode-num="([^"]+)"[^>]*>/gi)];

    for (const ep of epMatches) {
      const epId = ep[1];
      const epNum = parseInt(ep[2], 10) || 1;
      const streamApiUrl = `${manifest.baseUrl}/api/episode/info?id=${epId}`;

      episodes.push(new Episode({
        name: `Episodio ${epNum}`,
        url: streamApiUrl,
        season: 1,
        episode: epNum,
        dubStatus: isDub ? 'dubbed' : 'subbed'
      }));
    }

    // Sort episodes in ascending order
    episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));

    // Extract external metadata IDs for AniSkip / tracking
    const syncData: Record<string, string> = {};
    const malMatch = html.match(/id=["']mal-button["'][^>]*href=["']([^"']+)["']/i) ||
                     html.match(/href=["'](https?:\/\/[^"']*myanimelist\.net\/anime\/(\d+)[^"']*)["']/i);
    const anilistMatch = html.match(/id=["']anilist-button["'][^>]*href=["']([^"']+)["']/i) ||
                         html.match(/href=["'](https?:\/\/[^"']*anilist\.co\/anime\/(\d+)[^"']*)["']/i);

    if (malMatch) {
      const target = malMatch[2] || malMatch[1];
      const parts = target.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) syncData.mal = last;
    }
    if (anilistMatch) {
      const target = anilistMatch[2] || anilistMatch[1];
      const parts = target.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) syncData.anilist = last;
    }

    if (!syncData.mal && !syncData.anilist) {
      try {
        const jtitleMatch = html.match(/data-jtitle="([^"]+)"/i);
        const searchTitle = jtitleMatch ? jtitleMatch[1] : cleanTitle;
        const extIds = await fetchAniListIds(searchTitle);
        if (extIds?.mal) syncData.mal = extIds.mal;
        if (extIds?.anilist) syncData.anilist = extIds.anilist;
      } catch {}
    }

    // Enrich episodes with titles, descriptions and cover thumbnails
    try {
      const epMeta = await fetchAnimeEpisodeMetadata({
        malId: syncData.mal,
        anilistId: syncData.anilist,
        title: cleanTitle,
        episodeCount: episodes.length
      });
      for (const ep of episodes) {
        const num = ep.episode || 1;
        const meta = epMeta.get(num);
        if (meta) {
          if (meta.title) ep.name = `Episodio ${num}: ${meta.title}`;
          if (meta.description) ep.description = meta.description;
          if (meta.thumbnail) ep.posterUrl = meta.thumbnail;
        }
      }
    } catch {}

    const item = new MultimediaItem({
      title: displayTitle,
      url: targetUrl,
      posterUrl,
      type: 'anime',
      description: (isDub ? '[DOPPIATO ITA] ' : '[SUB ITA] ') + description,
      score,
      tags,
      episodes,
      syncData: Object.keys(syncData).length > 0 ? syncData : undefined
    });

    cb({ success: true, data: item });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_ERROR', message: err.message });
  }
}

export async function loadStreams(url: string, cb: (res: Result<StreamResult[]>) => void) {
  try {
    let epApiUrl = url;

    // If url is not the API endpoint directly, extract data-id or make an episode request
    if (!epApiUrl.includes('/api/episode/info')) {
      const idMatch = url.match(/[?&#]id=([^&#]+)/) || url.match(/\/([a-zA-Z0-9]+)$/);
      if (idMatch) {
        epApiUrl = `${manifest.baseUrl}/api/episode/info?id=${idMatch[1]}`;
      }
    }

    const res = await get(epApiUrl, {
      headers: {
        'Referer': manifest.baseUrl,
        'Accept': 'application/json, text/plain, */*'
      }
    });

    let json: any = null;
    try {
      json = JSON.parse(res.body);
    } catch {
      return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid episode info response' });
    }

    if (!json || !json.grabber) {
      return cb({ success: false, errorCode: 'NO_STREAM', message: 'No grabber URL returned' });
    }

    const streamUrl = json.grabber;
    const isDirect = streamUrl.endsWith('.mp4') || streamUrl.includes('.m3u8') || streamUrl.includes('sweetpixel') || streamUrl.includes('animeworld');

    const result = new StreamResult({
      url: streamUrl,
      source: isDirect ? 'AnimeWorld Direct' : 'AnimeWorld Server',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${manifest.baseUrl}/`
      }
    });

    cb({ success: true, data: [result] });
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
