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

  // StreamingCommunity/plugin.ts
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
  function parseJsonSafe(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
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
      let subtitles = [];
      try {
        const masterRes = await get(finalUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": cleanEmbedUrl
          }
        });
        if (masterRes && masterRes.body) {
          const lines = masterRes.body.split("\n");
          const subLines = lines.filter((l) => l.includes("TYPE=SUBTITLES"));
          if (subLines.length > 0) {
            const parsedSubs = [];
            for (const line of subLines) {
              const nameMatch = line.match(/NAME="([^"]+)"/);
              const langMatch = line.match(/LANGUAGE="([^"]+)"/);
              const uriMatch = line.match(/URI="([^"]+)"/);
              if (!nameMatch || !uriMatch) continue;
              const name = nameMatch[1];
              const lang = langMatch ? langMatch[1] : "und";
              const uri = uriMatch[1];
              const isForced = /forced/i.test(name) || /forzat/i.test(name) || /FORCED=YES/i.test(line);
              const isItalian = /ita/i.test(name) || /ita/i.test(lang);
              parsedSubs.push({
                name,
                lang,
                uri,
                isForced,
                isItalian
              });
            }
            parsedSubs.sort((a, b) => {
              const aItaForced = a.isItalian && a.isForced;
              const bItaForced = b.isItalian && b.isForced;
              if (aItaForced && !bItaForced) return -1;
              if (!aItaForced && bItaForced) return 1;
              if (a.isForced && !b.isForced) return -1;
              if (!a.isForced && b.isForced) return 1;
              if (a.isItalian && !b.isItalian) return -1;
              if (!a.isItalian && b.isItalian) return 1;
              return a.name.localeCompare(b.name);
            });
            const hasForced = parsedSubs.some((s) => s.isForced);
            parsedSubs.forEach((s, idx) => {
              if (hasForced) {
                s.default = s.isForced && idx === 0;
              } else {
                s.default = idx === 0 && s.isItalian;
              }
            });
            for (let i = 0; i < Math.min(parsedSubs.length, 5); i++) {
              const s = parsedSubs[i];
              try {
                const subRes = await get(s.uri, {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Referer": cleanEmbedUrl
                  }
                });
                if (subRes && subRes.body) {
                  const vttMatch = subRes.body.match(/https?:\/\/[^\s"'<>\r\n]+\.vtt[^\s"'<>\r\n]*/i);
                  if (vttMatch) {
                    s.url = vttMatch[0];
                  }
                }
              } catch {
              }
              if (!s.url) {
                s.url = s.uri;
              }
            }
            for (let i = 5; i < parsedSubs.length; i++) {
              parsedSubs[i].url = parsedSubs[i].uri;
            }
            subtitles = parsedSubs.map((s) => ({
              url: s.url,
              label: s.name,
              name: s.name,
              lang: s.lang,
              default: !!s.default
            }));
          }
        }
      } catch (subErr) {
        console.warn("Could not extract VixCloud subtitles:", subErr);
      }
      return [
        new StreamResult({
          url: finalUrl,
          source: options?.sourceName || "VixCloud",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": cleanEmbedUrl
          },
          subtitles: subtitles.length > 0 ? subtitles : void 0
        })
      ];
    } catch (err) {
      console.error("VixCloud extractor failed:", err);
      return [];
    }
  }

  // src/utils/media_aliases.ts
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
  async function fetchMovieSeriesAliases(query) {
    const cleanQ = query.trim().toLowerCase();
    if (cleanQ.length < 2) return [];
    const aliases = /* @__PURE__ */ new Set();
    const addAlias = (val) => {
      if (!val) return;
      const clean = val.replace(/\s*\([^)]*\)\s*$/, "").trim();
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
        } catch {
        }
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
                  if (aka.country?.code === "IT" || !aka.country) {
                    addAlias(aka.name);
                  }
                }
              }
            }
          }
        } catch {
        }
      })(),
      // 3. Italian Wikipedia (Finds Italian translation of English titles)
      (async () => {
        try {
          const url = `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
          const r = await get(url, { headers: { "User-Agent": "SkyStreamITA/1.0 (https://github.com/skystreamita)" } });
          if (r && r.body) {
            const data = parseJsonSafe(r.body);
            const first = data?.query?.search?.[0]?.title;
            if (first) addAlias(first);
          }
        } catch {
        }
      })()
    ];
    await Promise.all(tasks);
    return Array.from(aliases).slice(0, 4);
  }

  // StreamingCommunity/plugin.ts
  function extractInertiaPage(html) {
    const match = html.match(/data-page="([\s\S]*?)"/) || html.match(/data-page='([\s\S]*?)'/);
    if (!match) return null;
    try {
      const unescaped = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      return JSON.parse(unescaped);
    } catch (err) {
      console.error("Failed to parse Inertia page:", err);
      return null;
    }
  }
  function getImageUrl(cdnUrl, filename) {
    if (!filename) return "";
    if (filename.startsWith("http")) return filename;
    const cdn = (cdnUrl || "https://cdn.streamingunity.win").replace(/\/+$/, "");
    return `${cdn}/images/${filename}`;
  }
  function parseTitleToMultimediaItem(title, cdnUrl) {
    const posterImg = title.images?.find((img) => img.type === "poster")?.filename || title.images?.find((img) => img.type === "cover")?.filename;
    const bannerImg = title.images?.find((img) => img.type === "background")?.filename || title.images?.find((img) => img.type === "cover_mobile")?.filename;
    const plotTranslation = title.translations?.find((t) => t.key === "plot")?.value || title.plot || "";
    const itemType = title.type === "tv" ? "series" : "movie";
    const itemUrl = `${manifest.baseUrl}/it/titles/${title.id}-${title.slug}`;
    return new MultimediaItem({
      title: title.name || "Senza Titolo",
      url: itemUrl,
      posterUrl: getImageUrl(cdnUrl, posterImg),
      bannerUrl: getImageUrl(cdnUrl, bannerImg),
      type: itemType,
      score: title.score ? parseFloat(title.score) : void 0,
      description: plotTranslation,
      contentRating: title.age ? `${title.age}+` : void 0
    });
  }
  async function getHome(cb) {
    try {
      const homeUrl = `${manifest.baseUrl}/it`;
      const res = await get(homeUrl);
      const inertia = extractInertiaPage(res.body);
      if (!inertia || !inertia.props) {
        return cb({ success: false, errorCode: "PARSE_ERROR", message: "Could not extract Inertia props" });
      }
      const cdnUrl = inertia.props.cdn_url || "https://cdn.streamingunity.win";
      const sliders = inertia.props.sliders || [];
      const result = {};
      for (const slider of sliders) {
        const titles = slider.titles || [];
        if (titles.length === 0) continue;
        const items = titles.map((t) => parseTitleToMultimediaItem(t, cdnUrl));
        const sName = (slider.name || "").toLowerCase();
        let catName = slider.label || slider.name || "Popolari";
        if (sName === "trending" || sName === "top10") {
          if (!result["Trending"]) {
            result["Trending"] = items;
            continue;
          }
        }
        result[catName] = items;
      }
      if (!result["Trending"]) {
        const firstCat = Object.keys(result)[0];
        if (firstCat && result[firstCat]) {
          result["Trending"] = result[firstCat];
        }
      }
      cb({ success: true, data: result });
    } catch (err) {
      cb({ success: false, errorCode: "NETWORK_ERROR", message: err.message });
    }
  }
  async function search(query, cb) {
    try {
      const cleanQ = query.trim();
      const searchUrl = `${manifest.baseUrl}/it/search?q=${encodeURIComponent(cleanQ)}`;
      const res = await get(searchUrl);
      const inertia = extractInertiaPage(res.body);
      if (!inertia || !inertia.props) {
        return cb({ success: false, errorCode: "PARSE_ERROR", message: "Could not extract search props" });
      }
      const cdnUrl = inertia.props.cdn_url || "https://cdn.streamingunity.win";
      const titles = inertia.props.titles || [];
      const items = titles.map((t) => parseTitleToMultimediaItem(t, cdnUrl));
      const hasDirectMatch = items.some((i) => matchesAppQuery(i.title, cleanQ));
      if (items.length < 3 || !hasDirectMatch) {
        try {
          const aliases = await fetchMovieSeriesAliases(cleanQ);
          const seenUrls = new Set(items.map((i) => i.url));
          const aliasPromises = aliases.slice(0, 3).map(async (alias) => {
            try {
              const aliasUrl = `${manifest.baseUrl}/it/search?q=${encodeURIComponent(alias)}`;
              const aRes = await get(aliasUrl);
              const aInertia = extractInertiaPage(aRes.body);
              if (aInertia?.props?.titles) {
                const aCdn = aInertia.props.cdn_url || cdnUrl;
                return aInertia.props.titles.map((t) => parseTitleToMultimediaItem(t, aCdn));
              }
              return [];
            } catch {
              return [];
            }
          });
          const aliasLists = await Promise.all(aliasPromises);
          for (const list of aliasLists) {
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
      const inertia = extractInertiaPage(res.body);
      if (!inertia || !inertia.props || !inertia.props.title) {
        return cb({ success: false, errorCode: "NOT_FOUND", message: "Title not found in props" });
      }
      const title = inertia.props.title;
      const cdnUrl = inertia.props.cdn_url || "https://cdn.streamingunity.win";
      const item = parseTitleToMultimediaItem(title, cdnUrl);
      if (title.genres && Array.isArray(title.genres)) {
        item.tags = title.genres.map((g) => g.name);
      }
      if (title.release_date) {
        item.year = parseInt(title.release_date.split("-")[0], 10);
      }
      if (title.runtime) {
        item.duration = parseInt(title.runtime, 10);
      }
      if (title.main_actors && Array.isArray(title.main_actors)) {
        item.cast = title.main_actors.map((a) => new Actor({ name: a.name }));
      }
      if (title.trailers && Array.isArray(title.trailers)) {
        item.trailers = title.trailers.filter((tr) => tr.youtube_id).map((tr) => new Trailer({ url: `https://www.youtube.com/watch?v=${tr.youtube_id}` }));
      }
      if (title.type === "tv") {
        item.type = "series";
        const episodes = [];
        const seasons = title.seasons || [];
        const loadedSeason = inertia.props.loadedSeason;
        const loadedEpisodesMap = /* @__PURE__ */ new Map();
        if (loadedSeason && loadedSeason.episodes) {
          loadedEpisodesMap.set(loadedSeason.number, loadedSeason.episodes);
        }
        for (const season of seasons) {
          let epList = loadedEpisodesMap.get(season.number);
          if (!epList) {
            try {
              const seasonUrl = `${manifest.baseUrl}/it/titles/${title.id}-${title.slug}/season-${season.number}`;
              const sRes = await get(seasonUrl);
              const sInertia = extractInertiaPage(sRes.body);
              if (sInertia?.props?.loadedSeason?.episodes) {
                epList = sInertia.props.loadedSeason.episodes;
              }
            } catch {
              epList = [];
            }
          }
          if (epList && Array.isArray(epList)) {
            for (const ep of epList) {
              const epCover = ep.images?.find((i) => i.type === "cover")?.filename;
              const epStreamUrl = `${manifest.baseUrl}/it/iframe/${title.id}?episode_id=${ep.id}&canPlayFHD=1`;
              episodes.push(new Episode({
                name: ep.name || `Episodio ${ep.number}`,
                url: epStreamUrl,
                season: season.number,
                episode: ep.number,
                description: ep.plot || "",
                posterUrl: getImageUrl(cdnUrl, epCover),
                runtime: ep.duration ? parseInt(ep.duration, 10) : void 0
              }));
            }
          }
        }
        item.episodes = episodes;
      } else {
        item.type = "movie";
        const movieStreamUrl = `${manifest.baseUrl}/it/iframe/${title.id}?canPlayFHD=1`;
        item.episodes = [
          new Episode({
            name: title.name,
            url: movieStreamUrl,
            season: 1,
            episode: 1,
            description: item.description,
            posterUrl: item.posterUrl
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
      let iframeUrl = url;
      if (url.includes("/titles/") && !url.includes("/iframe/")) {
        const matchId = url.match(/\/titles\/(\d+)/);
        if (matchId) {
          iframeUrl = `${manifest.baseUrl}/it/iframe/${matchId[1]}?canPlayFHD=1`;
        }
      }
      const res = await get(iframeUrl, {
        headers: {
          "Referer": manifest.baseUrl
        }
      });
      const iframeSrcMatch = res.body.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      let videoEmbedUrl = "";
      if (iframeSrcMatch) {
        videoEmbedUrl = iframeSrcMatch[1];
      } else {
        const vixMatch = res.body.match(/https?:\/\/[a-zA-Z0-9.-]*vixcloud[a-zA-Z0-9.-]*\/[^\s"'<>]+/i);
        if (vixMatch) {
          videoEmbedUrl = vixMatch[0];
        }
      }
      if (!videoEmbedUrl) {
        if (res.body.includes("masterPlaylist")) {
          const streams2 = await extractVixCloud(iframeUrl, {
            sourceName: "StreamingCommunity",
            referer: manifest.baseUrl
          });
          return cb({ success: true, data: streams2 });
        }
        return cb({ success: false, errorCode: "NO_IFRAME", message: "No video embed found in iframe page" });
      }
      const streams = await extractVixCloud(videoEmbedUrl, {
        sourceName: "StreamingCommunity",
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
