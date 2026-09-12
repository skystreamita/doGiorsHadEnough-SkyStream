/// <reference path="../src/types.d.ts" />
import { get } from '../src/utils/http';

interface M3UChannel {
  title: string;
  logo: string;
  id: string;
  group: string;
  url: string;
}

function parseM3U(content: string): M3UChannel[] {
  const lines = content.split('\n');
  const channels: M3UChannel[] = [];
  let currentInfo: Partial<M3UChannel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const idMatch = line.match(/tvg-id="([^"]+)"/);
      const nameMatch = line.match(/tvg-name="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const title = line.split(',').pop()?.trim() || nameMatch?.[1] || 'Sconosciuto';

      currentInfo = {
        title,
        logo: logoMatch ? logoMatch[1] : 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500',
        id: idMatch ? idMatch[1] : title,
        group: groupMatch ? groupMatch[1] : 'Generale'
      };
    } else if (line && !line.startsWith('#') && currentInfo) {
      channels.push({
        title: currentInfo.title || 'Canale',
        logo: currentInfo.logo || 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500',
        id: currentInfo.id || currentInfo.title || 'Canale',
        group: currentInfo.group || 'Generale',
        url: line
      });
      currentInfo = null;
    }
  }

  return channels;
}

function channelToMultimedia(channel: M3UChannel): MultimediaItem {
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
    type: 'livestream',
    description: `Canale Live: ${channel.title} [${channel.group}]`,
    status: 'ongoing'
  });
}

export async function getHome(cb: (res: Result<Record<string, MultimediaItem[]>>) => void) {
  try {
    const m3uUrl = manifest.baseUrl;
    const res = await get(m3uUrl);
    const channels = parseM3U(res.body);

    const result: Record<string, MultimediaItem[]> = {};

    // First section: Trending (first 25 channels)
    const items = channels.map(channelToMultimedia);
    result['Trending'] = items.slice(0, 25);
    result['Tutti i Canali'] = items;

    // Group channels by their group-title if distinct groups exist
    const groups: Record<string, MultimediaItem[]> = {};
    for (const ch of channels) {
      if (ch.group && ch.group !== 'Generale' && ch.group !== 'Italy') {
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
  } catch (err: any) {
    cb({ success: false, errorCode: 'HOME_ERROR', message: err.message });
  }
}

export async function search(query: string, cb: (res: Result<MultimediaItem[]>) => void) {
  try {
    const m3uUrl = manifest.baseUrl;
    const res = await get(m3uUrl);
    const channels = parseM3U(res.body);

    const q = query.toLowerCase().trim();
    const matches = channels.filter(ch =>
      ch.title.toLowerCase().includes(q) ||
      ch.id.toLowerCase().includes(q) ||
      ch.group.toLowerCase().includes(q)
    );

    cb({ success: true, data: matches.map(channelToMultimedia) });
  } catch (err: any) {
    cb({ success: false, errorCode: 'SEARCH_ERROR', message: err.message });
  }
}

export async function load(url: string, cb: (res: Result<MultimediaItem>) => void) {
  try {
    let streamUrl = url;
    let title = 'Canale TV';
    let logo = 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500';

    try {
      const parsed = JSON.parse(url);
      if (parsed.url) {
        streamUrl = parsed.url;
        title = parsed.title || title;
        logo = parsed.logo || logo;
      }
    } catch {}

    const item = new MultimediaItem({
      title,
      url: streamUrl,
      posterUrl: logo,
      bannerUrl: logo,
      type: 'livestream',
      description: `Diretta TV: ${title}`,
      status: 'ongoing',
      episodes: [
        new Episode({
          name: `${title} (Live)`,
          url: streamUrl,
          episode: 1
        })
      ]
    });

    cb({ success: true, data: item });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_ERROR', message: err.message });
  }
}

export async function loadStreams(streamUrl: string, cb: (res: Result<StreamResult[]>) => void) {
  try {
    let finalUrl = streamUrl;
    try {
      const parsed = JSON.parse(streamUrl);
      if (parsed.url) finalUrl = parsed.url;
    } catch {}

    cb({
      success: true,
      data: [
        new StreamResult({
          url: finalUrl,
          source: 'Live TV (HLS)'
        })
      ]
    });
  } catch (err: any) {
    cb({ success: false, errorCode: 'LOAD_STREAMS_ERROR', message: err.message });
  }
}
