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

  // TV/plugin.ts
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

  // TV/plugin.ts
  function parseM3U(content) {
    const lines = content.split("\n");
    const channels = [];
    let currentInfo = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXTINF:")) {
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const idMatch = line.match(/tvg-id="([^"]+)"/);
        const nameMatch = line.match(/tvg-name="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);
        const title = line.split(",").pop()?.trim() || nameMatch?.[1] || "Sconosciuto";
        currentInfo = {
          title,
          logo: logoMatch ? logoMatch[1] : "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500",
          id: idMatch ? idMatch[1] : title,
          group: groupMatch ? groupMatch[1] : "Generale"
        };
      } else if (line && !line.startsWith("#") && currentInfo) {
        channels.push({
          title: currentInfo.title || "Canale",
          logo: currentInfo.logo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500",
          id: currentInfo.id || currentInfo.title || "Canale",
          group: currentInfo.group || "Generale",
          url: line
        });
        currentInfo = null;
      }
    }
    return channels;
  }
  function channelToMultimedia(channel) {
    const payload = JSON.stringify({
      url: channel.url,
      title: channel.title,
      logo: channel.logo
    });
    return new MultimediaItem({
      title: channel.title,
      url: payload,
      posterUrl: channel.logo,
      bannerUrl: channel.logo,
      type: "livestream",
      description: `Canale Live: ${channel.title} [${channel.group}]`,
      status: "ongoing"
    });
  }
  async function getHome(cb) {
    try {
      const m3uUrl = manifest.baseUrl;
      const res = await get(m3uUrl);
      const channels = parseM3U(res.body);
      const result = {};
      const items = channels.map(channelToMultimedia);
      result["Trending"] = items.slice(0, 25);
      result["Tutti i Canali"] = items;
      const groups = {};
      for (const ch of channels) {
        if (ch.group && ch.group !== "Generale" && ch.group !== "Italy") {
          if (!groups[ch.group]) groups[ch.group] = [];
          groups[ch.group].push(channelToMultimedia(ch));
        }
      }
      for (const [groupName, groupItems] of Object.entries(groups)) {
        if (groupItems.length >= 2) {
          result[groupName] = groupItems;
        }
      }
      cb({ success: true, data: result });
    } catch (err) {
      cb({ success: false, errorCode: "HOME_ERROR", message: err.message });
    }
  }
  async function search(query, cb) {
    try {
      const m3uUrl = manifest.baseUrl;
      const res = await get(m3uUrl);
      const channels = parseM3U(res.body);
      const q = query.toLowerCase().trim();
      const matches = channels.filter(
        (ch) => ch.title.toLowerCase().includes(q) || ch.id.toLowerCase().includes(q) || ch.group.toLowerCase().includes(q)
      );
      cb({ success: true, data: matches.map(channelToMultimedia) });
    } catch (err) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: err.message });
    }
  }
  async function load(url, cb) {
    try {
      let streamUrl = url;
      let title = "Canale TV";
      let logo = "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500";
      try {
        const parsed = JSON.parse(url);
        if (parsed.url) {
          streamUrl = parsed.url;
          title = parsed.title || title;
          logo = parsed.logo || logo;
        }
      } catch {
      }
      const item = new MultimediaItem({
        title,
        url: streamUrl,
        posterUrl: logo,
        bannerUrl: logo,
        type: "livestream",
        description: `Diretta TV: ${title}`,
        status: "ongoing",
        episodes: [
          new Episode({
            name: `${title} (Live)`,
            url: streamUrl,
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
      let finalUrl = streamUrl;
      try {
        const parsed = JSON.parse(streamUrl);
        if (parsed.url) finalUrl = parsed.url;
      } catch {
      }
      cb({
        success: true,
        data: [
          new StreamResult({
            url: finalUrl,
            source: "Live TV (HLS)"
          })
        ]
      });
    } catch (err) {
      cb({ success: false, errorCode: "LOAD_STREAMS_ERROR", message: err.message });
    }
  }
  return __toCommonJS(plugin_exports);
})();
Object.assign(globalThis, PluginModule);
