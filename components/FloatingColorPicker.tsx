
import React, { useState, useRef, useEffect } from 'react';
import { BrushSettings, BrushType } from '../types';
import { GripHorizontal, X, Brush, Square, Circle, Minus, Wind, Cloud, Lasso, StickyNote, Droplet, Zap, Ban, FlipHorizontal, SlidersHorizontal, Eye, BoxSelect, Hash, Sparkles, Sun, Sunset, Sunrise, Moon, CloudRain, Flame, PaintBucket, Eraser, Stamp, Spline, SprayCan, RectangleHorizontal, Blend, Thermometer, Eclipse } from 'lucide-react';
import { hexToHsv, hsvToHex, hexToRgb, rgbToHex, rgbToHsv, lerpColor } from '../utils/color';

interface FloatingColorPickerProps {
  settings: BrushSettings;
  onChange: (s: BrushSettings) => void;
  onClearMasks: () => void;
  onInvertMask: () => void;
  visible: boolean;
  onClose: () => void;
  grayscaleMode: boolean;
  onToggleGrayscale: () => void;
  isMobile?: boolean; 
}

type ViewMode = 'hsv' | 'rgb' | 'box';

const BRUSH_ICONS: Record<BrushType, React.FC<any>> = {
  flat: Square,
  round: Circle,
  chisel: Minus,
  hog: Brush,
  fan: Wind,
  fan2: Wind,
  fan3: Wind,
  pastel: Cloud,
  pastel2: Cloud,
};

const WARM_TINT = { r: 255, g: 160, b: 60 };
const COOL_TINT = { r: 40, g: 70, b: 110 };

const ArcTimeSlider = ({ value, onChange, size = 200 }: { value: number, onChange: (v: number) => void, size?: number }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const center = size / 2;
    const strokeWidth = 14; 
    const radius = (size / 2) - strokeWidth - 20; 
    const startAngle = 180;
    const totalSweep = 270;
    const valueToDeg = (v: number) => startAngle + v * totalSweep;
    const polarToCart = (deg: number, r: number = radius) => {
        const rad = deg * Math.PI / 180;
        return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
    };
    const handlePointer = (e: React.PointerEvent) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const dx = e.clientX - (rect.left + center);
        const dy = e.clientY - (rect.top + center);
        let deg = Math.atan2(dy, dx) * 180 / Math.PI;
        if (deg < 0) deg += 360;
        let shifted = deg - 180;
        if (shifted < 0) shifted += 360;
        let newValue = 0;
        if (shifted > 270) {
             if (shifted > 315) newValue = 0; 
             else newValue = 1;
        } else { newValue = shifted / 270; }
        onChange(Math.max(0, Math.min(1, newValue)));
    };
    const currentDeg = valueToDeg(value);
    const knob = polarToCart(currentDeg);
    const startP = polarToCart(startAngle);
    const endP = polarToCart(startAngle + totalSweep);
    const largeArc = totalSweep > 180 ? 1 : 0;
    const pathD = ["M", startP.x, startP.y, "A", radius, radius, 0, largeArc, 1, endP.x, endP.y].join(" ");
    const iconDist = radius + 22;
    const sunrisePos = polarToCart(180, iconDist);
    const noonPos = polarToCart(270, iconDist);
    const sunsetPos = polarToCart(360, iconDist);
    const nightPos = polarToCart(450, iconDist);

    return (
        <div className="relative flex flex-col items-center justify-center p-2 no-drag select-none">
             <svg 
                ref={svgRef} width={size} height={size} className="cursor-pointer touch-none drop-shadow-xl"
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e); }}
                onPointerMove={(e) => { if (e.buttons > 0) handlePointer(e); }}
                onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
             >
                 <defs><linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#ea580c" /><stop offset="50%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#312e81" /></linearGradient></defs>
                 <path d={pathD} fill="none" stroke="#18181b" strokeWidth={strokeWidth} strokeLinecap="round" />
                 <path d={pathD} fill="none" stroke="url(#trackGrad)" strokeWidth={strokeWidth} strokeLinecap="round" />
                 {[0, 0.33, 0.66, 1.0].map((v, i) => { const p = polarToCart(valueToDeg(v), radius - strokeWidth/2); const p2 = polarToCart(valueToDeg(v), radius + strokeWidth/2); return <line key={i} x1={p.x} y1={p.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.3)" strokeWidth="2" />; })}
                 <circle cx={knob.x} cy={knob.y} r={14} fill="#fff" stroke="#000" strokeWidth={2} className="shadow-lg shadow-black/50" />
                 <g transform={`translate(${sunrisePos.x}, ${sunrisePos.y})`} className="text-zinc-500"><Sunrise size={18} stroke="currentColor" x={-9} y={-9} /></g>
                 <g transform={`translate(${noonPos.x}, ${noonPos.y})`} className="text-zinc-500"><Sun size={20} stroke="currentColor" x={-10} y={-10} /></g>
                 <g transform={`translate(${sunsetPos.x}, ${sunsetPos.y})`} className="text-zinc-500"><Sunset size={18} stroke="currentColor" x={-9} y={-9} /></g>
                 <g transform={`translate(${nightPos.x}, ${nightPos.y})`} className="text-zinc-500"><Moon size={18} stroke="currentColor" x={-9} y={-9} /></g>
             </svg>
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none mt-4">
                 <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Local Time</span>
                 <span className="text-xl font-mono text-white font-bold tracking-tight">{value < 0.2 ? "DAWN" : value < 0.45 ? "DAY" : value < 0.75 ? "DUSK" : "NIGHT"}</span>
             </div>
        </div>
    );
};

export const FloatingColorPicker: React.FC<FloatingColorPickerProps> = ({ 
    settings, onChange, onClearMasks, onInvertMask, visible, onClose, grayscaleMode, onToggleGrayscale, isMobile
}) => {
  const [hsv, setHsv] = useState(() => hexToHsv(settings.color));
  const [viewMode, setViewMode] = useState<ViewMode>('hsv');
  const [showTools, setShowTools] = useState(false);
  
  // Temp Slider State
  const [tempValue, setTempValue] = useState(0);
  const tempBaseColorRef = useRef<string | null>(null);
  const tempSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingTempRef = useRef(false);

  // Composite Brightness Slider State
  const [compValue, setCompValue] = useState(0);
  const compBaseColorRef = useRef<string | null>(null);
  const compSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingCompRef = useRef(false);
  
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 260, h: 320 }); 
  const [isReady, setIsReady] = useState(false);
  const dragOffset = useRef<{x: number, y: number} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const isDraggingSliderRef = useRef<{ type: 'sv' | 'hue' | 'h' | 's' | 'v' | 'r' | 'g' | 'b' } | null>(null);
  const activeSliderRectRef = useRef<DOMRect | null>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const sliderRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { 
      let startX, startY;
      if (isMobile) {
          // Center horizontally and place near top on mobile
          startX = (window.innerWidth - size.w) / 2;
          startY = 100;
      } else {
          // Top right on desktop
          startX = Math.max(20, window.innerWidth - size.w - 20); 
          startY = 20; 
      }
      setPosition({ x: startX, y: startY }); 
      setIsReady(true); 
  }, []); 

  useEffect(() => { const handleResize = () => { setPosition(prev => { const maxX = window.innerWidth - 50; const maxY = window.innerHeight - 50; let newX = prev.x; let newY = prev.y; if (newX > maxX) newX = maxX; if (newY > maxY) newY = maxY; if (newX < 0) newX = 20; if (newY < 0) newY = 20; return { x: newX, y: newY }; }); }; window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
  
  useEffect(() => { 
      // Reset logic: Only sync HSV and reset sliders if change is external (not from dragging sliders)
      if (!isDraggingSliderRef.current && !isDraggingTempRef.current && !isDraggingCompRef.current) { 
          setHsv(hexToHsv(settings.color));
          setTempValue(0);
          setCompValue(0); 
      } 
  }, [settings.color]);

  const handlePanelDown = (e: React.PointerEvent) => { 
      // Allowed dragging on mobile now
      if (e.target instanceof SVGElement || (e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('.no-drag') || (e.target as HTMLElement).tagName === 'INPUT') return; 
      e.preventDefault(); 
      e.stopPropagation(); 
      e.currentTarget.setPointerCapture(e.pointerId); 
      if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
  };

  const handlePanelMove = (e: React.PointerEvent) => { 
      if (dragOffset.current && containerRef.current) { 
          e.preventDefault(); 
          e.stopPropagation(); 
          let newX = e.clientX - dragOffset.current.x; 
          let newY = e.clientY - dragOffset.current.y; 
          
          const maxX = window.innerWidth - 50; 
          const maxY = window.innerHeight - 50; 
          
          newX = Math.max(0, Math.min(newX, maxX)); 
          newY = Math.max(0, Math.min(newY, maxY)); 
          
          containerRef.current.style.left = `${newX}px`;
          containerRef.current.style.top = `${newY}px`;
      } 
  };

  const handlePanelUp = (e: React.PointerEvent) => { 
      if (dragOffset.current && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setPosition({ x: rect.left, y: rect.top });
      }
      e.preventDefault(); 
      dragOffset.current = null; 
      e.currentTarget.releasePointerCapture(e.pointerId); 
  };

  const handleResizeDown = (e: React.PointerEvent) => { if (isMobile) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); isResizing.current = true; };
  const handleResizeMove = (e: React.PointerEvent) => { if (isResizing.current && !isMobile) { e.preventDefault(); e.stopPropagation(); const newW = Math.max(260, e.clientX - position.x); const newH = Math.max(300, e.clientY - position.y); setSize({ w: newW, h: newH }); } };
  const handleResizeUp = (e: React.PointerEvent) => { if (isResizing.current) { e.preventDefault(); e.stopPropagation(); isResizing.current = false; e.currentTarget.releasePointerCapture(e.pointerId); } };
  const updateHsv = (newHsv: { h: number; s: number; v: number }) => { setHsv(newHsv); const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v); onChange({ ...settings, color: hex }); };
  const updateRgb = (r: number, g: number, b: number) => { const hex = rgbToHex(r, g, b); setHsv(rgbToHsv(r, g, b)); onChange({ ...settings, color: hex }); };
  const handleSvChange = (clientX: number, clientY: number) => { if (!activeSliderRectRef.current) return; const rect = activeSliderRectRef.current; const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)); updateHsv({ ...hsv, s: x, v: 1 - y }); };
  const handleHueStripChange = (clientX: number) => { if (!activeSliderRectRef.current) return; const rect = activeSliderRectRef.current; const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); updateHsv({ ...hsv, h: x * 360 }); };
  const handleLinearSliderChange = (clientX: number, type: string) => { if (!activeSliderRectRef.current) return; const rect = activeSliderRectRef.current; const val = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); if (type === 'h') updateHsv({ ...hsv, h: val * 360 }); if (type === 's') updateHsv({ ...hsv, s: val }); if (type === 'v') updateHsv({ ...hsv, v: val }); if (['r','g','b'].includes(type)) { const { r, g, b } = hexToRgb(settings.color); const intVal = Math.round(val * 255); if (type === 'r') updateRgb(intVal, g, b); if (type === 'g') updateRgb(r, intVal, b); if (type === 'b') updateRgb(r, g, intVal); } };
  const startSliderDrag = (e: React.PointerEvent, type: any) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); isDraggingSliderRef.current = { type }; let el: HTMLElement | null = null; if (type === 'sv') el = svRef.current; else if (type === 'hue') el = hueRef.current; else el = sliderRefs.current[type]; if (el) { activeSliderRectRef.current = el.getBoundingClientRect(); } if (type === 'sv') handleSvChange(e.clientX, e.clientY); else if (type === 'hue') handleHueStripChange(e.clientX); else handleLinearSliderChange(e.clientX, type); };
  const onSliderDrag = (e: React.PointerEvent) => { if (!isDraggingSliderRef.current) return; e.preventDefault(); e.stopPropagation(); const type = isDraggingSliderRef.current.type; if (type === 'sv') handleSvChange(e.clientX, e.clientY); else if (type === 'hue') handleHueStripChange(e.clientX); else handleLinearSliderChange(e.clientX, type); };
  const stopSliderDrag = (e: React.PointerEvent) => { e.preventDefault(); if (isDraggingSliderRef.current) { e.currentTarget.releasePointerCapture(e.pointerId); isDraggingSliderRef.current = null; activeSliderRectRef.current = null; } };

  // --- Temp Slider Logic ---
  const applyTempChange = (clientX: number) => {
      if (!tempSliderRef.current || !tempBaseColorRef.current) return;
      const rect = tempSliderRef.current.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, pct));
      const val = (clamped * 2) - 1; // -1 to 1
      setTempValue(val);

      const baseRgb = hexToRgb(tempBaseColorRef.current);
      const target = val > 0 ? WARM_TINT : COOL_TINT;
      const intensity = Math.abs(val) * 0.5; // Max 50% shift strength
      const newRgb = lerpColor(baseRgb, target, intensity);
      onChange({ ...settings, color: rgbToHex(newRgb.r, newRgb.g, newRgb.b) });
  };

  const startTempDrag = (e: React.PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingTempRef.current = true;
      tempBaseColorRef.current = settings.color;
      applyTempChange(e.clientX);
  };

  const onTempDrag = (e: React.PointerEvent) => {
      if (!isDraggingTempRef.current) return;
      e.preventDefault(); e.stopPropagation();
      applyTempChange(e.clientX);
  };

  const endTempDrag = (e: React.PointerEvent) => {
      e.preventDefault();
      if (isDraggingTempRef.current) {
          e.currentTarget.releasePointerCapture(e.pointerId);
          isDraggingTempRef.current = false;
          tempBaseColorRef.current = null;
      }
  };

  // --- Composite Brightness Slider Logic ---
  const applyCompChange = (clientX: number) => {
      if (!compSliderRef.current || !compBaseColorRef.current) return;
      const rect = compSliderRef.current.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, pct));
      const val = (clamped * 2) - 1; // -1 to 1
      setCompValue(val);

      let { h, s, v } = hexToHsv(compBaseColorRef.current);
      
      const intensity = Math.abs(val);
      // Power 1.5 gives a nice curve: sensitive in the center, broad at the ends
      const curvedIntensity = Math.pow(intensity, 1.5);
      
      if (val > 0) {
          // Brightening: Natural sunlight shift (Yellow-Orange ~50deg)
          const targetHue = 50; 
          let diff = targetHue - h;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          
          // Gentle hue shift towards warm light
          h = (h + diff * (curvedIntensity * 0.5)) % 360; 
          if (h < 0) h += 360;
          
          // Additive Value/Brightness mixing (simulates adding white/light)
          v = Math.min(1, v + (1 - v) * (curvedIntensity * 0.7)); 
          s = Math.max(0, s - (s * curvedIntensity * 0.4)); // Desaturate highlight
      } else {
          // Darkening: Shift towards Deep Indigo/Blue (~240deg)
          // Simulates Rayleigh scattering shadows
          const targetHue = 240;
          let diff = targetHue - h;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;

          // Stronger hue shift ensures Green passes through Turquoise -> Blue
          h = (h + diff * (curvedIntensity * 0.9)) % 360; 
          if (h < 0) h += 360;

          // Enrich Saturation: Shadows are often more saturated before hitting black
          s = Math.min(1, s + (1 - s) * (curvedIntensity * 0.6));

          // Multiplicative Value Drop
          // Prevents clipping to black too early, preserving deep colors (like dark turquoise/blue)
          // At max intensity, factor drops to ~0.02, effectively black but reachable.
          const darkFactor = 1.0 - (curvedIntensity * 0.98); 
          v = v * darkFactor;
          
          // Snap to true black only at the very end
          if (intensity > 0.99) v = 0;
      }

      onChange({ ...settings, color: hsvToHex(h, s, v) });
  };

  const startCompDrag = (e: React.PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingCompRef.current = true;
      compBaseColorRef.current = settings.color;
      applyCompChange(e.clientX);
  };

  const onCompDrag = (e: React.PointerEvent) => {
      if (!isDraggingCompRef.current) return;
      e.preventDefault(); e.stopPropagation();
      applyCompChange(e.clientX);
  };

  const endCompDrag = (e: React.PointerEvent) => {
      e.preventDefault();
      if (isDraggingCompRef.current) {
          e.currentTarget.releasePointerCapture(e.pointerId);
          isDraggingCompRef.current = false;
          compBaseColorRef.current = null;
      }
  };

  // --- Tool Toggles ---
  const resetTools = () => ({ isTapeMode: false, isLassoMode: false, isGradientMode: false, isLassoFill: false, isRectLassoFill: false, isStippleFill: false, isPatternLasso: false, isPatternLine: false, isGradBlend: false });
  const toggleBrush = (type: BrushType) => { onChange({ ...settings, ...resetTools(), brushType: type }); };
  const toggleLasso = () => { onChange({ ...settings, ...resetTools(), isLassoMode: !settings.isLassoMode }); };
  const toggleLassoFill = () => { onChange({ ...settings, ...resetTools(), isLassoFill: !settings.isLassoFill }); };
  const toggleRectLassoFill = () => { onChange({ ...settings, ...resetTools(), isRectLassoFill: !settings.isRectLassoFill }); };
  const toggleStippleFill = () => { onChange({ ...settings, ...resetTools(), isStippleFill: !settings.isStippleFill }); };
  const toggleTape = () => { onChange({ ...settings, ...resetTools(), isTapeMode: !settings.isTapeMode }); };
  const toggleGradient = () => { onChange({ ...settings, ...resetTools(), isGradientMode: !settings.isGradientMode }); };
  const toggleGradBlend = () => { onChange({ ...settings, ...resetTools(), isGradBlend: !settings.isGradBlend }); };
  
  const togglePatternLasso = () => { onChange({ ...settings, ...resetTools(), isPatternLasso: !settings.isPatternLasso }); };
  const togglePatternLine = () => { onChange({ ...settings, ...resetTools(), isPatternLine: !settings.isPatternLine }); };

  const currentRgb = hexToRgb(settings.color);
  const luminance = 0.299 * currentRgb.r + 0.587 * currentRgb.g + 0.114 * currentRgb.b;
  const displayColor = grayscaleMode ? `rgb(${luminance}, ${luminance}, ${luminance})` : settings.color;
  const isTiny = size.w < 160;

  const renderLinearSlider = (type: 'h'|'s'|'v'|'r'|'g'|'b', value: number, max: number, bgGradient: string, label: string) => (
      <div className="flex-1 min-h-[18px] flex items-center gap-2 text-[10px] font-mono group">
          <span className="w-2.5 font-bold text-zinc-500 flex-shrink-0">{label}</span>
          <div ref={(el) => { sliderRefs.current[type] = el; }} className="flex-1 h-2 relative rounded-full cursor-pointer ring-1 ring-white/5 overflow-hidden" style={{ background: bgGradient, touchAction: 'none' }} onPointerDown={(e) => startSliderDrag(e, type)} onPointerMove={onSliderDrag} onPointerUp={stopSliderDrag} onPointerCancel={stopSliderDrag}>
              <div className="absolute top-0 bottom-0 w-2 h-2 rounded-full bg-white shadow-sm -translate-x-1/2 pointer-events-none ring-1 ring-black/20" style={{ left: `${(value / max) * 100}%` }} />
          </div>
          {!isTiny && <span className="w-6 text-right text-zinc-400 flex-shrink-0">{Math.round(value)}</span>}
      </div>
  );

  const renderTempSlider = () => (
      <div className="flex-1 min-h-[18px] flex items-center gap-2 text-[10px] font-mono group mt-1" title="Color Temperature Shift">
          <Thermometer className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          <div 
              ref={tempSliderRef}
              className="flex-1 h-2 relative rounded-full cursor-ew-resize ring-1 ring-white/5 overflow-hidden bg-zinc-800"
              onPointerDown={startTempDrag}
              onPointerMove={onTempDrag}
              onPointerUp={endTempDrag}
              onPointerCancel={endTempDrag}
              style={{ touchAction: 'none' }}
          >
              <div className="absolute inset-0 opacity-80" style={{ background: 'linear-gradient(to right, #3b82f6, #71717a, #f97316)' }} />
              <div className="absolute top-0 bottom-0 w-px bg-white/30 left-1/2" />
              <div className="absolute top-0 bottom-0 w-2 h-2 rounded-full bg-white shadow-sm -translate-x-1/2 pointer-events-none ring-1 ring-black/20 transition-transform duration-75" style={{ left: `${((tempValue + 1) / 2) * 100}%` }} />
          </div>
          {!isTiny && <span className="w-6 text-right text-zinc-400 flex-shrink-0">{tempValue > 0 ? '+' : ''}{Math.round(tempValue * 100)}</span>}
      </div>
  );

  const renderCompositeSlider = () => (
      <div className="flex-1 min-h-[18px] flex items-center gap-2 text-[10px] font-mono group" title="Composite Brightness (Natural Light)">
          {compValue > 0 ? <Sun className="w-3 h-3 text-zinc-500 flex-shrink-0" /> : <Eclipse className="w-3 h-3 text-zinc-500 flex-shrink-0" />}
          <div 
              ref={compSliderRef}
              className="flex-1 h-2 relative rounded-full cursor-ew-resize ring-1 ring-white/5 overflow-hidden bg-zinc-800"
              onPointerDown={startCompDrag}
              onPointerMove={onCompDrag}
              onPointerUp={endCompDrag}
              onPointerCancel={endCompDrag}
              style={{ touchAction: 'none' }}
          >
              {/* Gradient: Dark Blue -> Neutral -> Yellow White */}
              <div className="absolute inset-0 opacity-80" style={{ background: 'linear-gradient(to right, #1e3a8a, #71717a, #fef08a)' }} />
              <div className="absolute top-0 bottom-0 w-px bg-white/30 left-1/2" />
              <div className="absolute top-0 bottom-0 w-2 h-2 rounded-full bg-white shadow-sm -translate-x-1/2 pointer-events-none ring-1 ring-black/20 transition-transform duration-75" style={{ left: `${((compValue + 1) / 2) * 100}%` }} />
          </div>
          {!isTiny && <span className="w-6 text-right text-zinc-400 flex-shrink-0">{compValue > 0 ? '+' : ''}{Math.round(compValue * 100)}</span>}
      </div>
  );

  if (!isReady || !visible) return null;
  let TimeIcon = Sun; const t = settings.gradientTime; if (t < 0.2 || t > 0.8) TimeIcon = Moon; else if (t < 0.4) TimeIcon = Sunrise; else if (t < 0.6) TimeIcon = Sun; else TimeIcon = Sunset;

  const containerStyle: React.CSSProperties = { 
      left: position.x, 
      top: position.y, 
      width: size.w, 
      height: size.h 
  };

  return (
    <div 
        ref={containerRef}
        className={`fixed bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 flex flex-col text-zinc-200 select-none z-50 overflow-hidden transition-[width,height] duration-200 ${isMobile ? 'animate-in fade-in zoom-in-95' : ''}`} 
        style={{ ...containerStyle, touchAction: 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-white/5 cursor-move group touch-none shrink-0 bg-white/[0.02]" onPointerDown={handlePanelDown} onPointerMove={handlePanelMove} onPointerUp={handlePanelUp} onPointerCancel={handlePanelUp}>
        <div className="flex items-center gap-2">
             {settings.isGradientMode ? ( <div className="flex items-center gap-2"> <TimeIcon className="w-4 h-4 text-orange-400" /> {!isTiny && <span className="font-bold text-[10px] tracking-widest text-zinc-400 uppercase">Atmosphere</span>} </div> ) : ( <> <div className="w-4 h-4 rounded-full shadow-inner ring-1 ring-white/10 transition-colors" style={{ backgroundColor: displayColor }} /> {!isTiny && <span className="font-bold text-[10px] tracking-widest text-zinc-400 uppercase">{grayscaleMode ? 'Value' : 'Color'}</span>} </> )}
        </div>
        <div className="flex items-center gap-1 no-drag">
             {(settings.isTapeMode || settings.isPatternLine) && ( <div className="flex items-center gap-1.5 mr-2 no-drag"> <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Width</span> <input type="range" min="5" max="150" value={settings.tapeWidth} onChange={(e) => onChange({ ...settings, tapeWidth: Number(e.target.value) })} className="w-16 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-indigo-500" title="Tape Width" onPointerDown={(e) => e.stopPropagation()} /> </div> )}
             {(!settings.isTapeMode && !settings.isGradientMode && !settings.isPatternLine && !settings.isPatternLasso && !settings.isGradBlend) && (
                <div className="flex gap-0.5 bg-zinc-800/50 p-0.5 rounded-lg border border-white/5">
                    <button onClick={() => onChange({ ...settings, wetMode: !settings.wetMode })} className={`p-1.5 rounded-md transition-colors ${settings.wetMode ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-500 hover:text-zinc-200'}`} title="Wet Blend"><Droplet className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onChange({ ...settings, autoClean: !settings.autoClean })} className={`p-1.5 rounded-md transition-colors ${settings.autoClean ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-500 hover:text-zinc-200'}`} title="Auto-Clean"><Sparkles className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onChange({ ...settings, pressureSensitivity: !settings.pressureSensitivity })} className={`p-1.5 rounded-md transition-colors ${settings.pressureSensitivity ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-500 hover:text-zinc-200'}`} title="Pressure"><Zap className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onChange({ ...settings, isEraser: !settings.isEraser })} className={`p-1.5 rounded-md transition-colors ${settings.isEraser ? 'text-red-400 bg-red-500/10' : 'text-zinc-500 hover:text-zinc-200'}`} title="Eraser"><Eraser className="w-3.5 h-3.5" /></button>
                </div>
             )}
            <div className="w-px h-4 bg-white/10 mx-1"></div>
             <button onClick={onInvertMask} className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 rounded-md transition-colors" title="Invert Mask"><FlipHorizontal className="w-3.5 h-3.5" /></button>
             <button onClick={onClearMasks} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors" title="Clear Mask"><Ban className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            
            <button onClick={() => setShowTools(!showTools)} className={`p-1.5 rounded-md transition-colors ${showTools ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'}`}><Brush className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            {!isMobile && <GripHorizontal className="w-3.5 h-3.5 text-zinc-600 pointer-events-none" />}
            <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 hover:bg-white/5 rounded-md transition-colors" onPointerDown={(e) => e.stopPropagation()}><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-2 gap-2 overflow-hidden relative">
        {/* Expandable Tools */}
        {showTools && (
            <div className="flex flex-col gap-1 p-1 bg-zinc-800/50 rounded-lg animate-in fade-in slide-in-from-top-2 shrink-0 no-drag border border-white/5">
                <div className={`grid ${isTiny ? 'grid-cols-4' : 'grid-cols-6'} gap-1`}>
                    {(Object.keys(BRUSH_ICONS) as BrushType[]).map((b) => {
                        const Icon = BRUSH_ICONS[b];
                        const isActive = settings.brushType === b && !settings.isTapeMode && !settings.isLassoMode && !settings.isGradientMode && !settings.isLassoFill && !settings.isRectLassoFill && !settings.isStippleFill && !settings.isPatternLasso && !settings.isPatternLine && !settings.isGradBlend;
                        return ( <button key={b} onClick={() => toggleBrush(b)} className={`h-8 flex items-center justify-center rounded-md transition-all ${isActive ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}> <Icon className="w-4 h-4" /> </button> )
                    })}
                    <button onClick={toggleLassoFill} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isLassoFill ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Lasso Fill"><PaintBucket className="w-4 h-4" /></button>
                    <button onClick={toggleRectLassoFill} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isRectLassoFill ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Rect Lasso Fill"><RectangleHorizontal className="w-4 h-4" /></button>
                    <button onClick={toggleGradBlend} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isGradBlend ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Grad Blend Lasso"><Blend className="w-4 h-4" /></button>
                    <button onClick={toggleStippleFill} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isStippleFill ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Stipple Fill"><SprayCan className="w-4 h-4" /></button>
                    <button onClick={toggleLasso} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isLassoMode ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Lasso Mask"><Lasso className="w-4 h-4" /></button>
                    <button onClick={toggleTape} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isTapeMode ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Tape Mask"><StickyNote className="w-4 h-4" /></button>
                    <button onClick={togglePatternLasso} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isPatternLasso ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Pattern Lasso Fill"><Stamp className="w-4 h-4" /></button>
                    <button onClick={togglePatternLine} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isPatternLine ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Pattern Line Stamp"><Spline className="w-4 h-4" /></button>
                    <button onClick={toggleGradient} className={`h-8 flex items-center justify-center rounded-md transition-all ${settings.isGradientMode ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`} title="Sky Gradient"><Sun className="w-4 h-4" /></button>
                </div>
                
                {/* Secondary Color Picker for GradBlend */}
                {settings.isGradBlend && (
                    <div className="mt-1 pt-1 border-t border-white/5 px-1 pb-1">
                        <div className="flex items-center justify-between text-[9px] font-bold uppercase text-zinc-400 tracking-wider">
                            <span>Secondary Color</span>
                            <div className="w-4 h-4 rounded-full shadow-inner ring-1 ring-white/10" style={{ backgroundColor: settings.gradColor2 }} />
                        </div>
                        <input 
                            type="color" 
                            value={settings.gradColor2} 
                            onChange={(e) => onChange({ ...settings, gradColor2: e.target.value })} 
                            className="w-full h-6 mt-1 bg-transparent cursor-pointer rounded overflow-hidden" 
                        />
                    </div>
                )}

                {/* Brush Dynamics Sliders */}
                <div className="mt-1 pt-1 border-t border-white/5 px-1 space-y-2 pb-1">
                    <div className="space-y-1">
                        <div className="flex justify-between text-[8px] text-zinc-400 font-bold uppercase tracking-wider">
                            <span>Thermal Drift</span>
                            <span className={settings.colorVariation > 0 ? "text-orange-400" : "text-zinc-600"}>{Math.round(settings.colorVariation * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={settings.colorVariation} onChange={(e) => onChange({ ...settings, colorVariation: Number(e.target.value) })} className="w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer accent-orange-500" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-[8px] text-zinc-400 font-bold uppercase tracking-wider">
                            <span>Hue Jitter</span>
                            <span className={settings.hueVariation > 0 ? "text-pink-400" : "text-zinc-600"}>{Math.round(settings.hueVariation * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={settings.hueVariation} onChange={(e) => onChange({ ...settings, hueVariation: Number(e.target.value) })} className="w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer accent-pink-500" />
                    </div>
                </div>
            </div>
        )}

        {settings.isGradientMode ? (
            <div className="flex-1 flex flex-col items-center p-2 animate-in fade-in zoom-in-95 overflow-hidden">
                <div className="flex-1 flex flex-col justify-center w-full">
                     <div className="mb-4 flex justify-center"> <ArcTimeSlider value={settings.gradientTime} onChange={(v) => onChange({ ...settings, gradientTime: v })} size={Math.min(size.w - 20, 240)} /> </div>
                     <div className="w-full px-2 space-y-3">
                         <div> <div className="flex justify-between items-end text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1"> <span className="flex items-center gap-1"><Sun size={12} /> Clear</span> <span className="flex items-center gap-1">Hazy <CloudRain size={12} /></span> </div> <div className="relative h-5 w-full rounded-full ring-1 ring-white/10 overflow-hidden group"> <div className="absolute inset-0 transition-colors duration-300" style={{ background: `linear-gradient(to right, #38bdf8, #94a3b8)` }} /> <div className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-100" style={{ opacity: settings.gradientHumidity * 0.5 }} /> <input type="range" min="0" max="1" step="0.01" value={settings.gradientHumidity} onChange={(e) => onChange({ ...settings, gradientHumidity: Number(e.target.value) })} className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" /> <div className="absolute top-0 bottom-0 w-1 bg-white shadow-lg pointer-events-none transition-transform duration-75" style={{ left: `${settings.gradientHumidity * 100}%` }} /> </div> </div>
                         <div> <div className="flex justify-between items-end text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1"> <span className="flex items-center gap-1"><Flame size={12} /> Glow</span> <span className="text-[10px] text-orange-400">{Math.round(settings.sunIntensity * 100)}%</span> </div> <div className="relative h-5 w-full rounded-full ring-1 ring-white/10 overflow-hidden group"> <div className="absolute inset-0 transition-colors duration-300" style={{ background: `linear-gradient(to right, #444, #ea580c)` }} /> <input type="range" min="0" max="1" step="0.01" value={settings.sunIntensity} onChange={(e) => onChange({ ...settings, sunIntensity: Number(e.target.value) })} className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" /> <div className="absolute top-0 bottom-0 w-1 bg-white shadow-lg pointer-events-none transition-transform duration-75" style={{ left: `${settings.sunIntensity * 100}%` }} /> </div> </div>
                     </div>
                </div>
            </div>
        ) : (
            <>
                <div className="flex p-1 bg-zinc-800/50 rounded-lg shrink-0 gap-1 no-drag border border-white/5">
                    <button onClick={() => setViewMode('hsv')} className={`flex-1 py-1 rounded-md flex items-center justify-center text-[10px] font-bold uppercase transition-all ${viewMode === 'hsv' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>HSV</button>
                    <button onClick={() => setViewMode('rgb')} className={`flex-1 py-1 rounded-md flex items-center justify-center text-[10px] font-bold uppercase transition-all ${viewMode === 'rgb' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>RGB</button>
                    <button onClick={() => setViewMode('box')} className={`flex-1 py-1 rounded-md flex items-center justify-center transition-all ${viewMode === 'box' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Box"><BoxSelect className="w-3.5 h-3.5" /></button>
                    <div className="w-px bg-white/10 my-0.5 mx-0.5"></div>
                    <button onClick={onToggleGrayscale} className={`flex-1 py-1 rounded-md flex items-center justify-center transition-colors ${grayscaleMode ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-200'}`} title="Value Check"><Eye className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex-1 flex flex-col gap-2 min-h-0 pt-1">
                    {viewMode === 'hsv' && ( <div className="flex flex-col gap-2 justify-center flex-1 min-h-0"> {renderLinearSlider('h', hsv.h, 360, 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)', 'H')} {renderLinearSlider('s', hsv.s * 100, 100, `linear-gradient(to right, #808080, ${hsvToHex(hsv.h, 1, hsv.v)})`, 'S')} {renderLinearSlider('v', hsv.v * 100, 100, `linear-gradient(to right, #000, ${hsvToHex(hsv.h, hsv.s, 1)})`, 'V')} <div className="min-h-[16px] flex-grow-[0.5] rounded-md mt-1 ring-1 ring-white/10" style={{ backgroundColor: displayColor }} /> </div> )}
                    {viewMode === 'rgb' && ( <div className="flex flex-col gap-2 justify-center flex-1 min-h-0"> {renderLinearSlider('r', currentRgb.r, 255, 'linear-gradient(to right, #000, #f00)', 'R')} {renderLinearSlider('g', currentRgb.g, 255, 'linear-gradient(to right, #000, #0f0)', 'G')} {renderLinearSlider('b', currentRgb.b, 255, 'linear-gradient(to right, #000, #00f)', 'B')} <div className="min-h-[16px] flex-grow-[0.5] rounded-md mt-1 ring-1 ring-white/10" style={{ backgroundColor: displayColor }} /> </div> )}
                    {viewMode === 'box' && ( <> <div ref={svRef} className="flex-1 w-full rounded-lg relative overflow-hidden cursor-crosshair shadow-inner ring-1 ring-white/10" style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)`, touchAction: 'none' }} onPointerDown={(e) => startSliderDrag(e, 'sv')} onPointerMove={onSliderDrag} onPointerUp={stopSliderDrag} onPointerCancel={stopSliderDrag}> <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #fff, transparent)' }} /> <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000, transparent)' }} /> <div className="absolute w-3 h-3 rounded-full border-2 border-white shadow-sm -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: settings.color }} /> </div> <div ref={hueRef} className="w-full h-3 rounded-full relative cursor-pointer ring-1 ring-white/10 overflow-hidden shrink-0 mt-1" style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)', touchAction: 'none' }} onPointerDown={(e) => startSliderDrag(e, 'hue')} onPointerMove={onSliderDrag} onPointerUp={stopSliderDrag} onPointerCancel={stopSliderDrag}> <div className="absolute w-2 h-full bg-white shadow-sm -translate-x-1/2 top-0 pointer-events-none ring-1 ring-black/20" style={{ left: `${(hsv.h / 360) * 100}%` }} /> </div> </> )}
                    
                    {/* Temperature Modifier Slider */}
                    {renderTempSlider()}
                    {/* Composite Brightness Slider */}
                    {renderCompositeSlider()}
                </div>
            </>
        )}
      </div>
      {!isMobile && (
          <div className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-colors z-50 touch-none" onPointerDown={handleResizeDown} onPointerMove={handleResizeMove} onPointerUp={handleResizeUp} onPointerCancel={handleResizeUp}> <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="pointer-events-none"> <path d="M6 9L9 6" /> <path d="M2 9L9 2" /> </svg> </div>
      )}
    </div>
  );
};
