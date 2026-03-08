import { net, app } from 'electron';
import { AppEntry, ReleaseInfo, ReleaseAsset, ReleaseCacheEntry } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const releaseCache = new Map<string, ReleaseCacheEntry>();
let rateLimitResetAt = 0;
let rateLimitRemaining = 60;

function parseRelease(data: any): ReleaseInfo {
  const tagName: string = data.tag_name || '';
  const version = tagName.replace(/^v/, '');

  let installerAsset: ReleaseAsset | null = null;
  const assets: any[] = data.assets || [];

  // Find .exe installer, filter out .blockmap files
  const exeAssets = assets.filter(
    (a: any) => a.name.endsWith('.exe') && !a.name.includes('blockmap')
  );

  if (exeAssets.length > 0) {
    // Prefer executable content type, fall back to first .exe
    const preferred = exeAssets.find(
      (a: any) => a.content_type === 'application/x-executable'
    ) || exeAssets[0];

    installerAsset = {
      name: preferred.name,
      downloadUrl: preferred.browser_download_url,
      size: preferred.size,
    };
  }

  return {
    tagName,
    version,
    name: data.name || tagName,
    body: data.body || '',
    publishedAt: data.published_at || '',
    installerAsset,
  };
}

export async function fetchLatestRelease(entry: AppEntry): Promise<ReleaseInfo | null> {
  const cacheKey = `${entry.github.owner}/${entry.github.repo}`;
  const cached = releaseCache.get(cacheKey);

  // Check cache
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(`[github] Using cached release for ${entry.id}`);
    return cached.release;
  }

  // Check rate limit
  if (rateLimitRemaining <= 1 && Date.now() < rateLimitResetAt) {
    console.warn(`[github] Rate limited, reset at ${new Date(rateLimitResetAt).toISOString()}`);
    return cached?.release || null;
  }

  const url = `https://api.github.com/repos/${entry.github.owner}/${entry.github.repo}/releases/latest`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': `Fulcrum/${app.getVersion()}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Read rate limit headers
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAt = response.headers.get('x-ratelimit-reset');
    if (remaining !== null) {
      rateLimitRemaining = parseInt(remaining, 10);
      console.log(`[github] Rate limit remaining: ${rateLimitRemaining}`);
    }
    if (resetAt !== null) {
      rateLimitResetAt = parseInt(resetAt, 10) * 1000;
    }

    if (response.status === 404) {
      console.log(`[github] No releases found for ${entry.id}`);
      return null;
    }

    if (response.status === 403) {
      console.warn(`[github] Forbidden (rate limited?) for ${entry.id}`);
      return cached?.release || null;
    }

    if (!response.ok) {
      console.warn(`[github] HTTP ${response.status} for ${entry.id}`);
      return cached?.release || null;
    }

    const data = await response.json();
    const release = parseRelease(data);

    releaseCache.set(cacheKey, { release, fetchedAt: Date.now() });
    console.log(`[github] Fetched release for ${entry.id}: v${release.version}`);

    return release;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.warn(`[github] Request timed out for ${entry.id}`);
    } else {
      console.warn(`[github] Fetch failed for ${entry.id}:`, err.message);
    }
    return cached?.release || null;
  }
}

export async function fetchAllReleases(registry: AppEntry[]): Promise<Record<string, ReleaseInfo | null>> {
  const results: Record<string, ReleaseInfo | null> = {};

  // Sequential to respect rate limits
  for (const entry of registry) {
    results[entry.id] = await fetchLatestRelease(entry);
  }

  return results;
}

export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => {
    const parts = v.replace(/^v/, '').split('.').map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
  };

  const c = parse(current);
  const l = parse(latest);

  if (l.major !== c.major) return l.major > c.major;
  if (l.minor !== c.minor) return l.minor > c.minor;
  return l.patch > c.patch;
}

export function clearReleaseCache(): void {
  releaseCache.clear();
  console.log('[github] Release cache cleared');
}
