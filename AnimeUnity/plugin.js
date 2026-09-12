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

  // AnimeUnity/plugin.ts
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

  // src/extractors/vixcloud.ts
  async function extractVixCloud(embedUrl, options) {
    try {
      const cleanEmbedUrl = embedUrl.replace(/&amp;/g, "&");
      const res = await get(cleanEmbedUrl, {
        headers: {
          "Referer": options?.referer || cleanEmbedUrl,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      if (!res || !res.body) {
        return [];
      }
      const html = res.body;
      let token = "";
      let expires = "";
      let playlistBase = "";
      let canPlayFHD = false;
      const masterPlaylistMatch = html.match(/masterPlaylist\s*=\s*\{([\s\S]*?)\}/);
      if (masterPlaylistMatch) {
        const block = masterPlaylistMatch[1];
        const tokenM = block.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
        if (tokenM) token = tokenM[1];
        const expiresM = block.match(/['"]?expires['"]?\s*:\s*['"]?([0-9]+)['"]?/);
        if (expiresM) expires = expiresM[1];
        const urlM = block.match(/['"]?url['"]?\s*:\s*['"]([^'"]+)['"]/);
        if (urlM) playlistBase = urlM[1];
      }
      if (!token) {
        const tokenM = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
        if (tokenM) token = tokenM[1];
      }
      if (!expires) {
        const expiresM = html.match(/['"]?expires['"]?\s*:\s*['"]?([0-9]+)['"]?/);
        if (expiresM) expires = expiresM[1];
      }
      if (!playlistBase) {
        const urlM = html.match(/['"]?url['"]?\s*:\s*['"](https?:\/\/[^'"]*vixcloud[^'"]*\/playlist\/[^'"]+)['"]/);
        if (urlM) playlistBase = urlM[1];
      }
      if (/canPlayFHD\s*=\s*true/i.test(html) || /['"]?canPlayFHD['"]?\s*:\s*(true|1)/i.test(html)) {
        canPlayFHD = true;
      }
      if (!playlistBase) {
        const directM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
        if (directM3u8) {
          return [
            new StreamResult({
              url: directM3u8[0],
              source: options?.sourceName || "VixCloud",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": cleanEmbedUrl
              }
            })
          ];
        }
        return [];
      }
      let finalUrl = playlistBase;
      const queryParts = [];
      if (token) queryParts.push(`token=${encodeURIComponent(token)}`);
      if (expires) queryParts.push(`expires=${encodeURIComponent(expires)}`);
      const queryString = queryParts.join("&");
      if (playlistBase.includes("?b")) {
        finalUrl = `${playlistBase.replace("?b:1", "?b=1")}${queryString ? "&" + queryString : ""}`;
      } else if (playlistBase.includes("?")) {
        finalUrl = `${playlistBase}${queryString ? "&" + queryString : ""}`;
      } else {
        finalUrl = `${playlistBase}${queryString ? "?" + queryString : ""}`;
      }
      if (canPlayFHD) {
        finalUrl += "&h=1";
      }
      return [
        new StreamResult({
          url: finalUrl,
          source: options?.sourceName || "VixCloud",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": cleanEmbedUrl
          }
        })
      ];
    } catch (err) {
      console.error("VixCloud extractor failed:", err);
      return [];
    }
  }

  // AnimeUnity/plugin.ts
  var cachedCsrfToken = "";
  var cachedCookies = "";
  async function getCsrfHeaders() {
    if (cachedCsrfToken && cachedCookies) {
      return {
        "X-CSRF-TOKEN": cachedCsrfToken,
        "Cookie": cachedCookies,
        "Referer": `${manifest.baseUrl}/archivio`,
        "X-Requested-With": "XMLHttpRequest"
      };
    }
    try {
      const res = await get(`${manifest.baseUrl}/archivio`);
      const tokenMatch = res.body.match(/<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/i);
      if (tokenMatch) cachedCsrfToken = tokenMatch[1];
      if (res.headers && res.headers["set-cookie"]) {
        const setCookies = Array.isArray(res.headers["set-cookie"]) ? res.headers["set-cookie"] : [res.headers["set-cookie"]];
        cachedCookies = setCookies.map((c) => c.split(";")[0]).join("; ");
      }
      return {
        "X-CSRF-TOKEN": cachedCsrfToken,
        "Cookie": cachedCookies,
        "Referer": `${manifest.baseUrl}/archivio`,
        "X-Requested-With": "XMLHttpRequest"
      };
    } catch (err) {
      console.error("Failed to get AnimeUnity CSRF headers:", err);
      return {
        "Referer": `${manifest.baseUrl}/archivio`,
        "X-Requested-With": "XMLHttpRequest"
      };
    }
  }
  function parseAnimeToMultimediaItem(record) {
    const displayTitle = record.title_it || record.title_eng || record.title || record.slug || "Anime";
    const cleanTitle = displayTitle.replace(/\s*\(ITA\)\s*$/i, "");
    const isDub = record.dub === 1 || record.slug && record.slug.includes("-ita");
    const score = record.score ? parseFloat(record.score) : void 0;
    const itemUrl = `${manifest.baseUrl}/anime/${record.id}-${record.slug}`;
    return new MultimediaItem({
      title: cleanTitle,
      url: itemUrl,
      posterUrl: record.imageurl || "",
      bannerUrl: record.imageurl_cover || record.imageurl || "",
      type: "anime",
      status: record.status === "In corso" ? "ongoing" : "completed",
      score,
      description: (isDub ? "[DOPPIATO ITA] " : "[SUB ITA] ") + (record.plot || "")
    });
  }
  async function getHome(cb) {
    try {
      const headers = await getCsrfHeaders();
      const popularReq = post(`${manifest.baseUrl}/archivio/get-animes`, {
        title: false,
        type: false,
        year: false,
        order: "Visite",
        status: false,
        genres: false,
        season: false,
        dubbed: 1,
        offset: 0
      }, { headers });
      const ongoingReq = post(`${manifest.baseUrl}/archivio/get-animes`, {
        title: false,
        type: false,
        year: false,
        order: false,
        status: "In corso",
        genres: false,
        season: false,
        dubbed: 1,
        offset: 0
      }, { headers });
      const latestReq = post(`${manifest.baseUrl}/archivio/get-animes`, {
        title: false,
        type: false,
        year: false,
        order: "Data",
        status: false,
        genres: false,
        season: false,
        dubbed: 1,
        offset: 0
      }, { headers });
      const [popRes, onRes, latRes] = await Promise.all([popularReq, ongoingReq, latestReq]);
      const popJson = JSON.parse(popRes.body || "{}");
      const onJson = JSON.parse(onRes.body || "{}");
      const latJson = JSON.parse(latRes.body || "{}");
      const popularItems = (popJson.records || []).map(parseAnimeToMultimediaItem);
      const ongoingItems = (onJson.records || []).map(parseAnimeToMultimediaItem);
      const latestItems = (latJson.records || []).map(parseAnimeToMultimediaItem);
      const result = {
        "Trending": popularItems.length > 0 ? popularItems : ongoingItems,
        "In Corso": ongoingItems,
        "Ultimi Aggiunti": latestItems,
        "Pi\xF9 Popolari": popularItems
      };
      cb({ success: true, data: result });
    } catch (err) {
      cb({ success: false, errorCode: "HOME_ERROR", message: err.message });
    }
  }
  async function search(query, cb) {
    try {
      const headers = await getCsrfHeaders();
      const res = await post(`${manifest.baseUrl}/archivio/get-animes`, {
        title: query.trim(),
        type: false,
        year: false,
        order: false,
        status: false,
        genres: false,
        season: false,
        dubbed: 1,
        offset: 0
      }, { headers });
      let json = {};
      try {
        json = JSON.parse(res.body);
      } catch {
        return cb({ success: false, errorCode: "PARSE_ERROR", message: "Invalid search JSON" });
      }
      const records = json.records || [];
      const items = records.map(parseAnimeToMultimediaItem);
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
      let animeData = null;
      const animeMatch = html.match(/<video-player[^>]*\s+anime=(["'])([\s\S]*?)\1/i) || html.match(/anime:\s*(\{[\s\S]*?\})\s*,\s*episodes/);
      if (animeMatch) {
        try {
          const rawJson = animeMatch[2] ? animeMatch[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&") : animeMatch[1];
          animeData = JSON.parse(rawJson);
        } catch {
        }
      }
      let episodesList = [];
      const epMatch = html.match(/<video-player[^>]*\s+episodes=(["'])([\s\S]*?)\1/i) || html.match(/episodes:\s*(\[[\s\S]*?\])/);
      if (epMatch) {
        try {
          const rawJson = epMatch[2] ? epMatch[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&") : epMatch[1];
          episodesList = JSON.parse(rawJson);
        } catch {
        }
      }
      const titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
      const displayTitle = animeData?.title_it || animeData?.title_eng || animeData?.title || (titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Anime");
      const cleanTitle = displayTitle.replace(/\s*\(ITA\)\s*$/i, "");
      const posterMatch = html.match(/class="[^"]*poster[^"]*"[^>]*img[^>]+src="([^"]+)"/i) || html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i);
      const posterUrl = animeData?.imageurl || (posterMatch ? posterMatch[1] : "");
      const descMatch = html.match(/class="[^"]*plot[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      const description = animeData?.plot || (descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "");
      const score = animeData?.score ? parseFloat(animeData.score) : void 0;
      const item = new MultimediaItem({
        title: cleanTitle,
        url: targetUrl,
        posterUrl,
        type: "anime",
        description,
        score,
        status: animeData?.status === "In corso" ? "ongoing" : "completed"
      });
      const episodes = [];
      if (episodesList && Array.isArray(episodesList) && episodesList.length > 0) {
        for (const ep of episodesList) {
          const epNum = parseFloat(ep.number) || 1;
          const epUrl = `${targetUrl}/${ep.id}`;
          episodes.push(new Episode({
            name: `Episodio ${ep.number}`,
            url: epUrl,
            season: 1,
            episode: Math.floor(epNum)
          }));
        }
      } else {
        episodes.push(new Episode({
          name: cleanTitle,
          url: targetUrl,
          season: 1,
          episode: 1
        }));
      }
      item.episodes = episodes;
      cb({ success: true, data: item });
    } catch (err) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: err.message });
    }
  }
  async function loadStreams(url, cb) {
    try {
      let targetUrl = url;
      if (!targetUrl.startsWith("http")) {
        targetUrl = `${manifest.baseUrl}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
      }
      const res = await get(targetUrl, {
        headers: {
          "Referer": manifest.baseUrl
        }
      });
      const embedMatch = res.body.match(/embed_url=["']([^"']+)["']/i);
      if (!embedMatch) {
        if (targetUrl.includes("vixcloud.co")) {
          const streams2 = await extractVixCloud(targetUrl, {
            sourceName: "AnimeUnity",
            referer: manifest.baseUrl
          });
          return cb({ success: true, data: streams2 });
        }
        return cb({ success: false, errorCode: "NO_EMBED", message: "No embed_url found in player" });
      }
      const embedUrl = embedMatch[1];
      const streams = await extractVixCloud(embedUrl, {
        sourceName: "AnimeUnity",
        referer: manifest.baseUrl
      });
      cb({ success: true, data: streams });
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
