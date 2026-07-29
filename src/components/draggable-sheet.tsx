"use client";

/**
 * Drag-to-expand behaviour for the reader's bottom sheets (the verse peek and
 * the verse study panel). The sheet opens at its first snap height and can be
 * dragged up toward full screen for reference-heavy content, or dragged well
 * down to dismiss. Backdrop tap and the × close it too — this is an addition,
 * not a replacement.
 *
 * Height is expressed as a fraction of the viewport and applied as `maxHeight`,
 * so a short sheet still sizes to its content: dragging up only reveals more
 * when there's more to show.
 */
import { useCallback, useRef, useState } from "react";

type Options = {
  /** Snap heights as viewport fractions, ascending (e.g. [0.75, 0.94]). */
  snapPoints: number[];
  /** Released below this fraction of the viewport → dismiss. */
  closeBelow?: number;
  onClose: () => void;
};

export function useDragToExpand({
  snapPoints,
  closeBelow = 0.3,
  onClose,
}: Options) {
  const maxSnap = snapPoints[snapPoints.length - 1];
  const sheetRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(snapPoints[0]); // fraction of viewport height
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startH = useRef(snapPoints[0]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const vh = window.innerHeight;
    const rect = sheetRef.current?.getBoundingClientRect();
    // Anchor the drag to what's actually on screen, so a content-short sheet
    // grows from its real size rather than from the (larger) cap.
    startH.current = rect ? rect.height / vh : snapPoints[0];
    startY.current = e.clientY;
    setMaxH(startH.current);
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [snapPoints]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const vh = window.innerHeight;
      const delta = (startY.current - e.clientY) / vh; // drag up → positive
      setMaxH(Math.min(maxSnap, Math.max(0.15, startH.current + delta)));
    },
    [dragging, maxSnap],
  );

  const end = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // pointer already released
      }
      setMaxH((h) => {
        if (h < closeBelow) {
          onClose();
          return h;
        }
        return snapPoints.reduce(
          (best, p) => (Math.abs(p - h) < Math.abs(best - h) ? p : best),
          snapPoints[0],
        );
      });
    },
    [dragging, snapPoints, closeBelow, onClose],
  );

  const grabberProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    style: { touchAction: "none" as const },
  };

  return {
    sheetRef,
    dragging,
    maxHeight: `${(maxH * 100).toFixed(2)}vh`,
    grabberProps,
  };
}

/** The drag handle: a centred pill, with a generous touch target around it. */
export function SheetGrabber(
  props: React.ComponentProps<"div"> & { dragging?: boolean },
) {
  const { dragging, className, ...rest } = props;
  return (
    <div
      {...rest}
      className={`flex shrink-0 justify-center pb-1 pt-2.5 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      } ${className ?? ""}`}
    >
      <div className="h-1.5 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
    </div>
  );
}
