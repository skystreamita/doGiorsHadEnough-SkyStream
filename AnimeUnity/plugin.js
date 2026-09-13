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
  function decodeHtml(str) {
    return str.replace(/&#039;/g, "'").replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function parseAnimeToMultimediaItem(record) {
    const isDub = record.dub === 1 || typeof record.slug === "string" && record.slug.toLowerCase().includes("-ita") || typeof record.title === "string" && record.title.toLowerCase().includes("(ita)");
    const rawTitle = decodeHtml(record.title_it || record.title_eng || record.title || record.slug || "Anime");
    const cleanTitle = rawTitle.replace(/\s*\(ITA\)\s*$/i, "").replace(/\s*\(SUB ITA\)\s*$/i, "").replace(/\s*\(SUB\)\s*$/i, "").trim();
    const displayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;
    const score = record.score ? parseFloat(record.score) : void 0;
    const itemUrl = `${manifest.baseUrl}/anime/${record.id}-${record.slug}`;
    return new MultimediaItem({
      title: displayTitle,
      url: itemUrl,
      posterUrl: record.imageurl || "",
      bannerUrl: record.imageurl_cover || record.imageurl || "",
      type: "anime",
      status: record.status === "In corso" ? "ongoing" : "completed",
      score,
      tags: [isDub ? "DOPPIATO ITA" : "SUB ITA"],
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
      const cleanQ = query.trim();
      const headers = await getCsrfHeaders();
      const res = await post(`${manifest.baseUrl}/archivio/get-animes`, {
        title: cleanQ,
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
      let items = records.map(parseAnimeToMultimediaItem);
      if (items.length < 3) {
        try {
          const aliases = await fetchTitleAliases(cleanQ);
          const seenUrls = new Set(items.map((i) => i.url));
          const aliasPromises = aliases.slice(0, 3).map(async (alias) => {
            try {
              const aliasRes = await post(`${manifest.baseUrl}/archivio/get-animes`, {
                title: alias,
                type: false,
                year: false,
                order: false,
                status: false,
                genres: false,
                season: false,
                dubbed: 1,
                offset: 0
              }, { headers });
              const aliasJson = parseJsonSafe(aliasRes.body);
              const aliasRecords = aliasJson?.records || [];
              return aliasRecords.map(parseAnimeToMultimediaItem);
            } catch {
              return [];
            }
          });
          const aliasResultLists = await Promise.all(aliasPromises);
          for (const list of aliasResultLists) {
            for (const parsed of list) {
              if (!seenUrls.has(parsed.url)) {
                seenUrls.add(parsed.url);
                items.push(parsed);
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
      const rawDisplayTitle = decodeHtml(animeData?.title_it || animeData?.title_eng || animeData?.title || (titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Anime"));
      const isDub = Boolean(
        animeData?.dub === 1 || typeof animeData?.slug === "string" && animeData.slug.toLowerCase().endsWith("-ita") || targetUrl.toLowerCase().includes("-ita") || typeof rawDisplayTitle === "string" && rawDisplayTitle.toLowerCase().includes("(ita)")
      );
      const cleanTitle = rawDisplayTitle.replace(/\s*\(ITA\)\s*$/i, "").replace(/\s*\(SUB ITA\)\s*$/i, "").replace(/\s*\(SUB\)\s*$/i, "").trim();
      const finalDisplayTitle = isDub ? `${cleanTitle} (ITA)` : `${cleanTitle} (SUB)`;
      const posterMatch = html.match(/class="[^"]*poster[^"]*"[^>]*img[^>]+src="([^"]+)"/i) || html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i);
      const posterUrl = animeData?.imageurl || (posterMatch ? posterMatch[1] : "");
      const descMatch = html.match(/class="[^"]*plot[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      const description = animeData?.plot || (descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "");
      const score = animeData?.score ? parseFloat(animeData.score) : void 0;
      const syncData = {};
      if (animeData?.mal_id) syncData.mal = String(animeData.mal_id);
      if (animeData?.anilist_id) syncData.anilist = String(animeData.anilist_id);
      if (!syncData.mal && !syncData.anilist) {
        try {
          const extIds = await fetchAniListIds(cleanTitle);
          if (extIds?.mal) syncData.mal = extIds.mal;
          if (extIds?.anilist) syncData.anilist = extIds.anilist;
        } catch {
        }
      }
      const item = new MultimediaItem({
        title: finalDisplayTitle,
        url: targetUrl,
        posterUrl,
        type: "anime",
        description: (isDub ? "[DOPPIATO ITA] " : "[SUB ITA] ") + description,
        score,
        status: animeData?.status === "In corso" ? "ongoing" : "completed",
        tags: [isDub ? "DOPPIATO ITA" : "SUB ITA"],
        syncData: Object.keys(syncData).length > 0 ? syncData : void 0
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
            episode: Math.floor(epNum),
            dubStatus: isDub ? "dubbed" : "subbed"
          }));
        }
      } else {
        episodes.push(new Episode({
          name: finalDisplayTitle,
          url: targetUrl,
          season: 1,
          episode: 1,
          dubStatus: isDub ? "dubbed" : "subbed"
        }));
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
