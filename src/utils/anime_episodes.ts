import { get, post, parseJsonSafe } from './http';

export interface EpisodeMetadata {
  title?: string;
  description?: string;
  thumbnail?: string;
  rating?: number;
  runtime?: number;
  airDate?: string;
  airedAt?: number;
}

const GT_HEADERS = {
  'User-Agent': 'GoogleTranslate/6.28.0.05.421483227 (Linux; U; Android 12; Pixel 6)',
  'Accept': '*/*'
};

async function translateToItalian(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  if (/^[\d\s.:\-_#]+$/.test(text) || text.length < 3) return text;

  // 1. Google Chrome Extension Translate (clients5) - fast, reliable, no captcha
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=it&q=${encodeURIComponent(text.trim())}`;
    const res = await get(url).catch(() => null);
    if (res && res.body) {
      const data = parseJsonSafe(res.body);
      const translated = data?.[0]?.[0];
      if (translated && typeof translated === 'string') {
        return translated.trim();
      }
    }
  } catch {}

  // 2. Google Translate (client=gtx)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=it&dt=t&q=${encodeURIComponent(text.trim())}`;
    const res = await get(url, { headers: GT_HEADERS }).catch(() => null);
    if (res && res.body) {
      const data = parseJsonSafe(res.body);
      if (Array.isArray(data?.[0])) {
        const translated = data[0].map((s: any) => s?.[0] || '').join('').trim();
        if (translated) return translated;
      }
    }
  } catch {}

  // 3. MyMemory Translated fallback
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=en|it`;
    const res = await get(url).catch(() => null);
    if (res && res.body) {
      const data = parseJsonSafe(res.body);
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === 'string' && !translated.startsWith('MYMEMORY WARNING:')) {
        return translated.trim();
      }
    }
  } catch {}

  return text;
}

async function translateTitlesBatch(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return [];

  // 1. Google Chrome Extension Translate (clients5)
  try {
    const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=it&q=${encodeURIComponent(numbered)}`;
    const res = await get(url).catch(() => null);
    if (res && res.body) {
      const data = parseJsonSafe(res.body);
      const fullText = data?.[0]?.[0];
      if (fullText && typeof fullText === 'string') {
        const parsed: string[] = [];
        for (let i = 0; i < titles.length; i++) {
          const num = i + 1;
          const nextNum = i + 2;
          const regex = new RegExp(`(?:^|\\n)\\s*${num}\\.\\s*([\\s\\S]*?)(?=(?:\\n\\s*${nextNum}\\.|$))`, 'i');
          const match = fullText.match(regex);
          if (match && match[1].trim()) {
            parsed.push(match[1].trim());
          } else {
            parsed.push(titles[i]);
          }
        }
        if (parsed.length === titles.length) {
          return parsed;
        }
      }
    }
  } catch {}

  // 2. Google Translate (client=gtx)
  try {
    const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=it&dt=t&q=${encodeURIComponent(numbered)}`;
    const res = await get(url, { headers: GT_HEADERS }).catch(() => null);
    if (res && res.body) {
      const data = parseJsonSafe(res.body);
      if (Array.isArray(data?.[0])) {
        const fullText = data[0].map((s: any) => s?.[0] || '').join('');
        const parsed: string[] = [];
        for (let i = 0; i < titles.length; i++) {
          const num = i + 1;
          const nextNum = i + 2;
          const regex = new RegExp(`(?:^|\\n)\\s*${num}\\.\\s*([\\s\\S]*?)(?=(?:\\n\\s*${nextNum}\\.|$))`, 'i');
          const match = fullText.match(regex);
          if (match && match[1].trim()) {
            parsed.push(match[1].trim());
          } else {
            parsed.push(titles[i]);
          }
        }
        if (parsed.length === titles.length) {
          return parsed;
        }
      }
    }
  } catch {}

  // Fallback to sequential translation
  const fallback: string[] = [];
  for (const t of titles) {
    fallback.push(await translateToItalian(t));
  }
  return fallback;
}

export async function fetchAnimeEpisodeMetadata(opts: {
  malId?: string | number;
  anilistId?: string | number;
  title?: string;
  episodeCount?: number;
}): Promise<Map<number, EpisodeMetadata>> {
  const epMap = new Map<number, EpisodeMetadata>();

  const setMeta = (num: number, meta: EpisodeMetadata) => {
    if (!num || num < 1) return;
    const existing = epMap.get(num) || {};
    epMap.set(num, {
      title: existing.title || meta.title,
      description: existing.description || meta.description,
      thumbnail: existing.thumbnail || meta.thumbnail,
      rating: existing.rating !== undefined ? existing.rating : meta.rating,
      runtime: existing.runtime !== undefined ? existing.runtime : meta.runtime,
      airDate: existing.airDate || meta.airDate,
      airedAt: existing.airedAt !== undefined ? existing.airedAt : meta.airedAt
    });
  };

  const cleanTitle = (opts.title || '')
    .replace(/\s*\(ITA\)\s*/gi, '')
    .replace(/\s*\(SUB ITA\)\s*/gi, '')
    .replace(/\s*\[ITA\]\s*/gi, '')
    .replace(/\s*\[SUB ITA\]\s*/gi, '')
    .trim();

  const tasks: Promise<void>[] = [];

  // 1. Kitsu via MAL ID or Title (Canonical titles, descriptions, and high-res thumbnails)
  tasks.push((async () => {
    try {
      let kitsuId: string | null = null;
      if (opts.malId) {
        const mapUrl = `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${opts.malId}&include=item`;
        const mapRes = await get(mapUrl).catch(() => null);
        if (mapRes && mapRes.body) {
          const mapData = parseJsonSafe(mapRes.body);
          kitsuId = mapData?.data?.[0]?.relationships?.item?.data?.id || null;
        }
      }

      if (!kitsuId && cleanTitle) {
        const searchUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanTitle)}&page[limit]=1`;
        const searchRes = await get(searchUrl).catch(() => null);
        if (searchRes && searchRes.body) {
          const searchData = parseJsonSafe(searchRes.body);
          kitsuId = searchData?.data?.[0]?.id || null;
        }
      }

      if (!kitsuId) return;

      const totalCount = opts.episodeCount || 26;
      const pageOffsets: number[] = [];
      for (let offset = 0; offset < totalCount && offset < 100; offset += 20) {
        pageOffsets.push(offset);
      }

      const pageReqs = pageOffsets.map(async (offset) => {
        try {
          const epUrl = `https://kitsu.io/api/edge/episodes?filter[mediaId]=${kitsuId}&sort=number&page[limit]=20&page[offset]=${offset}`;
          const epRes = await get(epUrl).catch(() => null);
          if (epRes && epRes.body) {
            const epData = parseJsonSafe(epRes.body);
            const items = epData?.data || [];
            for (const item of items) {
              const num = item?.attributes?.number;
              if (typeof num === 'number') {
                const epTitle = item?.attributes?.canonicalTitle ||
                                item?.attributes?.titles?.en_us ||
                                item?.attributes?.titles?.en_jp;
                const epDesc = item?.attributes?.synopsis;
                const epThumb = item?.attributes?.thumbnail?.original;
                const epAirDate = item?.attributes?.airdate;
                const epLength = item?.attributes?.length;
                if (epTitle || epDesc || epThumb || epAirDate || epLength) {
                  setMeta(num, {
                    title: epTitle || undefined,
                    description: epDesc || undefined,
                    thumbnail: epThumb || undefined,
                    runtime: typeof epLength === 'number' ? epLength : undefined,
                    airDate: epAirDate || undefined,
                    airedAt: epAirDate ? new Date(epAirDate).getTime() : undefined
                  });
                }
              }
            }
          }
        } catch {}
      });

      await Promise.all(pageReqs);
    } catch (err) {
      console.warn('Kitsu episode fetch error:', err);
    }
  })());

  // 2. Cinemeta (Stremio metadata - covers TVDB / TMDB / IMDb with all episodes, titles, descriptions & stills)
  if (cleanTitle) {
    tasks.push((async () => {
      try {
        const sUrl = `https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(cleanTitle)}.json`;
        const sRes = await get(sUrl).catch(() => null);
        if (sRes && sRes.body) {
          const sData = parseJsonSafe(sRes.body);
          const first = sData?.metas?.[0];
          if (first?.id) {
            if (typeof first.id === 'string' && first.id.startsWith('tt')) {
              (epMap as any).imdbId = first.id;
            }
            const mUrl = `https://v3-cinemeta.strem.io/meta/series/${first.id}.json`;
            const mRes = await get(mUrl).catch(() => null);
            if (mRes && mRes.body) {
              const mData = parseJsonSafe(mRes.body);
              const videos = mData?.meta?.videos || [];
              for (const v of videos) {
                const num = v.number || v.episode;
                if (typeof num === 'number') {
                  setMeta(num, {
                    title: v.name || v.title,
                    description: v.overview || v.description,
                    thumbnail: v.thumbnail,
                    airDate: v.released || undefined,
                    airedAt: v.released ? new Date(v.released).getTime() : undefined
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Cinemeta episode fetch error:', err);
      }
    })());
  }

  // 3. TVMaze (TV shows & anime: comprehensive episodes with high-res stills and summaries)
  if (cleanTitle) {
    tasks.push((async () => {
      try {
        const tvmUrl = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}&embed=episodes`;
        const tvmRes = await get(tvmUrl).catch(() => null);
        if (tvmRes && tvmRes.body) {
          const tvmData = parseJsonSafe(tvmRes.body);
          const eps = tvmData?._embedded?.episodes || [];
          for (const ep of eps) {
            const num = ep.number;
            if (typeof num === 'number') {
              const cleanDesc = ep.summary ? ep.summary.replace(/<[^>]+>/g, '').trim() : undefined;
              setMeta(num, {
                title: ep.name,
                description: cleanDesc,
                thumbnail: ep.image?.original || ep.image?.medium,
                rating: typeof ep.rating?.average === 'number' ? ep.rating.average : undefined,
                runtime: typeof ep.runtime === 'number' ? ep.runtime : undefined,
                airDate: ep.airdate || undefined,
                airedAt: ep.airdate ? new Date(ep.airdate).getTime() : undefined
              });
            }
          }
        }
      } catch (err) {
        console.warn('TVMaze episode fetch error:', err);
      }
    })());
  }

  // 4. AniList streamingEpisodes (Provides Crunchyroll thumbnails and episode titles)
  if (opts.anilistId) {
    tasks.push((async () => {
      try {
        const gqlQuery = `
          query ($id: Int) {
            Media (id: $id, type: ANIME) {
              streamingEpisodes {
                title
                thumbnail
              }
            }
          }
        `;
        const res = await post('https://graphql.anilist.co', {
          query: gqlQuery,
          variables: { id: parseInt(String(opts.anilistId), 10) }
        }).catch(() => null);

        if (res && res.body) {
          const data = parseJsonSafe(res.body);
          const streaming = data?.data?.Media?.streamingEpisodes || [];
          for (const ep of streaming) {
            if (!ep?.title) continue;
            const match = ep.title.match(/^(?:Episode\s+(\d+)|\s*(\d+)\s*[.:\-])\s*(?:[-:]\s*)?(.*)$/i);
            if (match) {
              const num = parseInt(match[1] || match[2], 10);
              const epTitle = (match[3] || '').trim();
              if (num) {
                setMeta(num, {
                  title: epTitle || undefined,
                  thumbnail: ep.thumbnail || undefined
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('AniList episode fetch error:', err);
      }
    })());
  }

  await Promise.all(tasks);

  // Translate episode titles and descriptions to Italian
  const entries = Array.from(epMap.entries()).slice(0, 50);

  // 1. Batch translate titles in a single request (or minimal requests)
  const titleList: { num: number; title: string }[] = [];
  for (const [num, meta] of entries) {
    if (meta.title) {
      titleList.push({ num, title: meta.title });
    }
  }

  if (titleList.length > 0) {
    const rawTitles = titleList.map(t => t.title);
    const translatedTitles = await translateTitlesBatch(rawTitles);
    for (let i = 0; i < titleList.length; i++) {
      const meta = epMap.get(titleList[i].num);
      if (meta && translatedTitles[i]) {
        meta.title = translatedTitles[i];
      }
    }
  }

  // 2. Translate descriptions sequentially to prevent rate limits
  const descList: { num: number; desc: string }[] = [];
  for (const [num, meta] of entries) {
    if (meta.description) {
      descList.push({ num, desc: meta.description });
    }
  }

  for (const item of descList) {
    const translated = await translateToItalian(item.desc);
    const meta = epMap.get(item.num);
    if (meta && translated) {
      meta.description = translated;
    }
  }

  return epMap;
}
