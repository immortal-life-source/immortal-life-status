import fs from 'node:fs/promises';

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const origin = String(argumentsMap.get('--origin') || 'https://www.immortal.life').replace(/\/$/, '');
const output = argumentsMap.get('--output') || '';
const attempts = Math.max(1, Math.min(5, Number(argumentsMap.get('--attempts') || 3)));
const retryDelayMs = Math.max(500, Number(argumentsMap.get('--retry-delay-ms') || 5000));
const timeoutMs = Math.max(3000, Number(argumentsMap.get('--timeout-ms') || 15000));

const checks = [
  { name: 'Homepage', path: '/', marker: /class=["']hero-question["']/i },
  { name: 'Topic dossier', path: '/topics/frailty', marker: /data-view=["']topic["']/i },
  { name: 'Universities', path: '/universities', marker: /data-view=["']universities["']/i },
  { name: 'Research', path: '/research', marker: /data-view=["']research["']/i },
  { name: 'Trials', path: '/trials', marker: /data-view=["']trials["']/i },
  { name: 'Funding', path: '/funding', marker: /data-view=["']funding["']/i },
  { name: 'Sitemap', path: '/sitemap.xml', marker: /<(?:sitemapindex|urlset)\b/i },
  { name: 'Institutional pilot', path: '/institutional-pilot', marker: /data-pilot-topic=["']exercise["']/i },
  { name: 'Pilot evidence data', path: '/api/intelligence?view=topic-dossier&topic=exercise&limit=12', marker: /["']research["']\s*:/i, forbidden: /["'](?:fallback|unavailable)["']\s*:\s*true/i },
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function inspect(check) {
  const url = `${origin}${check.path}`;
  const history = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(url, {
        headers: {
          Accept: check.path.endsWith('.xml') ? 'application/xml,text/xml;q=0.9,*/*;q=0.8' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'immortal.life-availability-monitor/1.0',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      const body = await response.text();
      const source = [
        response.headers.get('x-immortal-hub-source'),
        response.headers.get('x-immortal-topic-page'),
        response.headers.get('x-immortal-page-source'),
      ].filter(Boolean).join(', ');
      const markerFound = check.marker.test(body);
      const forbiddenFound = Boolean(check.forbidden?.test(body));
      const degraded = /static-fallback|official-source-fallback/i.test(source) || forbiddenFound;
      const status = response.ok && markerFound && !degraded ? 'healthy' : degraded ? 'degraded' : 'failed';
      const result = {
        attempt,
        status,
        http_status: response.status,
        duration_ms: Date.now() - started,
        bytes: Buffer.byteLength(body),
        vercel_cache: response.headers.get('x-vercel-cache') || '',
        source,
        marker_found: markerFound,
        forbidden_found: forbiddenFound,
      };
      history.push(result);
      if (status === 'healthy') return { ...check, url, status, history, final: result };
    } catch (error) {
      history.push({
        attempt,
        status: 'failed',
        http_status: null,
        duration_ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts) await sleep(retryDelayMs);
  }
  const final = history.at(-1);
  return { ...check, url, status: final?.status || 'failed', history, final };
}

const results = await Promise.all(checks.map(inspect));
const unhealthy = results.filter((result) => result.status !== 'healthy');
const report = {
  checked_at: new Date().toISOString(),
  origin,
  status: unhealthy.length ? 'attention' : 'healthy',
  healthy: results.length - unhealthy.length,
  total: results.length,
  results,
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (output) await fs.writeFile(output, json, 'utf8');

for (const result of results) {
  const suffix = result.final?.error
    ? result.final.error
    : `HTTP ${result.final?.http_status}; ${result.final?.duration_ms} ms; cache ${result.final?.vercel_cache || 'unknown'}; source ${result.final?.source || 'standard'}`;
  console.log(`${result.status.toUpperCase()} ${result.name}: ${suffix}`);
}

if (unhealthy.length) process.exitCode = 1;

