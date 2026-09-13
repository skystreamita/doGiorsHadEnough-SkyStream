import { get, parseJsonSafe } from './http';

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

export async function fetchMovieSeriesAliases(query: string): Promise<string[]> {
  const cleanQ = query.trim().toLowerCase();
  if (cleanQ.length < 2) return [];

  const aliases = new Set<string>();

  const addAlias = (val?: string) => {
    if (!val) return;
    const clean = val.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (clean && clean.toLowerCase() !== cleanQ && clean.length >= 2) {
      aliases.add(clean);
    }
  };

  const tasks = [
    // 1. Cinemeta (Stremio) - maps English & Italian titles for both movies and series
    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          get(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`).catch(() => null),
          get(`https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(query)}.json`).catch(() => null)
        ]);
        if (mRes && mRes.body) {
          const mData = parseJsonSafe(mRes.body);
          if (mData?.metas?.[0]?.name) addAlias(mData.metas[0].name);
        }
        if (sRes && sRes.body) {
          const sData = parseJsonSafe(sRes.body);
          if (sData?.metas?.[0]?.name) addAlias(sData.metas[0].name);
        }
      } catch {}
    })(),

    // 2. TVMaze (TV shows: original title & Italian AKAs)
    (async () => {
      try {
        const r = await get(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}&embed=akas`);
        if (r && r.body) {
          const d = parseJsonSafe(r.body);
          if (d) {
            addAlias(d.name);
            const akas = d._embedded?.akas;
            if (Array.isArray(akas)) {
              for (const aka of akas) {
                if (aka.country?.code === 'IT' || !aka.country) {
                  addAlias(aka.name);
                }
              }
            }
          }
        }
      } catch {}
    })(),

    // 3. Italian Wikipedia (Finds Italian translation of English titles)
    (async () => {
      try {
        const url = `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const r = await get(url, { headers: { 'User-Agent': 'SkyStreamITA/1.0 (https://github.com/skystreamita)' } });
        if (r && r.body) {
          const data = parseJsonSafe(r.body);
          const first = data?.query?.search?.[0]?.title;
          if (first) addAlias(first);
        }
      } catch {}
    })()
  ];

  await Promise.all(tasks);
  return Array.from(aliases).slice(0, 4);
}
