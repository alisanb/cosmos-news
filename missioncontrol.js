// api/mission-control.js
//
// Auto-updating data for the "Mission Control" section of index.html.
// This serverless function pulls fresh numbers from several real, free
// space-data APIs and hands them back as one JSON object for the page's
// JavaScript to display. No API keys are exposed to the browser -- the
// NASA key (if set) is only ever used from here, server-side.
//
// Sources:
//   - CelesTrak            (active satellite count)               -- no key needed
//   - NASA NeoWs            (near-Earth objects tracked today)     -- needs NASA_API_KEY
//   - NASA APOD              (Astronomy Picture of the Day)        -- needs NASA_API_KEY
//   - NASA DONKI             (solar flares / space weather)        -- needs NASA_API_KEY
//   - NASA EPIC              (recent full-disk photo of Earth)     -- no key needed
//   - The Space Devs         (SpaceX launches, upcoming + recent)  -- no key needed
//   - Spaceflight News API   (space news headlines)                -- no key needed
//
// Get a free NASA key (instant, no approval wait) at https://api.nasa.gov
// and set it as the NASA_API_KEY environment variable in Vercel. Without
// it, the satellites/launches/news sections still work -- only the
// near-Earth-object count and the picture of the day will be skipped.
//
// This response is cached at Vercel's edge for 30 minutes (see the
// Cache-Control header at the bottom) -- that's what makes this section
// "auto-update" without hammering these free APIs on every single visitor.

const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';

// Small helper: fetch with a timeout, so one slow upstream API can't hang
// the whole response. Returns null on any failure instead of throwing --
// each section below is independent, so one missing source never breaks
// the others.
async function safeFetchJson(url, ms = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSatellites() {
  const data = await safeFetchJson(
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
    15000 // this catalog is large, give it more time
  );
  if (!Array.isArray(data) || data.length === 0) return null;
  return { count: data.length };
}

async function getNeo() {
  const data = await safeFetchJson(
    `https://api.nasa.gov/neo/rest/v1/feed/today?detailed=false&api_key=${encodeURIComponent(NASA_API_KEY)}`
  );
  if (!data || !data.near_earth_objects) return null;
  const all = Object.values(data.near_earth_objects).flat();
  const hazardous = all.filter((o) => o && o.is_potentially_hazardous_asteroid).length;
  return { count: all.length, hazardous };
}

async function getApod() {
  const data = await safeFetchJson(
    `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(NASA_API_KEY)}`
  );
  if (!data || data.media_type !== 'image' || !data.url) return null;
  return {
    title: data.title || 'NASA Astronomy Picture of the Day',
    imageUrl: data.url,
    permalink: `https://apod.nasa.gov/apod/ap${String(data.date || '').replace(/-/g, '').slice(2)}.html`,
    explanation: String(data.explanation || '').slice(0, 260),
    credit: data.copyright ? String(data.copyright).trim() : 'NASA',
    date: data.date || '',
  };
}

async function getSpaceWeather() {
  const today = new Date();
  const start = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000); // last 3 days
  const fmtDate = (d) => d.toISOString().slice(0, 10);
  const [flares, cmes] = await Promise.all([
    safeFetchJson(`https://api.nasa.gov/DONKI/FLR?startDate=${fmtDate(start)}&endDate=${fmtDate(today)}&api_key=${encodeURIComponent(NASA_API_KEY)}`),
    safeFetchJson(`https://api.nasa.gov/DONKI/CME?startDate=${fmtDate(start)}&endDate=${fmtDate(today)}&api_key=${encodeURIComponent(NASA_API_KEY)}`),
  ]);
  const flareList = Array.isArray(flares) ? flares : [];
  const cmeList = Array.isArray(cmes) ? cmes : [];
  if (flares === null && cmes === null) return null;

  // Solar flare classes go A < B < C < M < X (each letter ~10x the last).
  // Find the strongest one reported in the window, if any.
  const classRank = { A: 0, B: 1, C: 2, M: 3, X: 4 };
  let strongest = null;
  flareList.forEach((f) => {
    const cls = f && f.classType ? String(f.classType) : '';
    const letter = cls.charAt(0).toUpperCase();
    if (classRank[letter] === undefined) return;
    if (!strongest || classRank[letter] > classRank[strongest.charAt(0).toUpperCase()]) strongest = cls;
  });

  return {
    flareCount: flareList.length,
    cmeCount: cmeList.length,
    strongestFlare: strongest,
    windowDays: 3,
  };
}

async function getEpic() {
  const data = await safeFetchJson(`https://epic.gsfc.nasa.gov/api/natural?api_key=${encodeURIComponent(NASA_API_KEY)}`);
  if (!Array.isArray(data) || data.length === 0) return null;
  const chosen = data[data.length - 1]; // most recent shot in the batch
  if (!chosen || !chosen.image || !chosen.date) return null;

  const datePart = String(chosen.date).slice(0, 10); // "2026-08-24 11:12:34" -> "2026-08-24"
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return null;

  return {
    imageUrl: `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/png/${chosen.image}.png`,
    caption: chosen.caption || "Earth, seen from NASA's DSCOVR satellite",
    date: chosen.date,
  };
}

function shortLaunchName(name) {
  if (!name) return 'Unnamed launch';
  // Space Devs names often look like "Falcon 9 Block 5 | Starlink 10-49" --
  // keep it, it's already readable and matches the site's existing style.
  return name;
}

async function getLaunches() {
  const [upcoming, previous] = await Promise.all([
    safeFetchJson('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?lsp__name=SpaceX&limit=3&ordering=net'),
    safeFetchJson('https://ll.thespacedevs.com/2.2.0/launch/previous/?lsp__name=SpaceX&limit=2&ordering=-net'),
  ]);
  const up = (upcoming && Array.isArray(upcoming.results)) ? upcoming.results : [];
  const prev = (previous && Array.isArray(previous.results)) ? previous.results : [];
  if (up.length === 0 && prev.length === 0) return null;

  return {
    upcoming: up.map((l) => ({
      name: shortLaunchName(l.name),
      net: l.net || null,
      pad: (l.pad && l.pad.location && l.pad.location.name) || '',
    })),
    previous: prev.map((l) => ({
      name: shortLaunchName(l.name),
      net: l.net || null,
      success: l.status && (l.status.abbrev === 'Success' || l.status.id === 3),
    })),
  };
}
// api/mission-control.js

async function getNews(limit = 12, offset = 0, isBusiness = false) {
  // If business, query SpaceNews articles directly or filter specifically by commercial search terms
  const baseUrl = 'https://api.spaceflightnewsapi.net/v4/articles/';
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    ordering: '-published_at'
  });

  if (isBusiness) {
    // Specifically filter for SpaceNews content dealing with the commercial market
    params.set('news_site', 'SpaceNews');
  }

  const data = await safeFetchJson(`${baseUrl}?${params.toString()}`);
  if (!data || !Array.isArray(data.results)) return { count: 0, results: [] };

  return {
    count: data.count,
    results: data.results.map((a) => ({
      title: a.title,
      url: a.url,
      site: a.news_site || 'SpaceNews',
      publishedAt: a.published_at || null,
      imageUrl: a.image_url || null,
      summary: a.summary ? String(a.summary).slice(0, 180) : '',
    })),
  };
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const query = req.query || {};

  // Handle paginated queries from the client
  if (query.type) {
    const limit = Math.min(Number(query.limit) || 12, 30);
    const offset = Number(query.offset) || 0;
    const isBusiness = query.type === 'business';

    const newsData = await getNews(limit, offset, isBusiness);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json(newsData);
  }

  // Regular mission-control payload on first visit
  const [satellites, neo, apod, apodRange, launches, launchStats, generalNews, bizNews, spaceWeather, epic] = await Promise.all([
    getSatellites(),
    getNeo(),
    getApod(),
    getApodRange(),
    getLaunches(),
    getLaunchStats(),
    getNews(12, 0, false), // General headlines from all outlets
    getNews(12, 0, true),  // Dedicated SpaceNews commercial feed
    getSpaceWeather(),
    getEpic(),
  ]);

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.status(200).json({
    generatedAt: new Date().toISOString(),
    satellites,
    neo,
    apod,
    apodRange,
    launches,
    launchStats,
    news: generalNews.results,
    bizNews: bizNews.results,
    spaceWeather,
    epic,
  });
};
