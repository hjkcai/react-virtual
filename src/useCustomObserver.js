import React, { useEffect, useState } from 'react';

export const useCustomObserver = (parentRef, initialRect) => {
  const [rect, setRect] = useState(initialRect ?? {
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    // 使用原生 ResizeObserver 替换 @reach/observe-rect
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setRect({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [parentRef]);

  return rect;
};
