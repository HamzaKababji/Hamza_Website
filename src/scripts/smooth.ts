// Smooth scrolling everywhere (wheel, trackpad and in-page links), via Lenis.
// Off for anyone who prefers reduced motion; dialogs scroll natively.
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

declare global {
  interface Window {
    lenis?: Lenis;
  }
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

function start() {
  if (reduce.matches || window.lenis) return;
  window.lenis = new Lenis({
    lerp: 0.09,
    autoRaf: true,
    anchors: true,
    prevent: (node) => node.closest('dialog') !== null,
  });
}
function stop() {
  window.lenis?.destroy();
  window.lenis = undefined;
}
start();
reduce.addEventListener('change', () => (reduce.matches ? stop() : start()));

/** Scroll to an element smoothly (or instantly with reduced motion). */
export function scrollToEl(el: HTMLElement) {
  if (window.lenis) window.lenis.scrollTo(el);
  else el.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
}

/** Pause page scrolling while a modal is open. */
export const pauseScroll = () => window.lenis?.stop();
export const resumeScroll = () => window.lenis?.start();
