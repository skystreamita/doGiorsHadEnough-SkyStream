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
      const searchUrl = `${manifest.baseUrl}/filter?sort=0&keyword=${encodeURIComponent(query.trim())}`;
      const res = await get(searchUrl);
      const items = parseHtmlItems(res.body);
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
      const posterMatch = html.match(/class="thumb">[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"/i);
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
      const item = new MultimediaItem({
        title: cleanTitle,
        url: targetUrl,
        posterUrl,
        type: "anime",
        description,
        score,
        tags,
        episodes
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
