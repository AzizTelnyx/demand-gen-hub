'use client';

import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: string;
  size?: number;
}

export default function InfoTooltip({ content, size = 14 }: InfoTooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Calculate position on show
  useEffect(() => {
    if (show && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;

      // If not enough space above (less than 60px), show below
      if (spaceAbove < 60 && spaceBelow > spaceAbove) {
        setPosition('bottom');
      } else {
        setPosition('top');
      }
    }
  }, [show]);

  // Close on click outside
  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setShow(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show]);

  const handleClick = () => {
    setShow(prev => !prev);
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-help"
        aria-label="Info"
      >
        <Info size={size} />
      </button>
      {show && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap max-w-[250px] text-wrap ${
            position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {content}
          <div
            className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
              position === 'top'
                ? 'top-full -mt-px border-t-gray-900'
                : 'bottom-full -mb-px border-b-gray-900'
            }`}
          />
        </div>
      )}
    </div>
  );
}
