export type SwipeDirection = "left" | "right";

export interface SwipeCallbacks {
  onMove: (dx: number, progress: number, direction: SwipeDirection | null) => void;
  onCommit: (direction: SwipeDirection) => void;
  onCancel: () => void;
}

const MAX_COMMIT_PX = 130;
const COMMIT_FRACTION = 0.28;

/**
 * Attaches pointer-based swipe handling to `el`. Commits when the drag passes
 * 28% of the card's width, capped at 130px. `touch-action: pan-y` must be set
 * on `el` in CSS so vertical scrolling inside the card still works.
 */
export function attachSwipe(el: HTMLElement, callbacks: SwipeCallbacks): () => void {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let dragging = false;
  let pointerId: number | null = null;

  const threshold = () => Math.min(el.clientWidth * COMMIT_FRACTION, MAX_COMMIT_PX);

  function onPointerDown(e: PointerEvent) {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dy = 0;
    dragging = false;
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;

    if (!dragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // A more vertical gesture is a scroll, not a swipe — let it pass through.
      if (Math.abs(dy) > Math.abs(dx)) return;
      dragging = true;
      el.setPointerCapture(pointerId);
    }

    const t = threshold();
    const progress = Math.max(-1, Math.min(1, dx / t));
    const direction: SwipeDirection | null = dx > 0 ? "right" : dx < 0 ? "left" : null;
    callbacks.onMove(dx, progress, direction);
  }

  function finish() {
    if (!dragging) {
      pointerId = null;
      return;
    }
    const t = threshold();
    if (dx >= t) {
      callbacks.onCommit("right");
    } else if (dx <= -t) {
      callbacks.onCommit("left");
    } else {
      callbacks.onCancel();
    }
    dragging = false;
    pointerId = null;
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    finish();
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    callbacks.onCancel();
  }

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);

  return () => {
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerCancel);
  };
}
