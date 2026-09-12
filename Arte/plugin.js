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

  // Arte/plugin.ts
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

  // Arte/plugin.ts
  var ARTE_AUTH = "Bearer YTEwZWE3M2UxMTVmYmRjZmE0YTdmNjA4ZTI2NDczZDU3YjdjYmVmMmRmNGFjOTM3M2RhNTM5ZjIxYmI3NTc1Zg";
  function parseArteItem(item) {
    if (!item || !item.url) return null;
    if (item.kind?.code === "EXTERNAL") return null;
    const rawTitle = item.subtitle ? `${item.title} - ${item.subtitle}` : item.title;
    const isSeries = item.kind?.isCollection === true;
    const rawImg = item.mainImage?.url || item.image?.url || "";
    const imgUrl = rawImg ? rawImg.replace("__SIZE__", "500x750") : "";
    const bannerUrl = rawImg ? rawImg.replace("__SIZE__", "940x530") : "";
    return new MultimediaItem({
      title: rawTitle || "Arte",
      url: item.url,
      posterUrl: imgUrl,
      bannerUrl,
      type: isSeries ? "series" : "movie",
      description: item.shortDescription || item.description || ""
    });
  }
  async function getHome(cb) {
    try {
      const apiUrl = "https://api.arte.tv/api/emac/v4/it/web/pages/HOME";
      const res = await get(apiUrl, {
        headers: {
          "Authorization": ARTE_AUTH,
          "Accept": "application/json"
        }
      });
      const json = JSON.parse(res.body || "{}");
      const zones = json.zones || [];
      const result = {};
      for (const zone of zones) {
        const title = (zone.title || "").trim();
        const rawData = zone.content?.data || [];
        if (!title || rawData.length === 0) continue;
        const items = rawData.map(parseArteItem).filter((i) => i !== null);
        if (items.length === 0) continue;
        if (!result["Trending"]) {
          result["Trending"] = items;
        }
        result[title] = items;
      }
      if (!result["Trending"]) {
        const firstKey = Object.keys(result)[0];
        if (firstKey) result["Trending"] = result[firstKey];
      }
      cb({ success: true, data: result });
    } catch (err) {
      cb({ success: false, errorCode: "HOME_ERROR", message: err.message });
    }
  }
  async function search(query, cb) {
    try {
      const searchUrl = `https://api.arte.tv/api/emac/v4/it/web/pages/SEARCH/?page=1&query=${encodeURIComponent(query.trim())}`;
      const res = await get(searchUrl, {
        headers: {
          "Authorization": ARTE_AUTH,
          "Accept": "application/json"
        }
      });
      const json = JSON.parse(res.body || "{}");
      const rawData = json.zones?.[0]?.content?.data || [];
      const items = rawData.map(parseArteItem).filter((i) => i !== null);
      cb({ success: true, data: items });
    } catch (err) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: err.message });
    }
  }
  async function load(url, cb) {
    try {
      const res = await get(url, {
        headers: {
          "Cookie": "ABV=A; validated-age=1",
          "Referer": `${manifest.baseUrl}/it/`
        }
      });
      const html = res.body;
      const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s*-\s*ARTE.*$/i, "").trim() : "Arte Video";
      const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
      const description = descMatch ? descMatch[1] : "";
      const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
      const posterUrl = imgMatch ? imgMatch[1] : "";
      const isCollection = url.includes("/RC-") || html.includes("collection_subcollection_RC-");
      const item = new MultimediaItem({
        title: rawTitle,
        url,
        posterUrl,
        type: isCollection ? "series" : "movie",
        description
      });
      const epMatches = [...html.matchAll(/<a[^>]+href="([^"]*\/it\/videos\/[^"]*)"[^>]*class="[^"]*teaser[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
      if (epMatches.length > 0) {
        item.type = "series";
        const episodes = [];
        let epIdx = 1;
        for (const m of epMatches) {
          const epUrl = m[1].startsWith("http") ? m[1] : `${manifest.baseUrl}${m[1]}`;
          const epTitleMatch = m[2].match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
          const epTitle = epTitleMatch ? epTitleMatch[1].replace(/<[^>]+>/g, "").trim() : `Episodio ${epIdx}`;
          episodes.push(new Episode({
            name: epTitle,
            url: epUrl,
            season: 1,
            episode: epIdx++
          }));
        }
        item.episodes = episodes;
      } else {
        item.episodes = [
          new Episode({
            name: rawTitle,
            url,
            season: 1,
            episode: 1,
            posterUrl
          })
        ];
      }
      cb({ success: true, data: item });
    } catch (err) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: err.message });
    }
  }
  async function loadStreams(url, cb) {
    try {
      const res = await get(url, {
        headers: {
          "Cookie": "ABV=A; validated-age=1",
          "Referer": `${manifest.baseUrl}/it/`
        }
      });
      const html = res.body;
      const akamaizedMatch = html.match(/https:\/\/manifest-arte\.akamaized\.net\/[^\s"'<>]+\.m3u8/i);
      if (akamaizedMatch) {
        return cb({
          success: true,
          data: [
            new StreamResult({
              url: akamaizedMatch[0],
              source: "Arte HLS",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": `${manifest.baseUrl}/`
              }
            })
          ]
        });
      }
      const anyM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (anyM3u8) {
        return cb({
          success: true,
          data: [
            new StreamResult({
              url: anyM3u8[0],
              source: "Arte",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": `${manifest.baseUrl}/`
              }
            })
          ]
        });
      }
      cb({ success: false, errorCode: "NO_STREAM", message: "No playable stream found for Arte" });
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
