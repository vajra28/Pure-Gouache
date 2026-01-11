
import React, { useState, useRef, useEffect } from 'react';
import { BrushSettings, BlendMode, Layer } from '../types';
import { GripVertical, Download, RotateCcw, Layers, Undo2, Redo2, X, Brush, Stamp, Plus, Trash2, Eye, EyeOff, Sun, Scan, Maximize, RotateCw, RefreshCw, Shuffle } from 'lucide-react';

interface FloatingToolbarProps {
  settings: BrushSettings;
  onChange: (s: BrushSettings) => void;
  onClear: () => void;
  onDownload: () => void;
  onUndo: () => void;
  onRedo: () => void;
  visible: boolean;
  onClose: () => void;
  isMobile?: boolean;
  // Layer Props
  layers?: Layer[];
  activeLayerId?: string;
  onSetActiveLayer?: (id: string) => void;
  onAddLayer?: () => void;
  onRemoveLayer?: (id: string) => void;
  onToggleLayerVisibility?: (id: string) => void;
  onToggleLayerGlow?: (id: string) => void;
  // Pattern Props
  onCapturePattern?: () => void;
}

const BLEND_MODES: { id: BlendMode; label: string; short: string }[] = [
  { id: 'source-over', label: 'Normal', short: 'N' },
  { id: 'multiply', label: 'Multiply', short: 'M' },
  { id: 'screen', label: 'Screen', short: 'S' },
  { id: 'color-dodge', label: 'Color Dodge', short: 'CD' },
  { id: 'overlay', label: 'Overlay', short: 'O' },
  { id: 'lighten', label: 'Lighten', short: 'L' },
  { id: 'darken', label: 'Darken', short: 'D' },
];

type ToolbarTab = 'brush' | 'layers' | 'pattern';

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ 
    settings, onChange, onClear, onDownload, onUndo, onRedo, visible, onClose, isMobile,
    layers, activeLayerId, onSetActiveLayer, onAddLayer, onRemoveLayer, onToggleLayerVisibility, onToggleLayerGlow,
    onCapturePattern
}) => {
  const [position, setPosition] = useState({ x: 16, y: 100 });
  const [activeTab, setActiveTab] = useState<ToolbarTab>('brush');
  const dragOffset = useRef<{x: number, y: number} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement>(null);

  // Default Position
  useEffect(() => {
     const targetH = 350;
     const safeY = Math.max(60, (window.innerHeight - targetH) / 2);
     setPosition({ x: 16, y: safeY });
  }, []);

  // Pattern Preview Logic
  useEffect(() => {
      if (activeTab !== 'pattern' || !patternCanvasRef.current) return;
      const canvas = patternCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!settings.patternTexture) {
          ctx.fillStyle = '#27272a';
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#52525b';
          ctx.fillText("NO PATTERN", canvas.width / 2, canvas.height / 2);
          return;
      }

      const img = new Image();
      img.src = settings.patternTexture;
      img.onload = () => {
          const baseVisualSize = Math.max(15, 50 * settings.patternScale);
          const stepX = baseVisualSize;
          const stepY = baseVisualSize;
          const jitterScale = settings.patternJitterScale || 0;
          const jitterRot = settings.patternJitterRotation || 0;
          const jitterHue = settings.patternJitterHue || 0;
          const jitterSat = settings.patternJitterSaturation || 0;
          const jitterVal = settings.patternJitterValue || 0;

          const w = canvas.width;
          const h = canvas.height;
          const startX = (w % stepX) / 2 - stepX; 
          const startY = (h % stepY) / 2 - stepY;

          ctx.save();
          
          for (let y = startY; y < h + stepY; y += stepY) {
              for (let x = startX; x < w + stepX; x += stepX) {
                  const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                  const rand1 = seed - Math.floor(seed);
                  const rand2 = (seed * 1.5) - Math.floor(seed * 1.5);
                  const rand3 = (seed * 2.0) - Math.floor(seed * 2.0);
                  const rand4 = (seed * 13.37) % 1;
                  const rand5 = (seed * 42.42) % 1;

                  let instanceRot = settings.patternStampRotation;
                  if (jitterRot > 0) {
                      const offset = (rand1 - 0.5) * 2.0 * (jitterRot * 180);
                      instanceRot = (instanceRot + offset) % 360;
                  }
                  const rad = (instanceRot + settings.patternAngle) * Math.PI / 180;

                  let instanceScale = settings.patternScale;
                  if (jitterScale > 0) {
                      const scaleMult = 1.0 + (rand2 - 0.5) * 2.0 * jitterScale;
                      instanceScale *= Math.max(0.1, scaleMult);
                  }

                  let filterString = '';
                  if (jitterHue > 0) { const hueOffset = (rand3 - 0.5) * 360 * jitterHue; filterString += `hue-rotate(${hueOffset}deg) `; }
                  if (jitterSat > 0) { const satMult = 100 + (Math.abs(rand4) - 0.5) * 200 * jitterSat; filterString += `saturate(${Math.max(0, satMult)}%) `; }
                  if (jitterVal > 0) { const valMult = 100 + (Math.abs(rand5) - 0.5) * 200 * jitterVal; filterString += `brightness(${Math.max(0, valMult)}%) `; }

                  const scaleFactor = (50 / img.width) * instanceScale;
                  const drawW = img.width * scaleFactor;
                  const drawH = img.height * scaleFactor;

                  ctx.save();
                  ctx.translate(x + stepX/2, y + stepY/2);
                  ctx.rotate(rad);
                  if (filterString) { ctx.filter = filterString.trim(); }
                  ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);
                  ctx.restore();
              }
          }
          ctx.restore();
      };
  }, [settings.patternTexture, settings.patternScale, settings.patternAngle, settings.patternStampRotation, settings.patternJitterRotation, settings.patternJitterScale, settings.patternJitterHue, settings.patternJitterSaturation, settings.patternJitterValue, activeTab]);

  const handlePanelDown = (e: React.PointerEvent) => {
    if (e.target instanceof SVGElement || (e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).closest('.no-drag')) return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
  };

  const handlePanelMove = (e: React.PointerEvent) => {
    if (dragOffset.current && containerRef.current) {
      e.preventDefault(); e.stopPropagation();
      let newX = e.clientX - dragOffset.current.x; 
      let newY = e.clientY - dragOffset.current.y;
      
      const rect = containerRef.current.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      
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
    e.preventDefault(); dragOffset.current = null; e.currentTarget.releasePointerCapture(e.pointerId);
  };

  if (!visible) return null;

  const currentMode = BLEND_MODES.find(m => m.id === settings.blendMode) || BLEND_MODES[0];
  const displayLayers = layers ? [...layers].reverse() : [];

  // Adaptive Styles based on Tab
  const containerStyle = {
      width: activeTab === 'brush' ? '200px' : '240px',
      borderRadius: '24px'
  };

  const renderBrushTab = () => (
      <div className="flex flex-col items-center gap-4 w-full px-2 py-2 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Size Slider */}
          <div className="flex flex-col gap-2 w-full group relative" title="Brush Size">
              <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <span>Size</span>
                  <span className="text-amber-500">{Math.round(settings.size)}px</span>
              </div>
              <input 
                  type="range" min="1" max="200" 
                  value={settings.size} 
                  onChange={(e) => onChange({ ...settings, size: Number(e.target.value) })}
                  className="w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer accent-amber-500"
              />
          </div>

          {/* Flow Slider */}
          <div className="flex flex-col gap-2 w-full group relative" title="Brush Flow">
              <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <span>Flow</span>
                  <span className="text-blue-500">{Math.round(settings.opacity * 100)}%</span>
              </div>
              <input 
                  type="range" min="1" max="100" 
                  value={settings.opacity * 100} 
                  onChange={(e) => onChange({ ...settings, opacity: Number(e.target.value) / 100 })}
                  className="w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer accent-blue-500"
              />
          </div>

          <div className="w-full h-px bg-white/10 shrink-0" />

          {/* Blend Mode */}
          <div className="w-full flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Blend</span>
              <div className="relative w-24 h-6 bg-zinc-800 hover:bg-zinc-700 rounded-md flex items-center justify-center group transition-colors border border-transparent hover:border-white/10" title="Blend Mode">
                  <span className="text-[10px] font-bold text-zinc-300 uppercase truncate px-2">{BLEND_MODES.find(m => m.id === settings.blendMode)?.label || 'Normal'}</span>
                  <select 
                    value={settings.blendMode} 
                    onChange={(e) => onChange({ ...settings, blendMode: e.target.value as BlendMode })} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs" 
                  > 
                    {BLEND_MODES.map(m => ( <option key={m.id} value={m.id}>{m.label}</option> ))} 
                  </select>
              </div>
          </div>
      </div>
  );

  const renderLayersTab = () => (
      <div className="flex flex-col w-full h-64 animate-in fade-in slide-in-from-left-4 duration-200">
          <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Layers</span>
              <button onClick={onAddLayer} className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors" title="New Layer">
                  <Plus className="w-3.5 h-3.5" />
              </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 pr-1">
              {displayLayers.map((layer) => (
                  <div 
                      key={layer.id}
                      onClick={() => onSetActiveLayer?.(layer.id)}
                      className={`group flex items-center gap-2 p-2 rounded-lg border border-transparent cursor-pointer transition-all duration-200 ${
                          layer.id === activeLayerId 
                          ? 'bg-indigo-500/20 border-indigo-500/30' 
                          : 'hover:bg-white/5 hover:border-white/5'
                      }`}
                  >
                      <button 
                          onClick={(e) => { e.stopPropagation(); onToggleLayerVisibility?.(layer.id); }}
                          className={`p-0.5 rounded hover:bg-white/10 transition-colors ${layer.visible ? 'text-zinc-400' : 'text-zinc-600'}`}
                      >
                          {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <div className="flex-1 min-w-0">
                          <span className={`text-[10px] font-semibold truncate block ${layer.id === activeLayerId ? 'text-indigo-200' : 'text-zinc-400'}`}>
                              {layer.name}
                          </span>
                      </div>
                      <button 
                          onClick={(e) => { e.stopPropagation(); onToggleLayerGlow?.(layer.id); }}
                          className={`p-1 rounded transition-colors ${layer.ignoreGlow ? 'text-orange-400' : 'text-zinc-700 hover:text-zinc-400'}`}
                          title="Toggle Light Interaction"
                      >
                          <Sun className="w-3 h-3" />
                      </button>
                      {displayLayers.length > 1 && (
                          <button 
                              onClick={(e) => { e.stopPropagation(); onRemoveLayer?.(layer.id); }}
                              className="p-1 text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                              <Trash2 className="w-3 h-3" />
                          </button>
                      )}
                  </div>
              ))}
          </div>
      </div>
  );

  const renderPatternTab = () => (
      <div className="flex flex-col w-full h-80 animate-in fade-in slide-in-from-left-4 duration-200 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 pr-1">
          {/* Visualizer Window */}
          <div className="space-y-2 shrink-0">
              <div className="flex justify-between items-end text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                  <span>Seamless Preview</span>
                  <span className={settings.patternTexture ? "text-emerald-400" : "text-zinc-600"}>{settings.patternTexture ? 'Active' : 'Empty'}</span>
              </div>
              <div className="w-full aspect-video rounded-lg ring-1 ring-white/10 overflow-hidden bg-black/40 shadow-inner relative group shrink-0">
                  <canvas 
                      ref={patternCanvasRef} 
                      width={200} 
                      height={110} 
                      className="w-full h-full object-cover opacity-80"
                  />
                  {settings.patternTexture && (
                      <button 
                          onClick={() => onChange({ ...settings, patternTexture: null })}
                          className="absolute top-2 right-2 p-1.5 bg-red-500/20 text-red-400 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                          title="Delete Pattern"
                      >
                          <Trash2 className="w-3 h-3" />
                      </button>
                  )}
              </div>
              <button onClick={onCapturePattern} className="w-full py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0">
                  <Scan className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-widest">Capture</span>
              </button>
          </div>
          
          <div className="w-full h-px bg-white/10 shrink-0" />

          {/* Transform Controls */}
          <div className="space-y-3 shrink-0">
               {[
                   { label: 'Scale', icon: Maximize, val: settings.patternScale, min: 0.1, max: 3.0, step: 0.1, key: 'patternScale', format: (v: number) => v.toFixed(1) + 'x' },
                   { label: 'Grid Angle', icon: RotateCw, val: settings.patternAngle, min: 0, max: 360, step: 1, key: 'patternAngle', format: (v: number) => Math.round(v) + '°' },
                   { label: 'Stamp Rot', icon: RefreshCw, val: settings.patternStampRotation, min: 0, max: 360, step: 1, key: 'patternStampRotation', format: (v: number) => Math.round(v) + '°' },
               ].map(c => (
                   <div key={c.key} className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-1"><c.icon className="w-3 h-3" /> {c.label}</span>
                          <span className="text-emerald-400">{c.format(c.val)}</span>
                      </div>
                      <input type="range" min={c.min} max={c.max} step={c.step} value={c.val} onChange={(e) => onChange({ ...settings, [c.key]: Number(e.target.value) })} className="w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer accent-emerald-500" />
                   </div>
               ))}
          </div>

          <div className="w-full h-px bg-white/10 shrink-0" />

          {/* Randomness */}
          <div className="space-y-3 shrink-0">
               <div className="flex items-center gap-2 text-[9px] font-bold uppercase text-zinc-500 tracking-widest mb-1">
                   <Shuffle className="w-3 h-3" /> <span>Chaos Engine</span>
               </div>
               {[
                   { label: 'Scale Jitter', key: 'patternJitterScale', val: settings.patternJitterScale },
                   { label: 'Rot Jitter', key: 'patternJitterRotation', val: settings.patternJitterRotation },
                   { label: 'Hue Shift', key: 'patternJitterHue', val: settings.patternJitterHue },
               ].map((item) => (
                  <div key={item.key} className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
                          <span>{item.label}</span>
                          <span className="text-emerald-400">{Math.round(item.val * 100)}%</span>
                      </div>
                      <input type="range" min="0" max="1" step="0.01" value={item.val} onChange={(e) => onChange({ ...settings, [item.key]: Number(e.target.value) })} className="w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer accent-emerald-500" />
                  </div>
               ))}
          </div>
      </div>
  );

  return (
    <div 
        ref={containerRef}
        className="fixed z-40 flex flex-col bg-zinc-900/60 backdrop-blur-md border border-white/10 shadow-2xl transition-[width,height,border-radius] duration-300 ease-spring ring-1 ring-black/50 overflow-hidden"
        style={{ left: position.x, top: position.y, touchAction: 'none', ...containerStyle, maxHeight: '80vh' }}
    >
        {/* Header / Tabs */}
        <div className="flex items-center justify-between p-1 border-b border-white/10 bg-white/5 shrink-0 no-drag">
             <div className="flex gap-1 w-full" onPointerDown={handlePanelDown} onPointerMove={handlePanelMove} onPointerUp={handlePanelUp} onPointerCancel={handlePanelUp}>
                 <button onClick={() => setActiveTab('brush')} className={`flex-1 p-1.5 rounded-lg flex justify-center transition-colors ${activeTab === 'brush' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Brush Tools"><Brush className="w-3.5 h-3.5" /></button>
                 <button onClick={() => setActiveTab('layers')} className={`flex-1 p-1.5 rounded-lg flex justify-center transition-colors ${activeTab === 'layers' ? 'bg-indigo-500/20 text-indigo-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Layers"><Layers className="w-3.5 h-3.5" /></button>
                 <button onClick={() => setActiveTab('pattern')} className={`flex-1 p-1.5 rounded-lg flex justify-center transition-colors ${activeTab === 'pattern' ? 'bg-emerald-500/20 text-emerald-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Pattern"><Stamp className="w-3.5 h-3.5" /></button>
             </div>
             {activeTab !== 'brush' && (
                 <div className="pl-1 cursor-move text-zinc-600 hover:text-white" onPointerDown={handlePanelDown} onPointerMove={handlePanelMove} onPointerUp={handlePanelUp} onPointerCancel={handlePanelUp}>
                     <GripVertical className="w-3.5 h-3.5" />
                 </div>
             )}
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col p-2 min-h-0">
            {activeTab === 'brush' && renderBrushTab()}
            {activeTab === 'layers' && renderLayersTab()}
            {activeTab === 'pattern' && renderPatternTab()}
        </div>

        <div className="w-full h-px bg-white/10 shrink-0" />

        {/* Footer Actions (Always Visible) */}
        <div className="flex justify-between items-center p-2 no-drag shrink-0 gap-1 bg-white/[0.02]">
             <button onClick={onUndo} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all" title="Undo"><Undo2 className="w-3.5 h-3.5" /></button>
             <button onClick={onRedo} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all" title="Redo"><Redo2 className="w-3.5 h-3.5" /></button>
             <button onClick={onDownload} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all" title="Save"><Download className="w-3.5 h-3.5" /></button>
             <button onClick={onClear} className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/30 transition-all" title="Clear"><RotateCcw className="w-3.5 h-3.5" /></button>
        </div>
    </div>
  );
};
