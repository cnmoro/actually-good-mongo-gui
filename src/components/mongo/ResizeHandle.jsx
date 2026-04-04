import { useCallback, useRef, useEffect } from 'react';

export default function ResizeHandle({ onResize, direction = 'horizontal' }) {
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

    const handleMouseMove = (moveEvent) => {
      const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, direction]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`resize-handle ${
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize'
          : 'h-1 cursor-row-resize'
      } bg-border/30 hover:bg-primary/40 active:bg-primary/60 transition-colors shrink-0`}
    />
  );
}