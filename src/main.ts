import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// iOS rechnet die Höhe einer Home-Bildschirm-App mit durchsichtiger Statusleiste
// um die Statusleiste zu kurz. Dort füllt die App den ganzen Bildschirm, also
// nehmen wir direkt die Bildschirmhöhe.
function setAppHeight() {
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true && navigator.maxTouchPoints > 0;
  const portrait = window.innerHeight >= window.innerWidth;
  const height = standalone
    ? portrait
      ? Math.max(screen.height, screen.width)
      : Math.min(screen.height, screen.width)
    : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300));

// Zoomen verhindern: iOS ignoriert user-scalable=no in Safari, deshalb zusätzlich
// Pinch-Gesten und Doppeltipp abfangen (touch-action in styles.scss)
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
