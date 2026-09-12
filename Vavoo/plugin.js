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

  // Vavoo/plugin.ts
  var plugin_exports = {};
  __export(plugin_exports, {
    getHome: () => getHome,
    load: () => load,
    loadStreams: () => loadStreams,
    search: () => search
  });

  // src/utils/http.ts
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

  // Vavoo/plugin.ts
  var RESOLVE_UA = "MediaHubMX/2";
  var DEFAULT_POSTER = "https://raw.githubusercontent.com/doGior/doGiorsHadEnough/master/Vavoo/Vavoo.jpg";
  function itemToMultimedia(item) {
    const logoUrl = item.logo || DEFAULT_POSTER;
    const payload = JSON.stringify({
      url: item.url,
      title: item.name,
      logo: logoUrl
    });
    return new MultimediaItem({
      title: item.name,
      url: payload,
      posterUrl: logoUrl,
      bannerUrl: logoUrl,
      type: "livestream",
      description: `Canale Live: ${item.name} [${item.group}]`,
      status: "ongoing"
    });
  }
  async function getHome(cb) {
    try {
      const catalogUrl = `${manifest.baseUrl.replace(/\/+$/, "")}/mediahubmx-catalog.json`;
      const payload = {
        language: "en",
        region: "UK",
        catalogId: "iptv",
        id: "iptv",
        adult: true,
        search: "",
        sort: "name",
        filter: {
          group: "Italy"
        },
        cursor: 0,
        clientVersion: "3.0.2"
      };
      const res = await post(catalogUrl, payload, {
        headers: {
          "User-Agent": RESOLVE_UA,
          "Accept": "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "Referer": `${manifest.baseUrl}/`,
          "Origin": manifest.baseUrl
        }
      });
      const data = parseJsonSafe(res.body);
      const items = (data?.items || []).map(itemToMultimedia);
      const result = {
        "Trending": items.slice(0, 30),
        "Canali Italiani": items
      };
      cb({ success: true, data: result });
    } catch (err) {
      cb({ success: false, errorCode: "HOME_ERROR", message: err.message });
    }
  }
  async function search(query, cb) {
    try {
      const catalogUrl = `${manifest.baseUrl.replace(/\/+$/, "")}/mediahubmx-catalog.json`;
      const payload = {
        language: "en",
        region: "UK",
        catalogId: "iptv",
        id: "iptv",
        adult: true,
        search: query,
        sort: "name",
        filter: {
          group: "Italy"
        },
        cursor: 0,
        clientVersion: "3.0.2"
      };
      const res = await post(catalogUrl, payload, {
        headers: {
          "User-Agent": RESOLVE_UA,
          "Accept": "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "Referer": `${manifest.baseUrl}/`,
          "Origin": manifest.baseUrl
        }
      });
      const data = parseJsonSafe(res.body);
      const items = (data?.items || []).map(itemToMultimedia);
      cb({ success: true, data: items });
    } catch (err) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: err.message });
    }
  }
  async function load(url, cb) {
    try {
      let playUrl = url;
      let title = "Canale TV";
      let logo = DEFAULT_POSTER;
      try {
        const parsed = JSON.parse(url);
        if (parsed.url) {
          playUrl = parsed.url;
          title = parsed.title || title;
          logo = parsed.logo || logo;
        }
      } catch {
      }
      const item = new MultimediaItem({
        title,
        url: playUrl,
        posterUrl: logo,
        bannerUrl: logo,
        type: "livestream",
        description: `Diretta TV: ${title}`,
        status: "ongoing",
        episodes: [
          new Episode({
            name: `${title} (Live)`,
            url: playUrl,
            episode: 1
          })
        ]
      });
      cb({ success: true, data: item });
    } catch (err) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: err.message });
    }
  }
  async function loadStreams(streamUrl, cb) {
    try {
      let resolveTarget = streamUrl;
      try {
        const parsed = JSON.parse(streamUrl);
        if (parsed.url) resolveTarget = parsed.url;
      } catch {
      }
      const resolveEndpoint = `${manifest.baseUrl.replace(/\/+$/, "")}/mediahubmx-resolve.json`;
      const payload = {
        language: "en",
        region: "UK",
        url: resolveTarget,
        clientVersion: "3.0.2"
      };
      const res = await post(resolveEndpoint, payload, {
        headers: {
          "User-Agent": RESOLVE_UA,
          "Accept": "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "Referer": `${manifest.baseUrl}/`,
          "Origin": manifest.baseUrl
        }
      });
      const list = parseJsonSafe(res.body);
      const streams = [];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item.url && item.url.startsWith("http")) {
            streams.push(new StreamResult({
              url: item.url,
              source: "Vavoo Live (HLS)",
              headers: {
                "User-Agent": RESOLVE_UA,
                "Referer": `${manifest.baseUrl}/`
              }
            }));
          }
        }
      }
      cb({ success: true, data: streams });
    } catch (err) {
      cb({ success: false, errorCode: "LOAD_STREAMS_ERROR", message: err.message });
    }
  }
  return __toCommonJS(plugin_exports);
})();
Object.assign(globalThis, PluginModule);
