import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { app } from './lib/store.svelte';

app.init();
mount(App, { target: document.getElementById('app')! });

// Offline support. Skipped in development and when opened from a file.
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
