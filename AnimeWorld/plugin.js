var PluginModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // AnimeWorld/plugin.ts
  var plugin_exports = {};
  __export(plugin_exports, {
    getHome: () => getHome,
    load: () => load,
    loadStreams: () => loadStreams,
    search: () => search
  });

  // src/utils/http.ts
  async function get(url, options) {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      ...options?.headers || {}
    };
    try {
      const res = await http_get(url, headers);
      return res;
    } catch (err) {
      console.error(`HTTP GET error for ${url}:`, err);
      throw err;
    }
  }
  async function post(url, body, options) {
    const isJson = typeof body === "object";
    const postBody = isJson ? JSON.stringify(body) : body;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      ...isJson ? { "Content-Type": "application/json" } : {},
      ...options?.headers || {}
    };
    try {
      const res = await http_post(url, headers, postBody);
      return res;
    } catch (err) {
      console.error(`HTTP POST error for ${url}:`, err);
      throw err;
    }
  }
  function parseJsonSafe(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  // src/utils/anilist.ts
  async function fetchAniListIds(title) {
    if (!title || !title.trim()) return null;
    const clean = title.replace(/\s*\(ITA\)\s*/gi, "").replace(/\s*\(SUB ITA\)\s*/gi, "").replace(/\s*\[ITA\]\s*/gi, "").replace(/\s*\[SUB ITA\]\s*/gi, "").replace(/\s*\(Doppiaggio Italiano\)\s*/gi, "").trim();
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
      const res = await post("https://graphql.anilist.co", {
        query,
        variables: { search: clean }
      }, {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });
      if (res && res.body) {
        const data = parseJsonSafe(res.body);
        const media = data?.data?.Page?.media?.[0];
        if (media) {
          const sync = {};
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
  function isAbbreviation(str) {
    const s = str.trim();
    if (s.length <= 3) return true;
    if (/^[A-Z0-9_-]{2,5}$/.test(s)) return true;
    if (/^[A-Z][a-z]{1,2}[A-Z]/.test(s)) return true;
    return false;
  }
  async function fetchTitleAliases(query) {
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
      const res = await post("https://graphql.anilist.co", {
        query: gqlQuery,
        variables: { search: query.trim() }
      }, {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });
      if (res && res.body) {
        const data = parseJsonSafe(res.body);
        const media = data?.data?.Page?.media?.[0];
        if (media) {
          const qLower = query.trim().toLowerCase();
          const priorityList = [];
          const secondaryList = [];
          if (media.title?.romaji && media.title.romaji.toLowerCase() !== qLower) {
            priorityList.push(media.title.romaji);
          }
          if (media.title?.english && media.title.english.toLowerCase() !== qLower) {
            priorityList.push(media.title.english);
          }
          if (Array.isArray(media.synonyms)) {
            for (const s of media.synonyms) {
              const cleanS = s.trim();
              if (cleanS.length < 3 || isAbbreviation(cleanS)) continue;
              if (!/^[a-zA-Z0-9\s':.,!?'-]+$/.test(cleanS)) continue;
              if (cleanS.toLowerCase() === qLower) continue;
              if (/\b(l'|d'|il |lo |la |i |gli |le |un |una |dei |degli |delle |del |della |di |l’)\b/i.test(cleanS)) {
                priorityList.push(cleanS.replace(/’/g, "'"));
              } else {
                secondaryList.push(cleanS);
              }
            }
          }
          const seen = /* @__PURE__ */ new Set();
          const result = [];
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
  function matchesAppQuery(title, query) {
    const qParts = query.toLowerCase().split(/\s+/).filter((s) => s.length > 0);
    const tParts = title.toLowerCase().split(/\s+/).filter((s) => s.length > 0);
    return qParts.every((q) => tParts.some((t) => t.startsWith(q)));
  }
  function ensureQueryInTitle(item, query) {
    if (!matchesAppQuery(item.title, query)) {
      item.title = `${item.title} - ${query}`;
    }
    return item;
  }

  // src/utils/anime_episodes.ts
  async function fetchAnimeEpisodeMetadata(opts) {
    const epMap = /* @__PURE__ */ new Map();
    const setMeta = (num, meta) => {
      if (!num || num < 1) return;
      const existing = epMap.get(num) || {};
      epMap.set(num, {
        title: existing.title || meta.title,
        description: existing.description || meta.description,
        thumbnail: existing.thumbnail || meta.thumbnail
      });
    };
    const cleanTitle = (opts.title || "").replace(/\s*\(ITA\)\s*/gi, "").replace(/\s*\(SUB ITA\)\s*/gi, "").replace(/\s*\[ITA\]\s*/gi, "").replace(/\s*\[SUB ITA\]\s*/gi, "").trim();
    const tasks = [];
    tasks.push((async () => {
      try {
        let kitsuId = null;
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
        const pageOffsets = [];
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
                if (typeof num === "number") {
                  const epTitle = item?.attributes?.canonicalTitle || item?.attributes?.titles?.en_us || item?.attributes?.titles?.en_jp;
                  const epDesc = item?.attributes?.synopsis;
                  const epThumb = item?.attributes?.thumbnail?.original;
                  if (epTitle || epDesc || epThumb) {
                    setMeta(num, {
                      title: epTitle || void 0,
                      description: epDesc || void 0,
                      thumbnail: epThumb || void 0
                    });
                  }
                }
              }
            }
          } catch {
          }
        });
        await Promise.all(pageReqs);
      } catch (err) {
        console.warn("Kitsu episode fetch error:", err);
      }
    })());
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
                  if (typeof num === "number") {
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
          console.warn("Cinemeta episode fetch error:", err);
        }
      })());
    }
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
              if (typeof num === "number") {
                const cleanDesc = ep.summary ? ep.summary.replace(/<[^>]+>/g, "").trim() : void 0;
                setMeta(num, {
                  title: ep.name,
                  description: cleanDesc,
                  thumbnail: ep.image?.original || ep.image?.medium
                });
              }
            }
          }
        } catch (err) {
          console.warn("TVMaze episode fetch error:", err);
        }
      })());
    }
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
          const res = await post("https://graphql.anilist.co", {
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
                const epTitle = (match[3] || "").trim();
                if (num) {
                  setMeta(num, {
                    title: epTitle || void 0,
                    thumbnail: ep.thumbnail || void 0
                  });
                }
              }
            }
          }
        } catch (err) {
          console.warn("AniList episode fetch error:", err);
        }
      })());
    }
    await Promise.all(tasks);
    return epMap;
  }

  // AnimeWorld/plugin.ts
  function decodeHtml(str) {
    return str.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function parseHtmlItems(html) {
    const items = [];
    const itemMatches = html.matchAll(/<div class="item">([\s\S]*?)<\/div>\s*<\/div>/g);
    for (const match of itemMatches) {
      const block = match[1];
      const posterMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*class="poster"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"/i);
      const nameMatch = block.match(/<a[^>]+class="name"[^>]*>([\s\S]*?)<\/a>/i);
      if (!posterMatch || !nameMatch) continue;
      const relUrl = posterMatch[1];
      let posterUrl = posterMatch[2];
      if (posterUrl.startsWith("//")) posterUrl = "https:" + posterUrl;
      const fullUrl = relUrl.startsWith("http") ? relUrl : `${manifest.baseUrl}${relUrl.startsWith("/") ? "" : "/"}${relUrl}`;
      const rawTitle = decodeHtml(nameMatch[1].replace(/<[^>]+>/g, "").trim());
      const isDub = block.includes('class="dub"') || rawTitle.includes("(ITA)") || fullUrl.includes("-ita.");
      const cleanTitle = rawTitle.replace(/\s*\(ITA\)\s*$/i, "").replace(/\s*\(SUB ITA\)\s*$/i, "").replace(/\s*\(SUB\)\s*$/i, "").trim();
      const displayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;
      items.push(new MultimediaItem({
        title: displayTitle,
        url: fullUrl,
        posterUrl,
        type: "anime",
        status: "ongoing",
        tags: [isDub ? "DOPPIATO ITA" : "SUB ITA"],
        description: isDub ? "[DOPPIATO ITA]" : "[SUB ITA]"
      }));
    }
    return items;
  }
  async function getHome(cb) {
    try {
      const trendingRes = await get(`${manifest.baseUrl}/filter?status=0&sort=1`);
      const trendingItems = parseHtmlItems(trendingRes.body);
      const latestRes = await get(`${manifest.baseUrl}/filter?sort=1`);
      const latestItems = parseHtmlItems(latestRes.body);
      const topRes = await get(`${manifest.baseUrl}/tops/all?sort=1`);
      const topItems = parseHtmlItems(topRes.body);
      const result = {
        "Trending": trendingItems.length > 0 ? trendingItems : latestItems,
        "In Corso": trendingItems,
        "Ultimi Aggiunti": latestItems,
        "Top Anime": topItems
      };
      cb({ success: true, data: result });
    } catch (err) {
      cb({ success: false, errorCode: "HOME_ERROR", message: err.message });
    }
  }
  async function search(query, cb) {
    try {
      const cleanQ = query.trim();
      const searchUrl = `${manifest.baseUrl}/filter?sort=0&keyword=${encodeURIComponent(cleanQ)}`;
      const res = await get(searchUrl);
      const items = parseHtmlItems(res.body);
      if (items.length < 3) {
        try {
          const aliases = await fetchTitleAliases(cleanQ);
          const seenUrls = new Set(items.map((i) => i.url));
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
        }
      }
      cb({ success: true, data: items.map((item) => ensureQueryInTitle(item, cleanQ)) });
    } catch (err) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: err.message });
    }
  }
  async function load(url, cb) {
    try {
      let targetUrl = url;
      if (!targetUrl.startsWith("http")) {
        targetUrl = `${manifest.baseUrl}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
      }
      const res = await get(targetUrl);
      const html = res.body;
      const titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<div class="info">[\s\S]*?<div class="title"[^>]*>([\s\S]*?)<\/div>/i);
      const rawTitleStr = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "")).trim() : "Anime";
      const isDub = targetUrl.includes("-ita.") || html.includes('class="dub"') || rawTitleStr.includes("(ITA)");
      const cleanTitle = rawTitleStr.replace(/\s*\(ITA\)\s*$/i, "").replace(/\s*\(SUB ITA\)\s*$/i, "").replace(/\s*\(SUB\)\s*$/i, "").trim();
      const displayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;
      const posterMatch = html.match(/class="thumb">[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"/i) || html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<img[^>]+src=["'](https?:\/\/img\.animeworld\.[^"']+)["']/i);
      let posterUrl = posterMatch ? posterMatch[1] : "";
      if (posterUrl.startsWith("//")) posterUrl = "https:" + posterUrl;
      const descMatch = html.match(/<div class="desc"[^>]*>([\s\S]*?)<\/div>/i);
      let description = "";
      if (descMatch) {
        const longMatch = descMatch[1].match(/<div class="long">([\s\S]*?)<\/div>/i);
        description = (longMatch ? longMatch[1] : descMatch[1]).replace(/<[^>]+>/g, "").trim();
      }
      const scoreMatch = html.match(/id="average-vote"[^>]*>([\s\S]*?)<\//i);
      const score = scoreMatch ? parseFloat(scoreMatch[1].trim()) : void 0;
      const genreMatches = [...html.matchAll(/href="[^"]*\/genre\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
      const tags = genreMatches.map((m) => m[1].replace(/<[^>]+>/g, "").trim());
      tags.unshift(isDub ? "DOPPIATO ITA" : "SUB ITA");
      const episodes = [];
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
          dubStatus: isDub ? "dubbed" : "subbed"
        }));
      }
      episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));
      const syncData = {};
      const malMatch = html.match(/id=["']mal-button["'][^>]*href=["']([^"']+)["']/i) || html.match(/href=["'](https?:\/\/[^"']*myanimelist\.net\/anime\/(\d+)[^"']*)["']/i);
      const anilistMatch = html.match(/id=["']anilist-button["'][^>]*href=["']([^"']+)["']/i) || html.match(/href=["'](https?:\/\/[^"']*anilist\.co\/anime\/(\d+)[^"']*)["']/i);
      if (malMatch) {
        const target = malMatch[2] || malMatch[1];
        const parts = target.split("/").filter(Boolean);
        const last = parts[parts.length - 1];
        if (/^\d+$/.test(last)) syncData.mal = last;
      }
      if (anilistMatch) {
        const target = anilistMatch[2] || anilistMatch[1];
        const parts = target.split("/").filter(Boolean);
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
        } catch {
        }
      }
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
      } catch {
      }
      const item = new MultimediaItem({
        title: displayTitle,
        url: targetUrl,
        posterUrl,
        type: "anime",
        description: (isDub ? "[DOPPIATO ITA] " : "[SUB ITA] ") + description,
        score,
        tags,
        episodes,
        syncData: Object.keys(syncData).length > 0 ? syncData : void 0
      });
      cb({ success: true, data: item });
    } catch (err) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: err.message });
    }
  }
  async function loadStreams(url, cb) {
    try {
      let epApiUrl = url;
      if (!epApiUrl.includes("/api/episode/info")) {
        const idMatch = url.match(/[?&#]id=([^&#]+)/) || url.match(/\/([a-zA-Z0-9]+)$/);
        if (idMatch) {
          epApiUrl = `${manifest.baseUrl}/api/episode/info?id=${idMatch[1]}`;
        }
      }
      const res = await get(epApiUrl, {
        headers: {
          "Referer": manifest.baseUrl,
          "Accept": "application/json, text/plain, */*"
        }
      });
      let json = null;
      try {
        json = JSON.parse(res.body);
      } catch {
        return cb({ success: false, errorCode: "PARSE_ERROR", message: "Invalid episode info response" });
      }
      if (!json || !json.grabber) {
        return cb({ success: false, errorCode: "NO_STREAM", message: "No grabber URL returned" });
      }
      const streamUrl = json.grabber;
      const isDirect = streamUrl.endsWith(".mp4") || streamUrl.includes(".m3u8") || streamUrl.includes("sweetpixel") || streamUrl.includes("animeworld");
      const result = new StreamResult({
        url: streamUrl,
        source: isDirect ? "AnimeWorld Direct" : "AnimeWorld Server",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": `${manifest.baseUrl}/`
        }
      });
      cb({ success: true, data: [result] });
    } catch (err) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: err.message });
    }
  }
  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
  return __toCommonJS(plugin_exports);
})();
Object.assign(globalThis, PluginModule);
