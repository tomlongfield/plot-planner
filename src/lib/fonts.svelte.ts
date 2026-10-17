// Text is measured with the real fonts, so layouts recompute once they load.
import { resetMeasurements } from './textfit';

export const fonts = $state({ ready: false });

if (typeof document !== 'undefined' && document.fonts) {
  Promise.all([
    document.fonts.load('600 12px "Public Sans"'),
    document.fonts.load('400 10px "Public Sans"'),
    document.fonts.load('italic 400 10px "Public Sans"'),
    document.fonts.load('500 9px "IBM Plex Mono"'),
  ])
    .catch(() => {})
    .finally(() => {
      resetMeasurements();
      fonts.ready = true;
    });
}
