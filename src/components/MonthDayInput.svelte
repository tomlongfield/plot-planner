<script lang="ts">
  // A day and month without a year, for frost dates ('MM-DD').
  import { monthName } from '../lib/i18n';

  let { value = $bindable(), label, id }: { value: string; label: string; id: string } = $props();
  const month = $derived(Number(value.slice(0, 2)));
  const day = $derived(Number(value.slice(3, 5)));
  const pad = (n: number) => String(n).padStart(2, '0');
  const daysIn = (m: number) => new Date(Date.UTC(2001, m, 0)).getUTCDate();

  function set(m: number, d: number) {
    value = `${pad(m)}-${pad(Math.min(d, daysIn(m)))}`;
  }
</script>

<fieldset class="md">
  <legend class="sr-only">{label}</legend>
  <select aria-label="{label}: day" id="{id}-day" value={day} onchange={(e) => set(month, Number(e.currentTarget.value))}>
    {#each Array.from({ length: daysIn(month) }, (_, i) => i + 1) as d}<option value={d}>{d}</option>{/each}
  </select>
  <select aria-label="{label}: month" id="{id}-month" value={month} onchange={(e) => set(Number(e.currentTarget.value), day)}>
    {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}<option value={m}>{monthName(`2001-${pad(m)}`)}</option>{/each}
  </select>
</fieldset>

<style>
  .md { display: grid; grid-template-columns: 5em 1fr; gap: 6px; border: 0; padding: 0; margin: 0; min-width: 0; }
</style>
