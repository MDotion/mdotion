/** Space left between the top bar and a heading the page jumps to. */
const HEADING_GAP = 16;

/** The element that scrolls the page: the document in VS Code, a container in the browser harness. */
function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** The element that scrolls the whole page (the document in VS Code). */
export function pageScroller(): HTMLElement {
  const app = document.querySelector<HTMLElement>('.mdotion-app');
  return app ? scrollParent(app) : ((document.scrollingElement as HTMLElement | null) ?? document.documentElement);
}

/** Height of the sticky bars (the top bar, and the Changes bar while it is open), which cover the top of the page. */
function topBarHeight(): number {
  const bars = document.querySelectorAll<HTMLElement>('.mdotion-topbar, .mdotion-changes-bar');
  return [...bars].reduce((height, bar) => height + bar.offsetHeight, 0);
}

/**
 * Distance from the top of the viewport at which a heading counts as the
 * current one: just below the top bar, where `scrollToHeading` puts it.
 */
export function readingLine(): number {
  return topBarHeight() + HEADING_GAP + 8;
}

/**
 * Scrolls so that `element` sits just below the top bar. One scroll, computed
 * from the layout: `scrollIntoView` ignores the sticky bar, and a second
 * scroll (e.g. ProseMirror revealing the caret) would interrupt a smooth one.
 */
export function scrollToHeading(element: HTMLElement): void {
  const scroller = scrollParent(element);
  const isDocument = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
  const viewportTop = isDocument ? 0 : scroller.getBoundingClientRect().top;
  const top = scroller.scrollTop + element.getBoundingClientRect().top - viewportTop - topBarHeight() - HEADING_GAP;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  scroller.scrollTo({ top: Math.max(0, Math.round(top)), behavior: reduceMotion ? 'auto' : 'smooth' });
}
