import fs from 'node:fs/promises';
import path from 'node:path';

const reportPath = process.argv[2] || 'uptime-report.json';
const outputDir = process.argv[3] || 'public';
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const results = Array.isArray(report.results) ? report.results : [];
const healthy = results.filter((item) => item.status === 'healthy').length;
const overall = healthy === results.length && results.length > 0 ? 'healthy' : 'attention';
const rows = results.map((item) => {
  const status = item.status === 'healthy' ? 'Reachable' : 'Needs attention';
  const duration = item.final?.duration_ms == null ? '—' : `${Math.round(item.final.duration_ms)} ms`;
  return `<li><span>${escapeHtml(item.name)}</span><strong data-state="${escapeHtml(item.status)}">${status}</strong><small>${escapeHtml(duration)}</small></li>`;
}).join('');
const checkedAt = new Date(report.checked_at || Date.now());
const updated = checkedAt.toLocaleString('en-GB', {
  timeZone: 'Europe/Prague', dateStyle: 'medium', timeStyle: 'short',
});

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="refresh" content="300"><title>Immortal.life system status</title><link rel="stylesheet" href="./emergency.css"></head><body class="status-page"><header><a class="brand" href="https://www.immortal.life/"><span class="mark" aria-hidden="true">∞</span><span>immortal.life</span></a><nav><a href="./">Continuity access</a><a aria-current="page" href="./status.html">System status</a></nav></header><main><section class="status-hero" data-state="${overall}"><div><span class="eyebrow">INDEPENDENT SYSTEM STATUS</span><h1>${overall === 'healthy' ? 'The public service is reachable.' : 'Some public routes need attention.'}</h1><p>This page checks Immortal.life from GitHub infrastructure, independently of the production host. It contains no private operational data.</p></div><div class="status-seal"><i aria-hidden="true"></i><strong>${healthy} of ${results.length} checks passed</strong><span>Updated ${escapeHtml(updated)} Prague time</span></div></section><section class="route-panel"><div><span class="eyebrow">PUBLIC ROUTE CHECKS</span><h2>What visitors can reach right now</h2><p>Each route is requested from infrastructure outside Vercel. The page refreshes automatically.</p></div><ul>${rows}</ul></section><aside class="status-privacy"><strong>Privacy boundary</strong><p>Passwords, API tokens, database details, billing information and internal records never enter this public status repository.</p></aside></main><footer><span>Independent status for immortal.life</span><span>Production is never intentionally interrupted by a status check</span></footer></body></html>`;

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDir, 'status.html'), html, 'utf8'),
  fs.writeFile(path.join(outputDir, 'uptime.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
]);
console.log(`Built independent status page: ${healthy}/${results.length} checks passed.`);
