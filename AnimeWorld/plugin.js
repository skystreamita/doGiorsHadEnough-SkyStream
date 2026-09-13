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
      Media (search: $search, type: ANIME) {
        id
        idMal
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
        const media = data?.data?.Media;
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
  async function fetchTitleAliases(query) {
    if (!query || query.trim().length < 2) return [];
    const gqlQuery = `
    query ($search: String) {
      Media (search: $search, type: ANIME) {
        title {
          romaji
          english
        }
        synonyms
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
        const media = data?.data?.Media;
        if (media) {
          const candidates = /* @__PURE__ */ new Set();
          if (media.title?.romaji) candidates.add(media.title.romaji);
          if (media.title?.english) candidates.add(media.title.english);
          if (Array.isArray(media.synonyms)) {
            for (const s of media.synonyms) {
              if (/^[a-zA-Z0-9\s':.,!?'-]+$/.test(s) && s.length > 2) {
                candidates.add(s);
              }
            }
          }
          const qLower = query.trim().toLowerCase();
          return Array.from(candidates).filter((c) => c.toLowerCase() !== qLower);
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch title aliases for "${query}":`, err);
    }
    return [];
  }

  // AnimeWorld/plugin.ts
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
      const rawTitle = nameMatch[1].replace(/<[^>]+>/g, "").trim();
      const cleanTitle = rawTitle.replace(/\s*\(ITA\)\s*$/i, "");
      const isDub = block.includes('class="dub"') || rawTitle.includes("(ITA)");
      items.push(new MultimediaItem({
        title: cleanTitle,
        url: fullUrl,
        posterUrl,
        type: "anime",
        status: "ongoing",
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
          for (const alias of aliases.slice(0, 3)) {
            const aliasUrl = `${manifest.baseUrl}/filter?sort=0&keyword=${encodeURIComponent(alias)}`;
            const aliasRes = await get(aliasUrl);
            const aliasItems = parseHtmlItems(aliasRes.body);
            for (const item of aliasItems) {
              if (!seenUrls.has(item.url)) {
                seenUrls.add(item.url);
                items.push(item);
              }
            }
            if (items.length >= 10) break;
          }
        } catch {
        }
      }
      cb({ success: true, data: items });
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
      const cleanTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s*\(ITA\)\s*$/i, "").trim() : "Anime";
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
          episode: epNum
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
      const item = new MultimediaItem({
        title: cleanTitle,
        url: targetUrl,
        posterUrl,
        type: "anime",
        description,
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
