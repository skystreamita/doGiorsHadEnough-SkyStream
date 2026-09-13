import { get, post, parseJsonSafe } from './http';

export interface EpisodeMetadata {
  title?: string;
  description?: string;
  thumbnail?: string;
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
      title: meta.title || existing.title,
      description: meta.description || existing.description,
      thumbnail: meta.thumbnail || existing.thumbnail
    });
  };

  const tasks: Promise<void>[] = [];

  // 1. Kitsu via MAL ID or Title (Provides canonical titles, descriptions, and high-res thumbnails)
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

      if (!kitsuId && opts.title) {
        const cleanTitle = opts.title.replace(/\s*\(ITA\)\s*/gi, '').replace(/\s*\(SUB ITA\)\s*/gi, '').trim();
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
      // Kitsu max page size is 20, fetch up to 100 episodes concurrently
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
                setMeta(num, {
                  title: epTitle || undefined,
                  description: epDesc || undefined,
                  thumbnail: epThumb || undefined
                });
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

  // 2. AniList streamingEpisodes (Provides Crunchyroll thumbnails and episode titles)
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
            // Match "Episode 1 - Title" or "1. Title" or "Episode 1: Title"
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
  return epMap;
}
