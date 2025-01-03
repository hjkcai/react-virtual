import React, { useEffect, useState } from 'react';

export const useResizeObserver = (parentRef, initialRect) => {
  const [rect, setRect] = useState(initialRect ?? {
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const element = parentRef.current;
    if (!element || !window.ResizeObserver) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setRect({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [parentRef]);

  return rect;
};
