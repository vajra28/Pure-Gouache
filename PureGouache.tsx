import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Controls } from './components/Controls';
import { Canvas, CanvasHandle } from './components/Canvas';
import { FloatingColorPicker } from './components/FloatingColorPicker';
import { ColorPanel } from './components/ColorPanel';
import { FloatingToolbar } from './components/FloatingToolbar';
import { BrushSettings, Layer } from './types';
import { Palette, Settings2, Brush, SlidersHorizontal } from 'lucide-react';

const DockButton = ({ icon: Icon, active, onClick, label }: any) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 min-w-[60px] ${active ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`}
        title={label}
    >
        <Icon className={`w-5 h-5 ${active ? 'stroke-2' : 'stroke-[1.5]'}`} />
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </button>
);

const PureGouache: React.FC = () => {
  const [settings, setSettings] = useState<BrushSettings>({
    brushType: 'flat',
    size: 60,
    opacity: 0.9,
    color: '#caa24f',
    wetMode: false,
    blendMode: 'source-over',
    pressureSensitivity: true,
    useTexture: true,
    isEraser: false,
    colorVariation: 0.1,
    hueVariation: 0.05,
    isTapeMode: false,
    tapeWidth: 30,
    isLassoMode: false,
    isLassoFill: false,
    isRectLassoFill: false, 
    isStippleFill: false,
    lassoMode: 'add',
    isGradientMode: false,
    
    // New Tool: Grad Blend Lasso
    isGradBlend: false,
    gradColor2: '#000000',

    // Pattern Defaults
    isPatternLasso: false,
    isPatternLine: false,
    patternTexture: null,
    patternScale: 1.0,
    patternAngle: 0,
    patternStampRotation: 0,
    patternJitterScale: 0.0,
    patternJitterRotation: 0.0,
    patternJitterHue: 0.0,
    patternJitterSaturation: 0.0,
    patternJitterValue: 0.0,

    gradientTime: 0.3, 
    gradientHumidity: 0.1,
    sunIntensity: 0.5,
    sunDiffusion: 0.6,
    
    // Physical Sky Defaults
    skyEnabled: false,
    sunEnabled: true,
    skyTime: 0.2,
    sunElevation: 0.2,
    skyHorizon: 0.6,
    sunAzimuth: 0.5,
    skyScale: 1.0,
    atmosphereDensity: 0.5,

    // Water Plane Defaults
    waterEnabled: false,
    waterLayerReflections: true,
    waterOpacity: 0.85,
    waterTurbulenceX: 0.3,
    waterTurbulenceY: 0.4,
    waterFractal: 0.5,

    // Lens Flare Defaults
    lensFlareEnabled: false,
    lensFlareIntensity: 0.6,
    lensFlareScale: 1.0,
    lensFlareHandleEnabled: true,
    flareTipPos: null,

    // 16mm Print Defaults
    filmEnabled: true,
    filmDensity: 0.0,
    filmHalation: 0.0,
    filmBloom: 0.0,
    filmGrain: 0.0,
    filmStock: 'Standard',

    autoClean: true,
    
    pictorialismEnabled: false,
    pictorialismNoise: 0.5,
    pictorialismSoftness: 0.5,

    risoEnabled: false,
    risoGrainScale: 1.0,
    risoColor1: '#1a1a2e', // Deep blue-black
    risoColor2: '#f0f0e0', // Off-white paper

    chromaticAberrationEnabled: false,
    chromaticAberrationIntensity: 0.5,
  });
  
  const [clearTrigger, setClearTrigger] = useState(0);
  const [clearTapeTrigger, setClearTapeTrigger] = useState(0);
  const [invertMaskTrigger, setInvertMaskTrigger] = useState(0);
  const [undoTrigger, setUndoTrigger] = useState(0);
  const [redoTrigger, setRedoTrigger] = useState(0);
  
  const [washTemp, setWashTemp] = useState(0.5);
  const [washIntensity, setWashIntensity] = useState(0.2);

  const [customTextureUrl, setCustomTextureUrl] = useState<string | null>(null);

  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [grayscaleMode, setGrayscaleMode] = useState(false);
  
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  // Default states: Desktop has panels open, mobile collapsed
  const [isControlsOpen, setIsControlsOpen] = useState(true);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(true);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Layer API state
  const [layerAPI, setLayerAPI] = useState<{
      layers: Layer[],
      activeLayerId: string,
      setActiveLayerId: (id: string) => void,
      addLayer: () => void,
      removeLayer: (id: string) => void,
      toggleLayerVisibility: (id: string) => void,
      toggleLayerGlow: (id: string) => void
  } | null>(null);

  const canvasRef = useRef<CanvasHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom); 

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Responsive Check
  useEffect(() => {
    const checkSize = () => {
        // Updated Detection: iPad Pro landscape is 1366px.
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallOrTablet = window.innerWidth <= 1366; 
        const mobile = isTouch && isSmallOrTablet;
        
        setIsMobile(mobile);
        
        if (mobile) {
            setIsControlsOpen(false);
            setIsPaletteOpen(false);
            setIsToolbarOpen(false);
            // Default to fit screen better on mobile
            setZoom(0.65);
        } else {
            setIsControlsOpen(true);
            setIsToolbarOpen(true);
            setIsColorPickerOpen(true);
            setIsPaletteOpen(true);
            setZoom(0.85);
        }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  const handlePan = useCallback((dx: number, dy: number) => {
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
        if ((e.target as HTMLElement).closest('.overflow-y-auto')) return;
        e.preventDefault();
        const delta = -e.deltaY;
        const sensitivity = e.ctrlKey ? 0.01 : 0.0015;
        setZoom(z => Math.min(Math.max(0.1, z + delta * sensitivity), 4.0));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      
      let startDist = 0;
      let startZoom = 0;
      let lastTouch = { x: 0, y: 0 };

      const handleTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 2) {
              e.preventDefault();
              startDist = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY
              );
              startZoom = zoomRef.current;
          } else if (e.touches.length === 1 && isSpacePressed) {
               lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }
      };

      const handleTouchMove = (e: TouchEvent) => {
          if (e.touches.length === 2) {
              e.preventDefault();
              const dist = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY
              );
              if (startDist > 0) {
                  const scale = dist / startDist;
                  setZoom(Math.min(Math.max(0.1, startZoom * scale), 4.0));
              }
          } else if (e.touches.length === 1 && isSpacePressed) {
              e.preventDefault();
              const dx = e.touches[0].clientX - lastTouch.x;
              const dy = e.touches[0].clientY - lastTouch.y;
              setPan(p => ({ x: p.x + dx, y: p.y + dy }));
              lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }
      };

      container.addEventListener('touchstart', handleTouchStart, { passive: false });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      
      return () => {
          container.removeEventListener('touchstart', handleTouchStart);
          container.removeEventListener('touchmove', handleTouchMove);
      };
  }, [isSpacePressed]);

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Skip if interacting with inputs
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

          // Space for Panning
          if (e.code === 'Space') {
              // e.preventDefault(); // Uncomment if you want to block page scroll
              setIsSpacePressed(true);
              return;
          }

          const isCtrlOrCmd = e.ctrlKey || e.metaKey;

          // Undo / Redo
          if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) {
                  setRedoTrigger(t => t + 1);
              } else {
                  setUndoTrigger(t => t + 1);
              }
              return;
          }
          if (isCtrlOrCmd && e.key.toLowerCase() === 'y') {
              e.preventDefault();
              setRedoTrigger(t => t + 1);
              return;
          }

          // Save / Export
          if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
              e.preventDefault();
              if (canvasRef.current) {
                  canvasRef.current.downloadImage();
              }
              return;
          }

          // Tool Toggles (No Modifiers)
          if (!isCtrlOrCmd && !e.altKey && !e.shiftKey) {
              switch (e.key.toLowerCase()) {
                  case 'w':
                      setSettings(s => ({ ...s, wetMode: !s.wetMode }));
                      break;
                  case 'e':
                      setSettings(s => ({ ...s, isEraser: !s.isEraser }));
                      break;
                  case '[':
                      setSettings(s => ({ ...s, size: Math.max(1, s.size - 5) }));
                      break;
                  case ']':
                      setSettings(s => ({ ...s, size: Math.min(200, s.size + 5) }));
                      break;
              }
          }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.code === 'Space') setIsSpacePressed(false);
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  const handleExport = (is4k: boolean) => {
      if (canvasRef.current) {
          canvasRef.current.downloadImage({ 
              width: is4k ? 3840 : undefined, 
              height: is4k ? 2160 : undefined 
          });
      }
  };

  const handleCapturePattern = () => {
      if (canvasRef.current) {
          const pattern = canvasRef.current.capturePattern();
          if (pattern) {
             setSettings(s => ({ ...s, patternTexture: pattern }));
             // Pattern tools are handled in FloatingToolbar, no need for separate panel toggle
          }
      }
  };

  const handleUploadTexture = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const url = URL.createObjectURL(e.target.files[0]);
          setCustomTextureUrl(url);
          setSettings(s => ({ ...s, useTexture: true, skyEnabled: false }));
      }
  };

  const toggleMobilePanel = (panel: 'controls' | 'picker' | 'palette' | 'toolbar') => {
      setIsControlsOpen(panel === 'controls' ? !isControlsOpen : false);
      setIsColorPickerOpen(panel === 'picker' ? !isColorPickerOpen : false);
      setIsPaletteOpen(panel === 'palette' ? !isPaletteOpen : false);
      setIsToolbarOpen(panel === 'toolbar' ? !isToolbarOpen : false);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-zinc-950 overflow-hidden overscroll-none touch-none">
      
      <Canvas 
        ref={canvasRef}
        settings={settings}
        onChange={setSettings}
        canvasColor="#f0f0f0"
        triggerClear={clearTrigger}
        triggerClearTape={clearTapeTrigger}
        triggerInvertMask={invertMaskTrigger}
        triggerUndo={undoTrigger}
        triggerRedo={redoTrigger}
        onPickColor={(c) => setSettings(s => ({ ...s, color: c }))}
        zoom={zoom}
        pan={pan}
        onPan={handlePan}
        isSpacePressed={isSpacePressed}
        customTextureUrl={customTextureUrl}
        grayscaleMode={grayscaleMode}
        onLayerMethodsReady={setLayerAPI}
        washTemp={washTemp}
        washIntensity={washIntensity}
        width={1080}
        height={1080}
        isMobile={isMobile}
      />

      {/* --- Desktop Bottom Tray --- */}
      {!isMobile && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50">
             <DockButton icon={Brush} active={isColorPickerOpen} onClick={() => setIsColorPickerOpen(!isColorPickerOpen)} label="Brush" />
             <DockButton icon={SlidersHorizontal} active={isToolbarOpen} onClick={() => setIsToolbarOpen(!isToolbarOpen)} label="Tools" />
             <DockButton icon={Palette} active={isPaletteOpen} onClick={() => setIsPaletteOpen(!isPaletteOpen)} label="Colors" />
             <DockButton icon={Settings2} active={isControlsOpen} onClick={() => setIsControlsOpen(!isControlsOpen)} label="Settings" />
          </div>
      )}

      {/* --- Mobile Dock --- */}
      {isMobile && (
          <div className="fixed bottom-0 left-0 w-full h-[72px] bg-zinc-950/80 backdrop-blur-2xl border-t border-white/5 z-[60] flex items-center justify-between px-6 pb-safe safe-area-bottom shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <button onClick={() => toggleMobilePanel('picker')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${isColorPickerOpen ? 'text-indigo-400' : 'text-zinc-500'}`}>
                  <Brush className={`w-6 h-6 ${isColorPickerOpen ? 'stroke-2' : 'stroke-[1.5]'}`} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Brush</span>
              </button>
              <button onClick={() => toggleMobilePanel('toolbar')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${isToolbarOpen ? 'text-indigo-400' : 'text-zinc-500'}`}>
                  <SlidersHorizontal className={`w-6 h-6 ${isToolbarOpen ? 'stroke-2' : 'stroke-[1.5]'}`} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Tools</span>
              </button>
              <button onClick={() => toggleMobilePanel('palette')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${isPaletteOpen ? 'text-indigo-400' : 'text-zinc-500'}`}>
                  <Palette className={`w-6 h-6 ${isPaletteOpen ? 'stroke-2' : 'stroke-[1.5]'}`} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Color</span>
              </button>
              <button onClick={() => toggleMobilePanel('controls')} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${isControlsOpen ? 'text-indigo-400' : 'text-zinc-500'}`}>
                  <Settings2 className={`w-6 h-6 ${isControlsOpen ? 'stroke-2' : 'stroke-[1.5]'}`} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Settings</span>
              </button>
          </div>
      )}

      {/* --- UI Components --- */}
      
      {/* Right Dock (Vertical Icons) */}
      <Controls 
        settings={settings}
        onChange={setSettings}
        washTemp={washTemp}
        onWashChange={setWashTemp}
        washIntensity={washIntensity}
        onWashIntensityChange={setWashIntensity}
        onUploadTexture={handleUploadTexture}
        isOpen={isControlsOpen}
        onClose={() => setIsControlsOpen(false)}
        isMobile={isMobile}
        onExport={handleExport}
      />

      {/* Main HUD (Color Picker & Brush Window) */}
      <FloatingColorPicker 
        settings={settings}
        onChange={setSettings}
        onClearMasks={() => setClearTapeTrigger(t => t + 1)}
        onInvertMask={() => setInvertMaskTrigger(t => t + 1)}
        visible={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        grayscaleMode={grayscaleMode}
        onToggleGrayscale={() => setGrayscaleMode(!grayscaleMode)}
        isMobile={isMobile}
      />

      {/* Floatable Color Palette */}
      <ColorPanel 
        settings={settings}
        onChange={setSettings}
        visible={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        isMobile={isMobile}
      />

      {/* Unified Left Toolbar (Brush, Layers, Patterns) */}
      <FloatingToolbar 
        settings={settings}
        onChange={setSettings}
        onClear={() => setClearTrigger(t => t + 1)}
        onDownload={() => handleExport(false)}
        onUndo={() => setUndoTrigger(t => t + 1)}
        onRedo={() => setRedoTrigger(t => t + 1)}
        visible={isToolbarOpen}
        onClose={() => setIsToolbarOpen(false)}
        isMobile={isMobile}
        // Layer Props
        layers={layerAPI?.layers}
        activeLayerId={layerAPI?.activeLayerId}
        onSetActiveLayer={layerAPI?.setActiveLayerId}
        onAddLayer={layerAPI?.addLayer}
        onRemoveLayer={layerAPI?.removeLayer}
        onToggleLayerVisibility={layerAPI?.toggleLayerVisibility}
        onToggleLayerGlow={layerAPI?.toggleLayerGlow}
        // Pattern Props
        onCapturePattern={handleCapturePattern}
      />

    </div>
  );
};

export default PureGouache;
