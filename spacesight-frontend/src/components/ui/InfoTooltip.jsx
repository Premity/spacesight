import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_WIDTH = 280;
const OFFSET_X = 14;
const OFFSET_Y = -10;

export default function InfoTooltip({ text, delay = 600, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef(null);

  const computePos = (clientX, clientY) => {
    const rightEdge = clientX + OFFSET_X + TOOLTIP_WIDTH;
    const fitsRight = rightEdge < window.innerWidth - 8;
    return {
      x: fitsRight ? clientX + OFFSET_X : clientX - OFFSET_X - TOOLTIP_WIDTH,
      y: clientY + OFFSET_Y,
    };
  };

  const show = (e) => {
    const { clientX, clientY } = e;
    timerRef.current = setTimeout(() => {
      setPos(computePos(clientX, clientY));
      setVisible(true);
    }, delay);
  };

  const move = (e) => {
    if (visible) setPos(computePos(e.clientX, e.clientY));
  };

  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <>
      <span
        className="cursor-help border-b border-dashed border-current/40 pb-px"
        onMouseEnter={show}
        onMouseMove={move}
        onMouseLeave={hide}
      >
        {children}
      </span>
      {visible && createPortal(
        <div
          className="fixed z-[9999] bg-[#0d0d1a] border border-space-purple/50 text-space-text/90 text-xs rounded-xl px-3 py-2 shadow-[0_0_20px_rgba(124,58,237,0.3)] pointer-events-none leading-relaxed"
          style={{ left: pos.x, top: pos.y, width: TOOLTIP_WIDTH }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}
