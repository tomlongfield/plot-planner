<script lang="ts">
  // A modal dialog using the native <dialog> element (focus trapping and Esc for free).
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    wide?: boolean;
  }
  let { open, title, onclose, children, footer, wide = false }: Props = $props();
  let el: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  });
</script>

<dialog bind:this={el} class:wide onclose={onclose} aria-labelledby="dialog-title">
  {#if open}
    <header>
      <h2 id="dialog-title">{title}</h2>
      <button class="btn quiet small" onclick={onclose}>{t('dialog.close')}</button>
    </header>
    <div class="body">{@render children()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  {/if}
</dialog>

<style>
  dialog.wide { width: min(900px, calc(100vw - 24px)); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px 8px; }
  .body { padding: 8px 18px 18px; overflow: auto; max-height: calc(100dvh - 170px); display: grid; gap: 14px; }
  footer { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding: 12px 18px 16px; border-top: 1px solid var(--line); }
</style>
