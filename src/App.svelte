<script lang="ts">
  import Icon from './components/Icon.svelte';
  import { downloadBackup } from './lib/files';
  import { t } from './lib/i18n';
  import { app, type View } from './lib/store.svelte';
  import Crops from './views/Crops.svelte';
  import Layout from './views/Layout.svelte';
  import MonthView from './views/MonthView.svelte';
  import Plantings from './views/Plantings.svelte';
  import Seeds from './views/Seeds.svelte';
  import Settings from './views/Settings.svelte';
  import Tasks from './views/Tasks.svelte';
  import Help from './views/Help.svelte';

  const NAV: { view: View; icon: string }[] = [
    { view: 'month', icon: 'month' },
    { view: 'tasks', icon: 'tasks' },
    { view: 'plantings', icon: 'plantings' },
    { view: 'plan', icon: 'plan' },
    { view: 'seeds', icon: 'seeds' },
    { view: 'crops', icon: 'crops' },
    { view: 'settings', icon: 'settings' },
  ];

  $effect(() => {
    const theme = app.data.settings.theme;
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  });

  $effect(() => {
    document.title = app.plot ? `${t(`nav.${app.route.view}`)}: ${app.plot.name}` : t('app.name');
  });

  const backupDue = $derived.by(() => {
    const last = app.data.meta.lastBackupAt;
    const created = app.data.meta.createdAt;
    const days = (iso: string) => (Date.now() - Date.parse(iso)) / 86_400_000;
    if (dismissedBackup) return false;
    return last ? days(last) > 30 : days(created) > 7 && app.data.plantings.length > 0;
  });
  let dismissedBackup = $state(false);
  const openWarnings = $derived(app.warnings.filter((w) => w.level === 'warn').length);

  function cycleTheme() {
    const order = ['system', 'light', 'dark'] as const;
    const next = order[(order.indexOf(app.data.settings.theme) + 1) % 3];
    app.update(null, (d) => { d.settings.theme = next; });
  }

  function onkey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !(e.target as HTMLElement)?.closest('input, textarea, select')) {
      e.preventDefault();
      app.undo();
    }
  }
</script>

<svelte:window onkeydown={onkey} />

<a class="skip" href="#main">{t('app.skip')}</a>

{#if !app.ready}
  <div class="loading" aria-busy="true">{t('app.loading')}</div>
{:else}
  <header class="top">
    <div class="brand">
      <span class="wordmark">{t('app.name')}</span>
      {#if app.plots.length > 1}
        <select
          class="plot-switch"
          aria-label={t('app.switchPlot')}
          value={app.plot?.id}
          onchange={(e) => app.update(null, (d) => { d.settings.activePlotId = e.currentTarget.value; })}
        >
          {#each app.data.plots as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      {:else if app.plot}
        <span class="plot-name">{app.plot.name}</span>
      {/if}
    </div>
    <nav class="tabs desktop-nav" aria-label={t('app.nav')}>
      {#each NAV as n (n.view)}
        <a class="pill" class:on={app.route.view === n.view} aria-current={app.route.view === n.view ? 'page' : undefined} href="#/{n.view}">
          {t(`nav.${n.view}`)}
          {#if n.view === 'plantings' && openWarnings}<span class="badge" aria-label={t('app.warnings', { n: openWarnings })}>{openWarnings}</span>{/if}
        </a>
      {/each}
    </nav>
    <div class="row tools">
      <a class="btn quiet small" href="#/help" aria-current={app.route.view === 'help' ? 'page' : undefined}>{t('nav.help')}</a>
      <button class="btn quiet small" onclick={() => app.undo()} disabled={!app.undoCount} title={t('app.undoHint')}>{t('app.undo')}</button>
      <button class="btn quiet small" onclick={cycleTheme} aria-label={t('app.theme', { theme: t(`theme.${app.data.settings.theme}`) })}>
        <Icon name={app.data.settings.theme === 'dark' ? 'moon' : app.data.settings.theme === 'light' ? 'sun' : 'auto'} />
      </button>
    </div>
  </header>

  {#if app.loadError}
    <div class="banner warn" role="alert">{t('app.storageUnavailable')}</div>
  {/if}
  {#if backupDue}
    <div class="banner" role="status">
      <span>{t('app.backupNudge')}</span>
      <span class="row">
        <button class="btn small primary" onclick={downloadBackup}>{t('settings.backupNow')}</button>
        <button class="btn small quiet" onclick={() => (dismissedBackup = true)}>{t('app.later')}</button>
      </span>
    </div>
  {/if}

  <main id="main" tabindex="-1">
    {#if !app.plot && app.route.view !== 'settings' && app.route.view !== 'crops' && app.route.view !== 'help'}
      <div class="empty card">
        <h2>{t('app.noPlot')}</h2>
        <p>{t('app.noPlotHelp')}</p>
        <a class="btn primary" href="#/settings">{t('app.makePlot')}</a>
      </div>
    {:else if app.route.view === 'month'}<MonthView />
    {:else if app.route.view === 'plan'}<Layout />
    {:else if app.route.view === 'plantings'}<Plantings />
    {:else if app.route.view === 'tasks'}<Tasks />
    {:else if app.route.view === 'seeds'}<Seeds />
    {:else if app.route.view === 'crops'}<Crops />
    {:else if app.route.view === 'settings'}<Settings />
    {:else if app.route.view === 'help'}<Help />
    {/if}
  </main>

  <nav class="bottom-nav" aria-label={t('app.nav')}>
    {#each NAV as n (n.view)}
      <a href="#/{n.view}" class:on={app.route.view === n.view} aria-current={app.route.view === n.view ? 'page' : undefined}>
        <Icon name={n.icon} />
        <span>{t(`nav.short.${n.view}`)}</span>
      </a>
    {/each}
  </nav>
{/if}

{#if app.toast}
  <div class="toast" role="status">
    <span>{app.toast.message}</span>
    {#if app.toast.undo && app.undoCount}<button class="btn small quiet" onclick={() => app.undo()}>{t('app.undo')}</button>{/if}
  </div>
{/if}

<style>
  .skip { position: absolute; left: -999px; top: 8px; background: var(--ink); color: var(--bg); padding: 8px 12px; border-radius: 8px; z-index: 10; }
  .skip:focus { left: 8px; }
  .loading { padding: 40px var(--gutter); color: var(--muted); }
  .top {
    display: flex; gap: 12px 20px; align-items: center; flex-wrap: wrap;
    padding: max(14px, env(safe-area-inset-top)) var(--gutter) 12px;
    max-width: 1200px; margin: 0 auto;
  }
  .brand { display: flex; align-items: baseline; gap: 12px; min-width: 0; flex: 1 1 auto; }
  .wordmark { font: 700 22px/1 var(--font-display); white-space: nowrap; }
  .plot-name { font: 500 12px var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .plot-switch { width: auto; min-height: 32px; padding: 2px 8px; font-size: 13px; }
  .desktop-nav { flex: 1 1 auto; order: 3; }
  @media (min-width: 1100px) { .desktop-nav { order: 0; flex: 1 1 auto; } .brand { flex: 0 1 auto; } }
  .desktop-nav .pill { text-decoration: none; gap: 6px; }
  .badge { font: 500 11px/1 var(--font-mono); background: var(--warn); color: var(--surface); border-radius: 999px; padding: 3px 6px; }
  .tools { margin-left: auto; }
  main { max-width: 1200px; margin: 0 auto; padding: 8px var(--gutter) 48px; outline: none; }
  .banner {
    max-width: 1200px; margin: 0 auto 8px; padding: 10px var(--gutter);
    display: flex; gap: 8px 16px; align-items: center; justify-content: space-between; flex-wrap: wrap;
    border-block: 1px solid var(--line); background: var(--surface); font-size: 14px;
  }
  .banner.warn { background: var(--warn-bg); }
  .bottom-nav { display: none; }
  .toast {
    position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(20px + env(safe-area-inset-bottom));
    display: flex; gap: 12px; align-items: center; max-width: calc(100vw - 32px);
    background: var(--ink); color: var(--bg); padding: 8px 10px 8px 16px; border-radius: 999px; z-index: 20; font-size: 14px;
  }
  .toast .btn { color: var(--bg); border-color: color-mix(in srgb, var(--bg) 40%, transparent); }
  @media (max-width: 760px) {
    .desktop-nav { display: none; }
    main { padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
    .bottom-nav {
      display: grid; grid-template-columns: repeat(7, 1fr);
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 15;
      padding: 4px max(4px, env(safe-area-inset-left)) calc(4px + env(safe-area-inset-bottom)) max(4px, env(safe-area-inset-right));
      background: var(--surface); border-top: 1px solid var(--line);
    }
    .bottom-nav a {
      display: grid; justify-items: center; gap: 2px; padding: 6px 0 4px; min-height: 48px;
      color: var(--muted); text-decoration: none; font: 500 10px/1.2 var(--font-mono); letter-spacing: 0.04em; border-radius: 8px;
    }
    .bottom-nav a.on { color: var(--ink); background: var(--bg); }
    .toast { bottom: calc(78px + env(safe-area-inset-bottom)); }
  }
</style>
