// Export a standalone page: one self-contained HTML file with the plan for
// every month and that month's jobs. It works offline, needs no app, and makes
// no requests, so it can be emailed or put on a club website.

import { flushSync, mount, unmount } from 'svelte';
import PlanSvg from '../components/PlanSvg.svelte';
import bitter700 from '../assets/fonts/bitter-latin-700-normal.woff2?url';
import mono500 from '../assets/fonts/ibm-plex-mono-latin-500-normal.woff2?url';
import sans400 from '../assets/fonts/public-sans-latin-400-normal.woff2?url';
import sans400i from '../assets/fonts/public-sans-latin-400-italic.woff2?url';
import sans600 from '../assets/fonts/public-sans-latin-600-normal.woff2?url';
import { dayMonth, monthName, monthYear, range, t } from './i18n';
import { cellFor, monthSummary, type Cell } from './monthview';
import { monthState } from './plantings';
import { app } from './store.svelte';
import { isElsewhere, tasksInMonth, type PlanTask } from './tasks';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

/** The app's own CSS, so the exported plan looks exactly like the app. */
function appCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) if (!rule.cssText.startsWith('@font-face')) css += rule.cssText + '\n';
    } catch {
      // Cross-origin sheets can't be read; the app has none.
    }
  }
  return css;
}

export interface StandaloneOptions { includeLocation: boolean; includeDrafts: boolean }

export async function buildStandalone(opts: StandaloneOptions): Promise<string> {
  const plot = app.plot!;
  const site = app.site!;
  const resolved = app.plotResolved.filter((r) => opts.includeDrafts || r.planting.agreement === 'agreed');
  const parents = new Set(app.areas.map((a) => a.parentId).filter(Boolean) as string[]);
  const deps = { cropOf: app.cropOf, nameOf: app.nameOf, shortNameOf: app.shortNameOf, lat: site.location.lat };
  const tasks = app.tasks.filter((x) => (opts.includeDrafts || x.agreement === 'agreed') && (!x.plotId || x.plotId === plot.id));

  // Render the real plan component for each month, off screen.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;width:430px';
  document.body.append(host);
  const months = app.months.map((k) => {
    const st = monthState(app.areas, resolved, k);
    const cells = new Map<string, Cell>(app.areas.map((a) => [a.id, cellFor(a, st.get(a.id), k, deps, parents.has(a.id))]));
    const cmp = mount(PlanSvg, { target: host, props: { plot, areas: app.areas, features: app.features, cells, title: t('month.planTitle', { plot: plot.name, month: monthYear(k) }) } });
    flushSync();
    const svg = host.innerHTML;
    unmount(cmp);
    host.innerHTML = '';
    const mt = tasksInMonth(tasks, k);
    const onPlot = mt.filter((x) => !isElsewhere(x));
    const elsewhere = mt.filter((x) => isElsewhere(x));
    const summary = monthSummary(k, st, onPlot, elsewhere, site.climate, site.location.lat);
    return { k, svg, onPlot, elsewhere, summary };
  });
  host.remove();

  const fonts = await Promise.all([
    ['Bitter', 700, 'normal', bitter700], ['Public Sans', 400, 'normal', sans400], ['Public Sans', 400, 'italic', sans400i],
    ['Public Sans', 600, 'normal', sans600], ['IBM Plex Mono', 500, 'normal', mono500],
  ].map(async ([family, weight, style, url]) => `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(${await dataUrl(String(url))}) format('woff2')}`));

  const jobs = (list: PlanTask[]) => list.length
    ? `<ul class="jobs">${list.map((x) => `<li><span class="when">${esc(range(x.window.from, x.window.to))}</span><span class="what">${esc(x.title)}${x.qty ? ` <span class="muted">${esc(x.qty)}</span>` : ''}${x.agreement === 'draft' ? ` <span class="chip draft">${esc(t('draft'))}</span>` : ''}</span><span class="ttype ${x.type}">${esc(t(`ttype.${x.type}`))}</span></li>`).join('')}</ul>`
    : `<p class="muted small">${esc(t('month.noPlotJobs'))}</p>`;

  const where = opts.includeLocation && site.location.label ? `, ${site.location.label}` : '';
  const today = app.today;
  const body = `
<header class="sa-head">
  <p class="eyebrow">${esc(t('standalone.eyebrow', { date: dayMonth(today) + ' ' + today.slice(0, 4) }))}</p>
  <h1>${esc(plot.name)}${esc(where)}</h1>
  <nav class="sa-tabs" aria-label="${esc(t('month.tabs'))}">${months.map((m, i) => `<a class="pill" href="#m-${m.k}" data-k="${m.k}"${i === 0 ? ' aria-current="true"' : ''}>${esc(monthName(m.k, 'short'))}</a>`).join('')}</nav>
</header>
<main>
${months.map((m) => `<section class="sa-month" id="m-${m.k}">
  <div class="sa-plan">${m.svg}
    <p class="legend small muted"><span class="key changes"></span>${esc(t('month.legend.changes'))} <span class="key draft"></span>${esc(t('month.legend.draft'))}</p>
  </div>
  <div class="sa-panel">
    <h2>${esc(monthYear(m.k))}</h2>
    <p class="summary">${esc(m.summary.text)}</p>
    <h3>${esc(t('month.onPlot'))}</h3>${jobs(m.onPlot)}
    <h3>${esc(t('month.elsewhere'))}</h3>${jobs(m.elsewhere)}
  </div>
</section>`).join('\n')}
</main>
<footer class="sa-foot small muted">${esc(t('standalone.footer'))}</footer>`;

  const css = `${fonts.join('\n')}
${appCss()}
.sa-head{max-width:1100px;margin:0 auto;padding:24px 16px 8px;display:grid;gap:10px}
.sa-tabs{display:flex;gap:6px;flex-wrap:wrap}.sa-tabs .pill{text-decoration:none}
.sa-tabs .pill[aria-current="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
main{max-width:1100px;margin:0 auto;padding:8px 16px 32px}
.sa-month{display:grid;grid-template-columns:minmax(0,430px) minmax(0,1fr);gap:28px;align-items:start;padding:16px 0 32px;border-bottom:1px solid var(--line)}
.sa-panel{display:grid;gap:8px;align-content:start}.sa-panel h2{font-size:30px;font-weight:700}.sa-panel h3{margin-top:10px}
.jobs{list-style:none;margin:0;padding:0}.jobs li{display:grid;grid-template-columns:7.5em 1fr auto;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
.jobs .when{font:400 12.5px var(--font-mono);color:var(--muted)}
.legend{display:flex;gap:6px 10px;align-items:center;flex-wrap:wrap;margin-top:8px}.key{display:inline-block;width:16px;height:11px;border-radius:2px}
.key.changes{border:2px solid var(--new)}.key.draft{border:1.4px dashed var(--muted)}
.sa-foot{max-width:1100px;margin:0 auto;padding:0 16px 32px}
.js .sa-month{display:none}.js .sa-month.on{display:grid}
@media (max-width:760px){.sa-month{grid-template-columns:1fr}.jobs li{grid-template-columns:1fr auto}.jobs .when{grid-row:2}}
@media print{.sa-tabs{display:none}.js .sa-month{display:grid;break-inside:avoid}}`;

  // Tabs: without script every month shows in turn; with it, one at a time.
  const script = `document.documentElement.classList.add('js');
var tabs=[].slice.call(document.querySelectorAll('.sa-tabs a'));
function show(k){[].forEach.call(document.querySelectorAll('.sa-month'),function(s){s.classList.toggle('on',s.id==='m-'+k)});
tabs.forEach(function(a){a.setAttribute('aria-current',a.dataset.k===k?'true':'false')})}
tabs.forEach(function(a,i){a.addEventListener('click',function(e){e.preventDefault();show(a.dataset.k);history.replaceState(null,'','#m-'+a.dataset.k)});
a.addEventListener('keydown',function(e){var n=e.key==='ArrowRight'?i+1:e.key==='ArrowLeft'?i-1:-1;if(n>=0&&n<tabs.length){tabs[n].focus();show(tabs[n].dataset.k)}})});
var h=location.hash.replace('#m-','');show(tabs.some(function(a){return a.dataset.k===h})?h:${JSON.stringify(months.find((m) => m.k === today.slice(0, 7))?.k ?? months[0]?.k ?? '')});`;

  return `<!doctype html>
<html lang="${esc(site.locale || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Plot planner ${esc(__APP_VERSION__)}">
<title>${esc(plot.name)}: ${esc(t('standalone.title'))}</title>
<style>${css}</style>
</head>
<body>${body}
<script>${script}</script>
</body>
</html>
`;
}
