/// <reference path="../src/types.d.ts" />
import { get } from '../src/utils/http';
import { extractVixCloud } from '../src/extractors/vixcloud';
import { fetchMovieSeriesAliases, matchesAppQuery, ensureQueryInTitle } from '../src/utils/media_aliases';

function extractInertiaPage(html: string): any {
  const match = html.match(/data-page="([\s\S]*?)"/) || html.match(/data-page='([\s\S]*?)'/);
  if (!match) return null;
  try {
    const unescaped = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return JSON.parse(unescaped);
  } catch (err) {
    console.error('Failed to parse Inertia page:', err);
    return null;
  }
}

function getImageUrl(cdnUrl: string, filename?: string): string {
  if (!filename) return '';
  if (filename.startsWith('http')) return filename;
  const cdn = (cdnUrl || 'https://cdn.streamingunity.win').replace(/\/+$/, '');
  return `${cdn}/images/${filename}`;
}

function parseTitleToMultimediaItem(title: any, cdnUrl: string): MultimediaItem {
  const posterImg = title.images?.find((img: any) => img.type === 'poster')?.filename ||
                    title.images?.find((img: any) => img.type === 'cover')?.filename;
  const bannerImg = title.images?.find((img: any) => img.type === 'background')?.filename ||
                    title.images?.find((img: any) => img.type === 'cover_mobile')?.filename;

  const plotTranslation = title.translations?.find((t: any) => t.key === 'plot')?.value || title.plot || '';
  const itemType = title.type === 'tv' ? 'series' : 'movie';
  const itemUrl = `${manifest.baseUrl}/it/titles/${title.id}-${title.slug}`;

  return new MultimediaItem({
    title: title.name || 'Senza Titolo',
    url: itemUrl,
    posterUrl: getImageUrl(cdnUrl, posterImg),
    bannerUrl: getImageUrl(cdnUrl, bannerImg),
    type: itemType,
    score: title.score ? parseFloat(title.score) : undefined,
    description: plotTranslation,
    contentRating: title.age ? `${title.age}+` : undefined
  });
}

export async function getHome(cb: (res: Result<Record<string, MultimediaItem[]>>) => void) {
  try {
    const homeUrl = `${manifest.baseUrl}/it`;
    const res = await get(homeUrl);
    const inertia = extractInertiaPage(res.body);

    if (!inertia || !inertia.props) {
      return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Could not extract Inertia props' });
    }

    const cdnUrl = inertia.props.cdn_url || 'https://cdn.streamingunity.win';
    const sliders = inertia.props.sliders || [];
    const result: Record<string, MultimediaItem[]> = {};

    for (const slider of sliders) {
      const titles = slider.titles || [];
      if (titles.length === 0) continue;

      const items = titles.map((t: any) => parseTitleToMultimediaItem(t, cdnUrl));
      const sName = (slider.name || '').toLowerCase();
      let catName = slider.label || slider.name || 'Popolari';

      // Map to reserved "Trending" for SkyStream Carousel
      if (sName === 'trending' || sName === 'top10') {
        if (!result['Trending']) {
          result['Trending'] = items;
          continue;
        }
      }

      result[catName] = items;
    }

    // Ensure Trending exists
    if (!result['Trending']) {
      const firstCat = Object.keys(result)[0];
      if (firstCat && result[firstCat]) {
        result['Trending'] = result[firstCat];
      }
    }

    cb({ success: true, data: result });
  } catch (err: any) {
    cb({ success: false, errorCode: 'NETWORK_ERROR', message: err.message });
  }
}

export async function search(query: string, cb: (res: Result<MultimediaItem[]>) => void) {
  try {
    const cleanQ = query.trim();
    const searchUrl = `${manifest.baseUrl}/it/search?q=${encodeURIComponent(cleanQ)}`;
    const res = await get(searchUrl);
    const inertia = extractInertiaPage(res.body);

    if (!inertia || !inertia.props) {
      return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Could not extract search props' });
    }

    const cdnUrl = inertia.props.cdn_url || 'https://cdn.streamingunity.win';
    const titles = inertia.props.titles || [];
    const items: MultimediaItem[] = titles.map((t: any) => parseTitleToMultimediaItem(t, cdnUrl));

    // If few results found or none match the app query tokens directly, fetch aliases (e.g. English <-> Italian)
    const hasDirectMatch = items.some(i => matchesAppQuery(i.title, cleanQ));
    if (items.length < 3 || !hasDirectMatch) {
      try {
        const aliases = await fetchMovieSeriesAliases(cleanQ);
        const seenUrls = new Set(items.map(i => i.url));

        const aliasPromises = aliases.slice(0, 3).map(async (alias) => {
          try {
            const aliasUrl = `${manifest.baseUrl}/it/search?q=${encodeURIComponent(alias)}`;
            const aRes = await get(aliasUrl);
            const aInertia = extractInertiaPage(aRes.body);
            if (aInertia?.props?.titles) {
              const aCdn = aInertia.props.cdn_url || cdnUrl;
              return aInertia.props.titles.map((t: any) => parseTitleToMultimediaItem(t, aCdn));
            }
            return [];
          } catch {
            return [];
          }
        });

        const aliasLists = await Promise.all(aliasPromises);
        for (const list of aliasLists) {
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
    // Ensure URL has current base
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = `${manifest.baseUrl}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    const res = await get(targetUrl);
    const inertia = extractInertiaPage(res.body);

    if (!inertia || !inertia.props || !inertia.props.title) {
      return cb({ success: false, errorCode: 'NOT_FOUND', message: 'Title not found in props' });
    }

    const title = inertia.props.title;
    const cdnUrl = inertia.props.cdn_url || 'https://cdn.streamingunity.win';
    const item = parseTitleToMultimediaItem(title, cdnUrl);

    if (title.genres && Array.isArray(title.genres)) {
      item.tags = title.genres.map((g: any) => g.name);
    }
    if (title.release_date) {
      item.year = parseInt(title.release_date.split('-')[0], 10);
    }
    if (title.runtime) {
      item.duration = parseInt(title.runtime, 10);
    }

    if (title.main_actors && Array.isArray(title.main_actors)) {
      item.cast = title.main_actors.map((a: any) => new Actor({ name: a.name }));
    }

    if (title.trailers && Array.isArray(title.trailers)) {
      item.trailers = title.trailers
        .filter((tr: any) => tr.youtube_id)
        .map((tr: any) => new Trailer({ url: `https://www.youtube.com/watch?v=${tr.youtube_id}` }));
    }

    if (title.type === 'tv') {
      item.type = 'series';
      const episodes: Episode[] = [];
      const seasons = title.seasons || [];

      // Currently loaded season episodes
      const loadedSeason = inertia.props.loadedSeason;
      const loadedEpisodesMap = new Map<number, any[]>();
      if (loadedSeason && loadedSeason.episodes) {
        loadedEpisodesMap.set(loadedSeason.number, loadedSeason.episodes);
      }

      for (const season of seasons) {
        let epList = loadedEpisodesMap.get(season.number);

        // If season episodes are not in loadedSeason, fetch them via season URL
        if (!epList) {
          try {
            const seasonUrl = `${manifest.baseUrl}/it/titles/${title.id}-${title.slug}/season-${season.number}`;
            const sRes = await get(seasonUrl);
            const sInertia = extractInertiaPage(sRes.body);
            if (sInertia?.props?.loadedSeason?.episodes) {
              epList = sInertia.props.loadedSeason.episodes;
            }
          } catch {
            epList = [];
          }
        }

        if (epList && Array.isArray(epList)) {
          for (const ep of epList) {
            const epCover = ep.images?.find((i: any) => i.type === 'cover')?.filename;
            const epStreamUrl = `${manifest.baseUrl}/it/iframe/${title.id}?episode_id=${ep.id}&canPlayFHD=1`;

            episodes.push(new Episode({
              name: ep.name || `Episodio ${ep.number}`,
              url: epStreamUrl,
              season: season.number,
              episode: ep.number,
              description: ep.plot || '',
              posterUrl: getImageUrl(cdnUrl, epCover),
              runtime: ep.duration ? parseInt(ep.duration, 10) : undefined
            }));
          }
        }
      }

      item.episodes = episodes;
    } else {
      // Movie
      item.type = 'movie';
      const movieStreamUrl = `${manifest.baseUrl}/it/iframe/${title.id}?canPlayFHD=1`;
      item.episodes = [
        new Episode({
          name: title.name,
          url: movieStreamUrl,
          season: 1,
          episode: 1,
          description: item.description,
          posterUrl: item.posterUrl
        })
      ];
    }

    cb({ success: true, data: item });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_ERROR', message: err.message });
  }
}

export async function loadStreams(url: string, cb: (res: Result<StreamResult[]>) => void) {
  try {
    let iframeUrl = url;

    // If a title page URL was passed instead of an iframe URL, resolve it to the movie iframe
    if (url.includes('/titles/') && !url.includes('/iframe/')) {
      const matchId = url.match(/\/titles\/(\d+)/);
      if (matchId) {
        iframeUrl = `${manifest.baseUrl}/it/iframe/${matchId[1]}?canPlayFHD=1`;
      }
    }

    const res = await get(iframeUrl, {
      headers: {
        'Referer': manifest.baseUrl
      }
    });

    // In StreamingCommunity, the /it/iframe/... endpoint returns HTML with <iframe src="https://vixcloud.co/embed/...">
    const iframeSrcMatch = res.body.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    let videoEmbedUrl = '';

    if (iframeSrcMatch) {
      videoEmbedUrl = iframeSrcMatch[1];
    } else {
      // If it contains direct vixcloud embed or script
      const vixMatch = res.body.match(/https?:\/\/[a-zA-Z0-9.-]*vixcloud[a-zA-Z0-9.-]*\/[^\s"'<>]+/i);
      if (vixMatch) {
        videoEmbedUrl = vixMatch[0];
      }
    }

    if (!videoEmbedUrl) {
      // Check if the current page itself is the VixCloud player
      if (res.body.includes('masterPlaylist')) {
        const streams = await extractVixCloud(iframeUrl, {
          sourceName: 'StreamingCommunity',
          referer: manifest.baseUrl
        });
        return cb({ success: true, data: streams });
      }
      return cb({ success: false, errorCode: 'NO_IFRAME', message: 'No video embed found in iframe page' });
    }

    const streams = await extractVixCloud(videoEmbedUrl, {
      sourceName: 'StreamingCommunity',
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
