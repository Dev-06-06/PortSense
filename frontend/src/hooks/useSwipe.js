import { useEffect, useRef } from "react";

export default function useSwipe(ref, onSwipeLeft, onSwipeRight) {
  const start = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref?.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      const t = e.changedTouches[0];
      start.current = { x: t.clientX, y: t.clientY };
    };

    const handleTouchEnd = (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (dx < -50) onSwipeLeft?.();
      if (dx > 50) onSwipeRight?.();
    };

    el.addEventListener("touchstart", handleTouchStart);
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight]);
}
