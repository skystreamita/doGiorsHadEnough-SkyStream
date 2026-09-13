import { get, post, parseJsonSafe } from './http';

export interface EpisodeMetadata {
  title?: string;
  description?: string;
  thumbnail?: string;
}

async function translateToItalian(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  if (/^[\d\s.:\-_#]+$/.test(text) || text.length < 3) return text;
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
      thumbnail: existing.thumbnail || meta.thumbnail
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
                if (epTitle || epDesc || epThumb) {
                  setMeta(num, {
                    title: epTitle || undefined,
                    description: epDesc || undefined,
                    thumbnail: epThumb || undefined
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
                    thumbnail: v.thumbnail
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
                thumbnail: ep.image?.original || ep.image?.medium
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
  const translationTasks: Promise<void>[] = [];
  const entries = Array.from(epMap.entries()).slice(0, 50);
  for (const [, meta] of entries) {
    if (meta.title) {
      translationTasks.push((async () => {
        meta.title = await translateToItalian(meta.title!);
      })());
    }
    if (meta.description) {
      translationTasks.push((async () => {
        meta.description = await translateToItalian(meta.description!);
      })());
    }
  }
  await Promise.all(translationTasks);

  return epMap;
}
