
import React, { useState, useRef, useEffect } from 'react';
import { BrushSettings } from '../types';
import { GripHorizontal, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface FloatingPaletteProps {
  settings: BrushSettings;
  onChange: (s: BrushSettings) => void;
  visible: boolean;
  onClose: () => void;
}

const PALETTES = [
  { name: "Classic", warm: ['#a81c31', '#e34234', '#e67e22', '#f1c40f', '#8a3324'], cool: ['#1c39bb', '#007ba7', '#007f5c', '#ffffff', '#1a1a1a'] },
  { name: "Zorn", warm: ['#e34234', '#d6a659', '#e97451', '#6b4423', '#4a3c31'], cool: ['#1a1a1a', '#ffffff', '#708090', '#8c959d', '#536878'] },
  { name: "Studio", warm: ['#e32636', '#e34234', '#e97451', '#d68a59', '#8a3324', '#fada5e', '#fff44f'], cool: ['#0047ab', '#007ba7', '#5e8c31', '#ffcc99', '#ffffff', '#000000'] },
  { name: "Vivid", warm: ['#ff0055', '#ff5500', '#ffaa00', '#ffff00', '#aa00ff'], cool: ['#0044ff', '#00ccff', '#00ffaa', '#ffffff', '#000000'] },
  { name: "Portrait", warm: ['#ffcccc', '#ffdfc1', '#e0ac69', '#8d5524', '#593c1f'], cool: ['#708090', '#5f9ea0', '#4682b4', '#f0f8ff', '#2f4f4f'] },
  { name: "Pastel", warm: ['#ffb7b2', '#ffdac1', '#fffac8', '#e2f0cb', '#c7ceea'], cool: ['#b5ead7', '#9fd3c7', '#385170', '#ffffff', '#5c5c5c'] },
  { name: "Botanic", warm: ['#d63447', '#f57b51', '#f6c90e', '#588c7e', '#3e4444'], cool: ['#283655', '#4d648d', '#d0e1f9', '#ffffff', '#0a0a0a'] }
];

const PaintBlob: React.FC<{ color: string; size: number; onClick: () => void }> = ({ color, size, onClick }) => {
    return (
        <button 
            onClick={onClick}
            className="group transition-transform hover:scale-105 active:scale-95 focus:outline-none flex-shrink-0 rounded-sm shadow-sm ring-1 ring-white/10 hover:ring-white/30"
            aria-label={`Select color ${color}`}
            onPointerDown={(e) => e.stopPropagation()} 
            style={{ width: size, height: size, backgroundColor: color }}
        />
    );
};

export const FloatingPalette: React.FC<FloatingPaletteProps> = ({ settings, onChange, visible, onClose }) => {
  const [position, setPosition] = useState({ x: 20, y: 300 });
  const [size, setSize] = useState({ w: 170, h: 130 });
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  const dragOffset = useRef<{x: number, y: number} | null>(null);
  const isResizing = useRef(false);
  
  const currentPalette = PALETTES[paletteIndex];

  useEffect(() => {
    // Default Position
    const startY = window.innerHeight - 300; 
    setPosition({ x: 20, y: startY }); 
    setIsReady(true);
  }, []);

  // Window Resize Guard
  useEffect(() => {
    const handleResize = () => {
        setPosition(prev => {
            const maxX = window.innerWidth - 50;
            const maxY = window.innerHeight - 50;
            let newX = prev.x;
            let newY = prev.y;
            if (newX > maxX) newX = maxX;
            if (newY > maxY) newY = maxY;
            if (newX < 0) newX = 20;
            if (newY < 0) newY = 20;
            return { x: newX, y: newY };
        });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Drag Logic ---
  const handlePanelDown = (e: React.PointerEvent) => {
    if (e.target instanceof SVGElement || (e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('.no-drag')) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const handlePanelMove = (e: React.PointerEvent) => {
    if (dragOffset.current) {
      e.preventDefault();
      e.stopPropagation();
      let newX = e.clientX - dragOffset.current.x;
      let newY = e.clientY - dragOffset.current.y;
      
      const maxX = window.innerWidth - 50; 
      const maxY = window.innerHeight - 50;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
      
      setPosition({ x: newX, y: newY });
    }
  };

  const handlePanelUp = (e: React.PointerEvent) => {
    e.preventDefault();
    dragOffset.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // --- Resize Logic ---
  const handleResizeDown = (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isResizing.current = true;
  };

  const handleResizeMove = (e: React.PointerEvent) => {
      if (isResizing.current) {
          e.preventDefault();
          e.stopPropagation();
          const maxWidth = window.innerWidth - position.x;
          const maxHeight = window.innerHeight - position.y;
          const newW = Math.min(Math.max(140, e.clientX - position.x), maxWidth);
          const newH = Math.min(Math.max(100, e.clientY - position.y), maxHeight);
          setSize({ w: newW, h: newH });
      }
  };

  const handleResizeUp = (e: React.PointerEvent) => {
      if (isResizing.current) {
          e.preventDefault();
          e.stopPropagation();
          isResizing.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
      }
  };

  const nextPalette = () => setPaletteIndex((prev) => (prev + 1) % PALETTES.length);
  const prevPalette = () => setPaletteIndex((prev) => (prev - 1 + PALETTES.length) % PALETTES.length);

  // Dynamic Blob Size: Area Based
  // Calculates size based on total available area (w * h) to fill space vertically and horizontally
  const headerHeight = 32;
  const padding = 16;
  const availableArea = size.w * Math.max(0, size.h - headerHeight - padding);
  const targetCount = 13; // Approx number of blobs + some buffer
  const calculatedSize = Math.sqrt(availableArea / targetCount) * 0.85; // 0.85 is spacing factor
  
  // Clamp size for usability
  const blobSize = Math.max(24, Math.min(64, calculatedSize));

  if (!isReady || !visible) return null;

  return (
    <div 
      className="fixed bg-[#121212]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl flex flex-col text-neutral-200 select-none z-50 ring-1 ring-black/50 overflow-hidden"
      style={{ 
          left: position.x, 
          top: position.y, 
          width: size.w, 
          height: size.h,
          touchAction: 'none' 
      }}
    >
      {/* Header - Compact */}
      <div 
        className="flex items-center justify-between p-1.5 border-b border-white/5 cursor-move group touch-none shrink-0 bg-white/5"
        onPointerDown={handlePanelDown}
        onPointerMove={handlePanelMove}
        onPointerUp={handlePanelUp}
        onPointerCancel={handlePanelUp}
      >
        {/* Navigation */}
        <div className="flex items-center gap-0.5 no-drag bg-black/20 rounded p-0.5">
            <button 
                onClick={prevPalette} 
                className="p-0.5 hover:text-white text-neutral-500 transition-colors"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-[9px] font-bold uppercase w-12 text-center text-neutral-300 select-none tracking-wide">
                {currentPalette.name}
            </span>
            <button 
                onClick={nextPalette} 
                className="p-0.5 hover:text-white text-neutral-500 transition-colors"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <ChevronRight className="w-3 h-3" />
            </button>
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-1">
            <div className="text-neutral-600 group-hover:text-neutral-500 transition-colors">
                <GripHorizontal className="w-3.5 h-3.5" />
            </div>
            <button 
                onClick={onClose} 
                className="text-neutral-500 hover:text-white p-0.5 no-drag" 
                onPointerDown={(e) => e.stopPropagation()}
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
      </div>

      {/* Swatches Grid */}
      <div className="p-2 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 flex-1 min-h-0">
         <div className="flex flex-wrap gap-1.5 justify-center content-start">
             {currentPalette.warm.map((c, i) => (
                 <PaintBlob key={`warm-${i}`} color={c} size={blobSize} onClick={() => onChange({ ...settings, color: c })} />
             ))}
         </div>
         <div className="w-full h-px bg-white/5 mx-auto w-[90%]" />
         <div className="flex flex-wrap gap-1.5 justify-center content-start">
             {currentPalette.cool.map((c, i) => (
                 <PaintBlob key={`cool-${i}`} color={c} size={blobSize} onClick={() => onChange({ ...settings, color: c })} />
             ))}
         </div>
      </div>

      {/* Resize Handle */}
      <div 
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center text-neutral-500 hover:text-white transition-colors z-50 touch-none"
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        onPointerCancel={handleResizeUp}
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="pointer-events-none">
            <path d="M6 9L9 6" />
            <path d="M2 9L9 2" />
        </svg>
      </div>
    </div>
  );
};
