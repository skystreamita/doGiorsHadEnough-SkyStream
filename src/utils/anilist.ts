import { post, parseJsonSafe } from './http';

export interface AnimeSyncIds {
  mal?: string;
  anilist?: string;
}

export async function fetchAniListIds(title: string): Promise<AnimeSyncIds | null> {
  if (!title || !title.trim()) return null;

  // Clean title: remove (ITA), (SUB ITA), [ITA], etc.
  const clean = title
    .replace(/\s*\(ITA\)\s*/gi, '')
    .replace(/\s*\(SUB ITA\)\s*/gi, '')
    .replace(/\s*\[ITA\]\s*/gi, '')
    .replace(/\s*\[SUB ITA\]\s*/gi, '')
    .replace(/\s*\(Doppiaggio Italiano\)\s*/gi, '')
    .trim();

  const query = `
    query ($search: String) {
      Page (page: 1, perPage: 1) {
        media (search: $search, type: ANIME, sort: [POPULARITY_DESC, SEARCH_MATCH]) {
          id
          idMal
        }
      }
    }
  `;

  try {
    const res = await post('https://graphql.anilist.co', {
      query,
      variables: { search: clean }
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (res && res.body) {
      const data = parseJsonSafe(res.body);
      const media = data?.data?.Page?.media?.[0];
      if (media) {
        const sync: AnimeSyncIds = {};
        if (media.idMal) sync.mal = String(media.idMal);
        if (media.id) sync.anilist = String(media.id);
        return Object.keys(sync).length > 0 ? sync : null;
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch AniList IDs for "${title}":`, err);
  }

  return null;
}

function isAbbreviation(str: string): boolean {
  const s = str.trim();
  if (s.length <= 3) return true;
  if (/^[A-Z0-9_-]{2,5}$/.test(s)) return true; // e.g. AOT, SNK, BNHA, OP, KNY
  if (/^[A-Z][a-z]{1,2}[A-Z]/.test(s)) return true; // e.g. SnK, AoT, KnY
  return false;
}

export async function fetchTitleAliases(query: string): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];

  const gqlQuery = `
    query ($search: String) {
      Page (page: 1, perPage: 1) {
        media (search: $search, type: ANIME, sort: [POPULARITY_DESC, SEARCH_MATCH]) {
          title {
            romaji
            english
          }
          synonyms
        }
      }
    }
  `;

  try {
    const res = await post('https://graphql.anilist.co', {
      query: gqlQuery,
      variables: { search: query.trim() }
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (res && res.body) {
      const data = parseJsonSafe(res.body);
      const media = data?.data?.Page?.media?.[0];
      if (media) {
        const qLower = query.trim().toLowerCase();
        const priorityList: string[] = [];
        const secondaryList: string[] = [];

        // 1. Romaji title (Predominant format on AnimeWorld & AnimeUnity)
        if (media.title?.romaji && media.title.romaji.toLowerCase() !== qLower) {
          priorityList.push(media.title.romaji);
        }

        // 2. English title
        if (media.title?.english && media.title.english.toLowerCase() !== qLower) {
          priorityList.push(media.title.english);
        }

        // 3. Synonyms
        if (Array.isArray(media.synonyms)) {
          for (const s of media.synonyms) {
            const cleanS = s.trim();
            if (cleanS.length < 3 || isAbbreviation(cleanS)) continue;
            // Only Latin / European characters
            if (!/^[a-zA-Z0-9\s':.,!?'-]+$/.test(cleanS)) continue;
            if (cleanS.toLowerCase() === qLower) continue;

            // Prioritize Italian synonyms
            if (/\b(l'|d'|il |lo |la |i |gli |le |un |una |dei |degli |delle |del |della |di |l’)\b/i.test(cleanS)) {
              priorityList.push(cleanS.replace(/’/g, "'"));
            } else {
              secondaryList.push(cleanS);
            }
          }
        }

        // Deduplicate while preserving priority order
        const seen = new Set<string>();
        const result: string[] = [];
        for (const item of [...priorityList, ...secondaryList]) {
          const low = item.toLowerCase();
          if (!seen.has(low) && low !== qLower) {
            seen.add(low);
            result.push(item);
          }
        }

        return result.slice(0, 4);
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch title aliases for "${query}":`, err);
  }

  return [];
}

export function matchesAppQuery(title: string, query: string): boolean {
  const qParts = query.toLowerCase().split(/\s+/).filter(s => s.length > 0);
  const tParts = title.toLowerCase().split(/\s+/).filter(s => s.length > 0);
  return qParts.every(q => tParts.some(t => t.startsWith(q)));
}

export function ensureQueryInTitle<T extends { title: string }>(item: T, query: string): T {
  if (!matchesAppQuery(item.title, query)) {
    item.title = `${item.title} - ${query}`;
  }
  return item;
}
