import { useLayoutEffect, type RefObject } from "react";

/**
 * Reveals every `[data-reveal]` node inside `root` as it enters the viewport
 * by adding the `is-in` class.
 *
 * The nodes are only hidden once `reveal-ready` is on the root, so if this
 * hook never runs the page simply renders in full with no animation.
 */
export function useReveal(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const rootEl = root.current;
    if (!rootEl) return;

    const targets = Array.from(rootEl.querySelectorAll<HTMLElement>("[data-reveal]"));
    rootEl.classList.add("reveal-ready");

    if (targets.length === 0) return;

    if (typeof IntersectionObserver === "undefined") {
      for (const el of targets) el.classList.add("is-in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -7% 0px", threshold: 0.01 },
    );

    for (const el of targets) observer.observe(el);

    return () => observer.disconnect();
  }, [root]);
}
