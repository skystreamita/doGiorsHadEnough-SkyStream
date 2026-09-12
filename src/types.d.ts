/**
 * SkyStream Plugin v2 Type Definitions
 */

export interface PluginDomain {
  /** Display name shown in the domain selector (e.g. "yflix.to") */
  name: string;
  /** Full URL for this domain (e.g. "https://yflix.to") */
  url: string;
}

export interface PluginSubProvider {
  /** Unique ID within the parent plugin (e.g. "sonyliv") */
  id: string;
  /** Display name shown in the providers list (e.g. "SonyLIV") */
  name: string;
  /**
   * Optional static base URL injected as `manifest.baseUrl`.
   * Omit when the URL is dynamic — the app will inject `manifest.providerId`
   * instead so your JS can resolve the URL at runtime (e.g. via Firebase).
   */
  baseUrl?: string;
}

export interface Manifest {
  packageName: string;
  name: string;
  version: number;
  authors: string[];
  baseUrl: string;
  description?: string;
  iconUrl?: string;
  languages: string[];
  categories: string[];
  /**
   * Optional list of mirror domains. When present, the app renders a domain
   * selector in plugin settings. The user's choice is injected as
   * `manifest.baseUrl` at runtime — no plugin code changes needed.
   */
  domains?: PluginDomain[];
  /**
   * Optional list of sub-providers. One JS file serves multiple feeds.
   * The app creates one provider instance per entry, injecting either
   * `manifest.baseUrl` (if `baseUrl` is declared) or `manifest.providerId`
   * (if `baseUrl` is omitted, for dynamic URL resolution at runtime).
   * Users can enable/disable each sub-provider from plugin settings.
   * Cannot be combined with `domains`.
   */
  providers?: PluginSubProvider[];
  /**
   * Set by the app when the plugin is loaded as a sub-provider without a
   * static `baseUrl`. Equals the sub-provider's `id` from plugin.json.
   * Use this to fetch the URL dynamically (e.g. from Firebase) and serve
   * only that provider's content.
   * Absent when the plugin runs as a root (single) provider.
   */
  providerId?: string;
}

export type Result<T> = 
  | { success: true; data: T }
  | { success: false; errorCode: string; message: string };

/**
 * Valid content types for MultimediaItem
 */
export type MultimediaType = 'movie' | 'series' | 'anime' | 'livestream' | 'other';

/**
 * Valid statuses for MultimediaItem
 */
export type ShowStatus = 'completed' | 'ongoing' | 'upcoming';


/**
 * Valid Dub statuses
 */
export type DubStatus = 'none' | 'dubbed' | 'subbed';

/**
 * Actor/Cast member
 */
export interface IActor {
  name: string;
  image?: string;
  role?: string;
  voiceActor?: IActor;
}

/**
 * Trailer info
 */
export interface ITrailer {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Next Airing info
 */
export interface INextAiring {
  episode: number;
  unixTime: number;
  season?: number;
}

/**
 * Standard Multimedia Item
 */
export interface IMultimediaItem {
  title: string;
  url: string;
  posterUrl: string;
  type?: MultimediaType;
  bannerUrl?: string;
  logoUrl?: string;
  description?: string;
  episodes?: IEpisode[];
  headers?: Record<string, string>;
  provider?: string;
  year?: number;
  score?: number;
  duration?: number;
  status?: ShowStatus;
  tags?: string[];
  contentRating?: string;
  cast?: IActor[];
  trailers?: ITrailer[];
  recommendations?: IMultimediaItem[];
  playbackPolicy?: string;
  isAdult?: boolean;
  nextAiring?: INextAiring;
  syncData?: Record<string, string>;
  streams?: IStreamResult[];
}

/**
 * Standard Episode for multi-part content
 */
export interface IEpisode {
  name: string;
  url: string;
  season?: number;
  episode?: number;
  description?: string;
  posterUrl?: string;
  headers?: Record<string, string>;
  rating?: number;
  runtime?: number;
  airDate?: string;
  dubStatus?: DubStatus;
  playbackPolicy?: string;
  streams?: IStreamResult[];
}

/**
 * Standard Stream Result
 */
export interface IStreamResult {
  url: string;
  source?: string;
  headers?: Record<string, string>;
  subtitles?: { url: string; label: string; lang: string }[];
  drmKid?: string;
  drmKey?: string;
  licenseUrl?: string;
}

export interface IExtractorLink {
  source: string;
  name: string;
  url: string;
  referer?: string;
  quality?: number;
  type?: 'video' | 'm3u8' | 'dash';
  headers?: Record<string, string>;
  drmKid?: string;
  drmKey?: string;
  licenseUrl?: string;
}

export const Qualities = {
  Unknown: 400, P144: 144, P240: 240, P360: 360,
  P480: 480,   P720: 720,  P1080: 1080, P2160: 2160,
} as const;

// Global Bridge Environment
declare global {
  /** The pre-injected manifest for the current plugin */
  const manifest: Manifest;

  /** Helper Class: Actor */
  class Actor implements IActor {
    constructor(data: IActor);
    name: string;
    image?: string;
    role?: string;
    voiceActor?: Actor;
  }

  /** Helper Class: Trailer */
  class Trailer implements ITrailer {
    constructor(data: ITrailer);
    url: string;
    headers?: Record<string, string>;
  }

  /** Helper Class: NextAiring */
  class NextAiring implements INextAiring {
    constructor(data: INextAiring);
    episode: number;
    unixTime: number;
    season?: number;
  }

  /** Helper Class: MultimediaItem */
  class MultimediaItem implements IMultimediaItem {
    constructor(data: IMultimediaItem);
    title: string;
    url: string;
    posterUrl: string;
    type?: MultimediaType;
    bannerUrl?: string;
    logoUrl?: string;
    description?: string;
    episodes?: IEpisode[];
    headers?: Record<string, string>;
    provider?: string;
    year?: number;
    score?: number;
    duration?: number;
    status?: ShowStatus;
    tags?: string[];
    contentRating?: string;
    cast?: Actor[];
    trailers?: Trailer[];
    recommendations?: MultimediaItem[];
    playbackPolicy?: string;
    isAdult?: boolean;
    nextAiring?: NextAiring;
    syncData?: Record<string, string>;
    streams?: StreamResult[];
  }

  /** Helper Class: Episode */
  class Episode implements IEpisode {
    constructor(data: IEpisode);
    name: string;
    url: string;
    season?: number;
    episode?: number;
    description?: string;
    posterUrl?: string;
    headers?: Record<string, string>;
    rating?: number;
    runtime?: number;
    airDate?: string;
    dubStatus?: DubStatus;
    playbackPolicy?: string;
    streams?: StreamResult[];
  }

  /** Helper Class: StreamResult */
  class StreamResult implements IStreamResult {
    constructor(data: IStreamResult);
    url: string;
    source?: string;
    headers?: Record<string, string>;
    subtitles?: { url: string; label: string; lang: string }[];
    drmKid?: string;
    drmKey?: string;
    licenseUrl?: string;
  }

  /** Native Bridge: HTTP GET */
  function http_get(
    url: string,
    headers?: Record<string, string>,
    callback?: (res: HttpResponse) => void
  ): Promise<HttpResponse>;

  /** Native Bridge: HTTP POST */
  function http_post(
    url: string,
    headers?: Record<string, string>,
    body?: string,
    callback?: (res: HttpResponse) => void
  ): Promise<HttpResponse>;

  /** Native Bridge: Parallel HTTP */
  function http_parallel(
    requests: Array<{ url: string; headers?: Record<string, string>; method?: 'GET' | 'POST'; body?: string }>
  ): Promise<HttpResponse[]>;

  /** Decode P.A.C.K.E.R. obfuscated JS via native Dart bridge */
  function getAndUnpack(js: string): string;

  /** Resolve a video hoster URL */
  function loadExtractor(url: string, referer?: string): Promise<IExtractorLink[]>;

  /** CSS selector query on raw HTML — runs in Dart's html package */
  function parse_html(
    html: string,
    selector: string,
    attr?: string
  ): Promise<Array<{ text: string; html: string; attr: string }>>;

  /** Solve Captcha Challenge */
  function solveCaptcha(siteKey: string, url: string): Promise<string>;

  /** Cryptography Helpers */
  interface Crypto {
    /** Decrypt AES-CBC data with PKCS7 padding */
    decryptAES(data: string, key: string, iv: string): string;
  }

  interface HttpResponse {
    status: number;
    body: string;
    headers: Record<string, string>;
  }

  /* Polyfills */
  function btoa(data: string): string;
  function atob(data: string): string;
}
