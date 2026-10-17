<script lang="ts">
  // Small line icons for navigation. Drawn on a 24 px grid with the current text colour.
  let { name, size = 20 }: { name: string; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'month'}
    <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M10 9v12" />
  {:else if name === 'tasks'}
    <path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
  {:else if name === 'plantings'}
    <path d="M12 21v-9" /><path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z" /><path d="M12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z" />
  {:else if name === 'plan'}
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 10h8v11M11 10V3M15 14h6" />
  {:else if name === 'seeds'}
    <path d="M7 3h10l-1 4H8z" /><path d="M8 7v12a2 2 0 002 2h4a2 2 0 002-2V7" /><path d="M11 13h2" />
  {:else if name === 'crops'}
    <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19V5M9 8h6" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5" />
  {:else if name === 'moon'}
    <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
  {:else if name === 'auto'}
    <circle cx="12" cy="12" r="8" /><path d="M12 4v16a8 8 0 000-16z" fill="currentColor" />
  {/if}
</svg>
