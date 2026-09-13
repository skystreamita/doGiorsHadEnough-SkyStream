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
      Media (search: $search, type: ANIME) {
        id
        idMal
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
      const media = data?.data?.Media;
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
