import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { BrushSettings, Layer } from '../types';
import { useGouacheEngine, AtmosphereState } from '../hooks/useGouacheEngine';
import { processPaperTexture, createNoiseTexture } from '../utils/canvasUtils';
import { hexToRgb, lerpColor, rgbToString, rgbToHex } from '../utils/color';

interface CanvasProps {
  settings: BrushSettings;
  onChange?: (s: BrushSettings) => void;
  canvasColor: string;
  triggerClear: number;
  triggerClearTape: number;
  triggerInvertMask: number;
  triggerUndo: number;
  triggerRedo: number;
  onPickColor: (color: string) => void;
  zoom: number;
  pan: { x: number, y: number };
  onPan: (dx: number, dy: number) => void;
  isSpacePressed: boolean;
  customTextureUrl: string | null;
  grayscaleMode: boolean;
  onLayerMethodsReady?: (methods: any) => void;
  width: number;  
  height: number;
  washTemp: number;
  washIntensity: number;
}

export interface CanvasHandle {
  downloadImage: (options?: { width?: number, height?: number }) => void;
  capturePattern: () => string | null;
}

// Color Matrices for Film Emulation
const STOCK_MATRICES: Record<string, string> = {
    'Standard': '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
    'Kodak 2383': '1.1 0 0 0 -0.05  0 1.05 0 0 -0.02  0 0 0.9 0 0.05  0 0 0 1 0',
    'Kodak Portra 400': '1.05 0 0 0 0.03  0 1.02 0 0 0.02  0 0 0.95 0 -0.02  0 0 0 1 0',
    'Kodak Ektar 100': '1.3 0 0 0 -0.15  0 1.2 0 0 -0.1  0 0 1.1 0 -0.05  0 0 0 1 0',
    'Cinestill 800T': '0.9 0 0 0 0  0 1.0 0 0 0.05  0 0 1.2 0 0.1  0 0 0 1 0',
    'Fuji Velvia 50': '1.0 0 0 0 0  0 0.9 0 0 0  0 0 1.1 0 0.05  0 0 0 1 0',
    'Ilford HP5 Plus': '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0'
};

const parseColor = (str: string) => {
    if (!str) return { r: 0, g: 0, b: 0 };
    if (str.startsWith('#')) return hexToRgb(str);
    const match = str.match(/\d+/g);
    if (match && match.length >= 3) return { r: Number(match[0]), g: Number(match[1]), b: Number(match[2]) };
    return { r: 0, g: 0, b: 0 };
};

const calculateGrainMatrix = (intensity: number) => {
    const s = intensity; 
    const o = 0.5 - (0.5 * s);
    return `${s} 0 0 0 ${o}  0 ${s} 0 0 ${o}  0 0 ${s} 0 ${o}  0 0 0 1 0`;
};

// Fractal Noise for Water Displacement
const fractalNoise = (t: number, octaves: number = 3) => {
    let val = 0;
    let amp = 1;
    let freq = 1;
    let max = 0;
    for(let i=0; i<octaves; i++) {
        val += Math.sin(t * freq * 10 + (i*13.2)) * amp;
        max += amp;
        amp *= 0.5;
        freq *= 2.5;
    }
    return val / max;
};

// --- FLARE DEFINITIONS ---
type FlareElementDef = {
    type: 'streak' | 'poly' | 'circle';
    pos: number;
    baseSize: number;
    color: number[];
    alpha: number;
    blur?: number; 
    height?: number;
    sides?: number;
    noise?: boolean;
    isSoft?: boolean; 
};

const FLARE_ELEMENTS: FlareElementDef[] = [
    { type: 'streak', pos: 0.0, baseSize: 1400, height: 3, color: [200, 230, 255], alpha: 0.15, blur: 4 }, 
    { type: 'poly', sides: 4, pos: 0.15, baseSize: 40, color: [100, 200, 255], alpha: 0.4, blur: 2, noise: true },
    { type: 'poly', sides: 4, pos: 0.22, baseSize: 25, color: [150, 255, 220], alpha: 0.3, blur: 1, noise: true },
    { type: 'circle', pos: 0.45, baseSize: 140, color: [200, 255, 150], alpha: 0.08, isSoft: true }, 
    { type: 'circle', pos: 0.6, baseSize: 180, color: [220, 255, 100], alpha: 0.05, isSoft: true },
    { type: 'circle', pos: 0.85, baseSize: 90, color: [255, 180, 100], alpha: 0.15, isSoft: true, noise: true },
    { type: 'poly', sides: 5, pos: 1.0, baseSize: 60, color: [255, 100, 50], alpha: 0.2, blur: 3, noise: true },
    { type: 'circle', pos: 1.1, baseSize: 110, color: [255, 50, 50], alpha: 0.05, isSoft: true },
];

const drawGeometricLensFlare = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number, 
    sunX: number, 
    sunY: number, 
    sunColor: { r: number, g: number, b: number },
    intensity: number,
    globalScale: number,
    userFlareScale: number,
    skyScale: number,
    tipX: number,
    tipY: number
) => {
    if (intensity <= 0.01) return;
    const vecX = tipX - sunX;
    const vecY = tipY - sunY;
    const scale = globalScale * userFlareScale * Math.max(0.8, skyScale); 
    const noiseFill = `rgba(255, 255, 255, ${0.15 * intensity})`;

    FLARE_ELEMENTS.forEach(el => {
        const px = sunX + (vecX * el.pos);
        const py = sunY + (vecY * el.pos);
        const size = el.baseSize * scale;
        
        const tintFactor = 0.3;
        const r = Math.round(el.color[0] * (1 - tintFactor) + sunColor.r * tintFactor);
        const g = Math.round(el.color[1] * (1 - tintFactor) + sunColor.g * tintFactor);
        const b = Math.round(el.color[2] * (1 - tintFactor) + sunColor.b * tintFactor);
        const finalAlpha = el.alpha * intensity;
        const colorStr = `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;

        ctx.save();
        ctx.globalCompositeOperation = 'screen'; 

        if (el.type === 'streak') {
            ctx.translate(px, py);
            if (el.blur) ctx.filter = `blur(${el.blur * scale}px)`; 
            ctx.fillStyle = colorStr;
            ctx.beginPath();
            ctx.ellipse(0, 0, size, (el.height || 2) * scale, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (el.isSoft) {
            const grad = ctx.createRadialGradient(px, py, 0, px, py, size);
            grad.addColorStop(0, colorStr);
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            if (el.blur) ctx.filter = `blur(${el.blur * scale}px)`;
            ctx.fillStyle = colorStr;
            ctx.beginPath();
            if (el.type === 'circle') {
                ctx.arc(px, py, size, 0, Math.PI * 2);
            } else {
                const sides = el.sides || 3;
                for (let i = 0; i < sides; i++) {
                    const angle = (i * 2 * Math.PI / sides) - (Math.PI / 2);
                    const vx = px + size * Math.cos(angle);
                    const vy = py + size * Math.sin(angle);
                    if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
                }
                ctx.closePath();
            }
            ctx.fill();
        }

        if (el.noise) {
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = noiseFill;
            const count = Math.min(10, Math.floor(size * 0.2));
            for (let k = 0; k < count; k++) {
                const nx = px + (Math.random() - 0.5) * size;
                const ny = py + (Math.random() - 0.5) * size;
                const nSize = (Math.random() * 2 + 1) * scale;
                ctx.fillRect(nx, ny, nSize, nSize);
            }
        }
        ctx.restore();
    });
};

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ 
    settings, onChange, canvasColor, triggerClear, triggerClearTape, triggerInvertMask, triggerUndo, triggerRedo, onPickColor,
    zoom, pan, onPan, isSpacePressed, customTextureUrl, grayscaleMode, onLayerMethodsReady, width: docWidth, height: docHeight,
    washTemp, washIntensity
}, ref) => {
  const layerRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const maskRef = useRef<HTMLCanvasElement>(null); 
  const skyOcclusionRef = useRef<HTMLCanvasElement>(null); 
  const waterCanvasRef = useRef<HTMLCanvasElement>(null);
  const lensFlareRef = useRef<HTMLCanvasElement>(null); 
  const cursorRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tempReflectionRef = useRef<HTMLCanvasElement | null>(null);
  const sunBufferRef = useRef<HTMLCanvasElement | null>(null);

  
  const [visualTexture, setVisualTexture] = useState<string | null>(null);
  const [tapeStart, setTapeStart] = useState<{x: number, y: number} | null>(null);
  const [tapeCurrent, setTapeCurrent] = useState<{x: number, y: number} | null>(null);
  const [lassoPoints, setLassoPoints] = useState<{x: number, y: number}[]>([]);
  const [isLassoing, setIsLassoing] = useState(false);
  const [gradientStart, setGradientStart] = useState<{x: number, y: number} | null>(null);
  const [gradientCurrent, setGradientCurrent] = useState<{x: number, y: number} | null>(null);
  const gradientVectorRef = useRef<{start: {x:number,y:number}, end: {x:number,y:number}} | null>(null);
  const isPanning = useRef(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  
  const [isDraggingFlare, setIsDraggingFlare] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);

  // New: Rect Lasso
  const [rectLassoStart, setRectLassoStart] = useState<{x: number, y: number} | null>(null);
  const [rectLassoCurrent, setRectLassoCurrent] = useState<{x: number, y: number} | null>(null);

  // New: Dirty state for reflection caching
  const reflectionDirtyRef = useRef(true);
  const prevHorizonRef = useRef(0);

  // Constants for Wash Calculation
  const WARM_TINT = { r: 255, g: 160, b: 60 };
  const COOL_TINT = { r: 40, g: 70, b: 110 };

  const effectiveCanvasColor = useMemo(() => {
      if (washIntensity <= 0.01) return canvasColor;
      const base = hexToRgb(canvasColor);
      const tint = lerpColor(COOL_TINT, WARM_TINT, washTemp);
      const final = lerpColor(base, tint, washIntensity * 0.3);
      return rgbToHex(final.r, final.g, final.b);
  }, [canvasColor, washTemp, washIntensity]);

  const { 
      init, startStroke, endStroke, drawBatch, clear, pickColor, drawTape, drawLasso, drawLassoFill, drawRectLassoFill,
      drawStippleLasso, drawPatternLasso, drawPatternLine, drawGradBlendLasso, capturePattern,
      clearMask, invertMask, renderBrushCursor, undo, redo, drawSkyGradient, commitSnapshot, cancelSnapshot, atmosphere, 
      layers, activeLayerId, setActiveLayerId, addLayer, removeLayer, toggleLayerVisibility, toggleLayerGlow, setPaperTexture 
  } = useGouacheEngine(settings, effectiveCanvasColor, docWidth, docHeight);

  // Use refs for animation loop data to avoid react effect re-runs (stutter fix)
  // FIX: Allow inference or explicit MutableRefObject to avoid readonly 'current' errors
  const settingsRef = useRef(settings);
  const atmosphereRef = useRef(atmosphere);
  const layersRef = useRef(layers);
  const drawWaterPlaneRef = useRef<any>(null); // assigned below

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { atmosphereRef.current = atmosphere; }, [atmosphere]);
  useEffect(() => { 
      layersRef.current = layers; 
      reflectionDirtyRef.current = true;
  }, [layers]);
  
  useEffect(() => { reflectionDirtyRef.current = true; }, [settings.waterLayerReflections]);

  // --- Keyboard Handling for Alt Key ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(true);
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'Alt') setIsAltPressed(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  useEffect(() => { if (triggerClear > 0) { clear(); reflectionDirtyRef.current = true; } }, [triggerClear, clear]);
  useEffect(() => { if (triggerUndo > 0) { undo(); reflectionDirtyRef.current = true; } }, [triggerUndo, undo]);
  useEffect(() => { if (triggerRedo > 0) { redo(); reflectionDirtyRef.current = true; } }, [triggerRedo, redo]);
  useEffect(() => { if (triggerClearTape > 0) { clearMask(); reflectionDirtyRef.current = true; } }, [triggerClearTape, clearMask]);
  useEffect(() => { if (triggerInvertMask > 0) { invertMask(); reflectionDirtyRef.current = true; } }, [triggerInvertMask, invertMask]);

  useEffect(() => {
      if (maskRef.current) {
          const getLayerCanvas = (id: string) => layerRefs.current.get(id) || null;
          init(getLayerCanvas, maskRef.current);
      }
      if (!tempReflectionRef.current) tempReflectionRef.current = document.createElement('canvas');
      if (!sunBufferRef.current) sunBufferRef.current = document.createElement('canvas');
  }, [init, layers, docWidth, docHeight]); 

  // --- Texture Loader ---
  useEffect(() => {
      const loadTexture = async () => {
          let res;
          if (customTextureUrl) {
              const img = new Image();
              img.crossOrigin = "Anonymous";
              img.src = customTextureUrl;
              await new Promise((resolve) => { img.onload = resolve; });
              res = processPaperTexture(img, docWidth, docHeight);
          } else {
              res = await createNoiseTexture(docWidth, docHeight);
          }
          
          if (res) {
              setVisualTexture(res.visual.toDataURL());
              setPaperTexture(res.heightMap);
          }
      };
      loadTexture();
  }, [customTextureUrl, docWidth, docHeight, setPaperTexture]);

  // ADDED: Resize logic for cursor canvas to match document dimensions
  useEffect(() => {
      const dpr = window.devicePixelRatio || 1;
      if (cursorRef.current) {
          cursorRef.current.width = docWidth * dpr;
          cursorRef.current.height = docHeight * dpr;
      }
  }, [docWidth, docHeight]);

  const layerMethods = useMemo(() => ({
      layers, activeLayerId, setActiveLayerId, addLayer, removeLayer, toggleLayerVisibility, toggleLayerGlow
  }), [layers, activeLayerId, setActiveLayerId, addLayer, removeLayer, toggleLayerVisibility, toggleLayerGlow]);

  useEffect(() => {
      if (onLayerMethodsReady) {
          onLayerMethodsReady(layerMethods);
      }
  }, [layerMethods, onLayerMethodsReady]);

  useEffect(() => {
    if (settings.isGradientMode && gradientVectorRef.current) {
        drawSkyGradient(gradientVectorRef.current.start, gradientVectorRef.current.end, true);
    }
  }, [settings.gradientTime, settings.gradientHumidity, settings.isGradientMode]);

  useEffect(() => {
    if (!settings.isGradientMode) {
        commitSnapshot();
        gradientVectorRef.current = null;
    }
  }, [settings.isGradientMode, commitSnapshot]);

  const drawWaterPlane = (
      ctx: CanvasRenderingContext2D, 
      width: number, 
      height: number, 
      horizonY: number, 
      sunX: number, 
      sunY: number, 
      skyGrad: CanvasGradient,
      sunColor: string,
      horizonColor: string
  ) => {
      const renderScale = 0.5;
      const scaleFactor = width / (docWidth || 1);
      const trailHeight = height - horizonY;
      const turbulenceX = settings.waterTurbulenceX;
      const turbulenceY = settings.waterTurbulenceY;
      const fractal = settings.waterFractal;
      const safeDocWidth = docWidth || 1;
      const steps = 60 + Math.floor(fractal * 100); 
      const octaves = 1 + Math.floor(fractal * 3);
      const pillarBaseWidth = (30 + turbulenceX * 120) * settings.skyScale * (width/safeDocWidth);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizonY, width, height - horizonY);
      ctx.clip();

      if (settings.waterEnabled && settings.waterLayerReflections) {
          const tempC = tempReflectionRef.current;
          if (tempC) {
              const tempW = Math.floor(width * renderScale);
              const tempH = Math.floor(height * renderScale);
              
              const sizeChanged = tempC.width !== tempW || tempC.height !== tempH;
              if (sizeChanged) {
                  tempC.width = tempW;
                  tempC.height = tempH;
              }
              
              const horizonChanged = Math.abs(prevHorizonRef.current - horizonY) > 0.5;
              const needsUpdate = sizeChanged || horizonChanged || reflectionDirtyRef.current;

              const tCtx = tempC.getContext('2d');
              if (tCtx) {
                  if (needsUpdate) {
                      tCtx.clearRect(0, 0, tempW, tempH);
                      tCtx.save();
                      tCtx.scale(renderScale, renderScale);
                      tCtx.translate(0, horizonY * 3);
                      tCtx.scale(1, -2);
                      layers.forEach(layer => {
                          if (layer.visible) {
                              const lCanvas = layerRefs.current.get(layer.id);
                              if (lCanvas) tCtx.drawImage(lCanvas, 0, 0, width, height);
                          }
                      });
                      tCtx.restore();
                      reflectionDirtyRef.current = false;
                      prevHorizonRef.current = horizonY;
                  }

                  ctx.save();
                  ctx.globalAlpha = 0.8 * settings.waterOpacity; 
                  const blurAmount = (turbulenceY * 8 + 2) * scaleFactor;
                  ctx.filter = `blur(${blurAmount}px)`;

                  for (let i = 0; i < steps; i++) {
                      const t = i / steps;
                      const tDistorted = t + (fractalNoise(t * 10, 2) * turbulenceY * 0.1);
                      if (tDistorted < 0) continue; 
                      const yCurrent = horizonY + tDistorted * trailHeight;
                      const tNext = (i + 1) / steps;
                      const tNextDistorted = tNext + (fractalNoise(tNext * 10, 2) * turbulenceY * 0.1);
                      const yNext = horizonY + tNextDistorted * trailHeight;
                      const stripH = Math.max(1.0, yNext - yCurrent + 0.5);
                      const noiseVal = fractalNoise(t * 10 + i * 0.5, octaves); 
                      const xOffset = noiseVal * turbulenceX * 60 * settings.skyScale * scaleFactor; 
                      const srcY = (horizonY + t * trailHeight) * renderScale;
                      
                      if (yCurrent < height && srcY < tempH) {
                          ctx.drawImage(tempC, 
                              0, srcY, tempW, Math.max(1, stripH * renderScale), 
                              xOffset, yCurrent, width, stripH 
                          );
                      }
                  }
                  ctx.restore();
              }
          }
      }

      if (settings.sunElevation > -0.04) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          const spread = pillarBaseWidth * 1.5; 
          const maskGrad = ctx.createLinearGradient(sunX - spread, 0, sunX + spread, 0);
          maskGrad.addColorStop(0, "rgba(0,0,0,0)");
          maskGrad.addColorStop(0.3, "rgba(0,0,0,0.2)");
          maskGrad.addColorStop(0.5, "rgba(0,0,0,1)"); 
          maskGrad.addColorStop(0.7, "rgba(0,0,0,0.2)");
          maskGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = maskGrad;
          ctx.fillRect(0, horizonY, width, height - horizonY);
          ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.translate(0, horizonY * 2);
      ctx.scale(1, -1);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, horizonY, width, height); 
      ctx.restore();

      const tintAlpha = 0.5 * settings.waterOpacity;
      ctx.fillStyle = `rgba(10, 30, 60, ${tintAlpha})`;
      ctx.globalCompositeOperation = 'multiply'; 
      ctx.fillRect(0, horizonY, width, height - horizonY);

      if (settings.sunElevation > -0.04) { 
          ctx.save();
          ctx.globalCompositeOperation = 'color-dodge'; 
          const elevationFactor = Math.max(0, 1 - (Math.max(0, settings.sunElevation) / 0.8));
          const streakGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + trailHeight);
          const isLowSun = settings.sunElevation < 0.1;
          const coreColor = isLowSun ? sunColor : "white";
          streakGrad.addColorStop(0, coreColor); 
          streakGrad.addColorStop(0.1 + (elevationFactor * 0.2), sunColor);
          streakGrad.addColorStop(1, "transparent"); 
          ctx.fillStyle = streakGrad;
          ctx.shadowColor = sunColor;
          ctx.shadowBlur = 20 * elevationFactor * scaleFactor;

          for (let i = 0; i < steps; i++) {
              const t = i / steps; 
              const tDistorted = t + (fractalNoise(t * 10, 2) * turbulenceY * 0.1);
              if (tDistorted < 0 || tDistorted > 1) continue;
              const yPos = horizonY + tDistorted * trailHeight;
              const visibility = Math.max(0, 1 - (t / (elevationFactor + 0.1))); 
              
              if (visibility > 0.01) {
                  ctx.globalAlpha = visibility * settings.waterOpacity;
                  const perspective = 1 + t * 4; 
                  const noiseVal = fractalNoise(t * 10 + i * 0.5, octaves); 
                  const xOffset = noiseVal * turbulenceX * pillarBaseWidth * perspective * 0.5;
                  const waveWidth = Math.max(0.1, pillarBaseWidth * perspective * (0.5 + Math.abs(noiseVal) * 0.5));
                  const waveHeight = Math.max(0.5, (height / 80) * (1 + t * 2) * (1 + turbulenceY));
                  ctx.beginPath();
                  ctx.ellipse(sunX + xOffset, yPos, waveWidth / 2, waveHeight / 2, 0, 0, Math.PI * 2);
                  ctx.fill();
              }
          }
          ctx.restore();
      }
      
      const turbulence = (settings.waterTurbulenceX + settings.waterTurbulenceY) / 2;
      if (turbulence > 0.1) {
          ctx.globalCompositeOperation = 'overlay';
          ctx.fillStyle = `rgba(255,255,255,${turbulence * 0.1 * settings.waterOpacity})`;
          ctx.fillRect(0, horizonY, width, height - horizonY);
      }

      const hazeHeight = 40 * scaleFactor;
      const hazeGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + hazeHeight);
      hazeGrad.addColorStop(0, horizonColor); 
      hazeGrad.addColorStop(1, "rgba(0,0,0,0)");
      
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(0, horizonY, width, hazeHeight);
      ctx.restore();

      ctx.restore();
  };

  // Sync the ref for the function on every render so the loop calls the latest version
  useEffect(() => { drawWaterPlaneRef.current = drawWaterPlane; });

  useEffect(() => {
    let animId: number;
    const renderSkyComposite = () => {
        const dpr = window.devicePixelRatio || 1;
        const skyCanvas = skyOcclusionRef.current;
        const skyCtx = skyCanvas?.getContext('2d');
        const waterCanvas = waterCanvasRef.current;
        const waterCtx = waterCanvas?.getContext('2d');

        // Read from refs to avoid effect restarts
        const currentSettings = settingsRef.current;
        const currentAtmosphere = atmosphereRef.current;
        const currentLayers = layersRef.current;

        if (currentSettings.skyEnabled && skyCanvas && skyCtx && currentAtmosphere.skyColors) {
            if (skyCanvas.width !== docWidth * dpr || skyCanvas.height !== docHeight * dpr) {
                skyCanvas.width = docWidth * dpr;
                skyCanvas.height = docHeight * dpr;
                skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            if (waterCanvas && (waterCanvas.width !== docWidth * dpr || waterCanvas.height !== docHeight * dpr)) {
                waterCanvas.width = docWidth * dpr;
                waterCanvas.height = docHeight * dpr;
                waterCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            const { stops, sun, sunX, sunY, ground } = currentAtmosphere.skyColors;
            const hPct = currentSettings.skyHorizon * 100;
            const s = currentSettings.skyScale;
            const horizonY = docHeight * currentSettings.skyHorizon;

            const pUpper = hPct - (60 * s);
            const pOzone = hPct - (30 * s);
            const pGlow = hPct - (12 * s);
            const pHorizon = hPct;
            const groundMid = hPct + 0.4 * (100 - hPct);

            const grad = skyCtx.createLinearGradient(0, 0, 0, docHeight);
            const toOff = (pct: number) => Math.max(0, Math.min(1, pct / 100));
            grad.addColorStop(toOff(0), stops[0].color);
            grad.addColorStop(toOff(pUpper), stops[1].color);
            grad.addColorStop(toOff(pOzone), stops[2].color);
            grad.addColorStop(toOff(pGlow), stops[3].color);
            grad.addColorStop(toOff(pHorizon), stops[4].color);
            if (ground) {
                grad.addColorStop(toOff(Math.min(100, groundMid)), ground);
                grad.addColorStop(1, ground);
            }
            
            skyCtx.globalCompositeOperation = 'source-over';
            skyCtx.fillStyle = grad;
            skyCtx.fillRect(0, 0, docWidth, docHeight);

            if (currentSettings.sunEnabled) {
                const sb = sunBufferRef.current;
                if (sb) {
                    if (sb.width !== skyCanvas.width || sb.height !== skyCanvas.height) {
                        sb.width = skyCanvas.width;
                        sb.height = skyCanvas.height;
                        const sCtx = sb.getContext('2d');
                        if (sCtx) sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    }
                    const sCtx = sb.getContext('2d');
                    if (sCtx) {
                        sCtx.clearRect(0, 0, docWidth, docHeight);
                        sCtx.save();
                        const sunRadius = (90 * currentSettings.skyScale) / 2;
                        let scaleY = 1.0;
                        if (sunY + sunRadius > horizonY) {
                            const depth = (sunY + sunRadius) - horizonY;
                            scaleY = Math.max(0.6, 1.0 - (depth / (sunRadius * 2)) * 0.5);
                        }
                        sCtx.translate(sunX, sunY);
                        sCtx.scale(1, scaleY);
                        sCtx.translate(-sunX, -sunY);
                        sCtx.shadowBlur = currentSettings.sunDiffusion > 0.5 ? 40 : 10;
                        sCtx.shadowColor = sun;
                        sCtx.fillStyle = sun;
                        sCtx.beginPath();
                        sCtx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
                        sCtx.fill();
                        sCtx.restore();
                        sCtx.save();
                        sCtx.globalCompositeOperation = 'destination-out';
                        const fadeHeight = 20 * currentSettings.skyScale; 
                        const maskGrad = sCtx.createLinearGradient(0, horizonY, 0, horizonY + fadeHeight);
                        maskGrad.addColorStop(0, "rgba(0,0,0,0.2)"); 
                        maskGrad.addColorStop(1, "rgba(0,0,0,1)");   
                        sCtx.fillStyle = maskGrad;
                        sCtx.fillRect(0, horizonY, docWidth, fadeHeight * 2); 
                        sCtx.fillStyle = "black";
                        sCtx.fillRect(0, horizonY + fadeHeight, docWidth, docHeight - (horizonY + fadeHeight));
                        sCtx.restore();
                        skyCtx.save();
                        skyCtx.globalCompositeOperation = 'source-over';
                        skyCtx.drawImage(sb, 0, 0, docWidth, docHeight);
                        skyCtx.restore();
                    }
                }
            }

            if (maskRef.current) {
                skyCtx.globalCompositeOperation = 'destination-out';
                skyCtx.drawImage(maskRef.current, 0, 0, docWidth, docHeight);
                skyCtx.globalCompositeOperation = 'source-over';
            }

            if (waterCtx) {
                waterCtx.clearRect(0, 0, docWidth, docHeight);
                if (currentSettings.waterEnabled && drawWaterPlaneRef.current) {
                    // Call the latest logic via ref
                    drawWaterPlaneRef.current(waterCtx, docWidth, docHeight, horizonY, sunX, sunY, grad, sun, stops[4].color);
                    if (maskRef.current) {
                        waterCtx.globalCompositeOperation = 'destination-out';
                        waterCtx.drawImage(maskRef.current, 0, 0, docWidth, docHeight);
                        waterCtx.globalCompositeOperation = 'source-over';
                    }
                }
            }

        } else if (skyOcclusionRef.current) {
             const ctx = skyOcclusionRef.current.getContext('2d');
             if (ctx) ctx.clearRect(0, 0, skyOcclusionRef.current.width, skyOcclusionRef.current.height);
             if (waterCanvasRef.current) {
                 const wCtx = waterCanvasRef.current.getContext('2d');
                 if (wCtx) wCtx.clearRect(0, 0, waterCanvasRef.current.width, waterCanvasRef.current.height);
             }
        }
        animId = requestAnimationFrame(renderSkyComposite);
    };

    renderSkyComposite();
    return () => cancelAnimationFrame(animId);
  }, [docWidth, docHeight]); // Dependency array reduced to dimensions only

  useEffect(() => {
      const flareCanvas = lensFlareRef.current;
      if (!flareCanvas) return;
      const ctx = flareCanvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      if (flareCanvas.width !== docWidth * dpr || flareCanvas.height !== docHeight * dpr) {
          flareCanvas.width = docWidth * dpr;
          flareCanvas.height = docHeight * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else { ctx.clearRect(0, 0, docWidth, docHeight); }

      if (settings.skyEnabled && settings.lensFlareEnabled && atmosphere.skyColors && settings.sunEnabled) {
          const { sunX, sunY, sun } = atmosphere.skyColors;
          let tipX, tipY;
          if (settings.flareTipPos) {
              tipX = settings.flareTipPos.x * docWidth;
              tipY = settings.flareTipPos.y * docHeight;
          } else {
              tipX = docWidth - sunX;
              tipY = docHeight - sunY;
          }
          if (settings.lensFlareHandleEnabled && !settings.flareTipPos && onChange) {
               const nx = tipX / docWidth;
               const ny = tipY / docHeight;
               setTimeout(() => onChange({ ...settings, flareTipPos: { x: nx, y: ny } }), 0);
          }
          const sunColorRgb = parseColor(sun);
          drawGeometricLensFlare(ctx, docWidth, docHeight, sunX, sunY, sunColorRgb, settings.lensFlareIntensity, 1.0, settings.lensFlareScale || 1.0, settings.skyScale, tipX, tipY);
      }
  }, [settings.skyEnabled, settings.sunEnabled, settings.lensFlareEnabled, settings.lensFlareIntensity, settings.lensFlareScale, settings.lensFlareHandleEnabled, settings.flareTipPos, settings.skyScale, atmosphere.skyColors, docWidth, docHeight]);
  
  const showHandle = settings.skyEnabled && settings.sunEnabled && settings.lensFlareEnabled && settings.lensFlareHandleEnabled && atmosphere.skyColors;
  let handleX = 0; let handleY = 0;
  if (atmosphere.skyColors) {
      if (settings.flareTipPos) { handleX = settings.flareTipPos.x * docWidth; handleY = settings.flareTipPos.y * docHeight; } 
      else { handleX = docWidth - atmosphere.skyColors.sunX; handleY = docHeight - atmosphere.skyColors.sunY; }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 1 || isSpacePressed) { isPanning.current = true; lastPanPoint.current = { x: e.clientX, y: e.clientY }; return; }
      if (showHandle) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / zoom;
          const y = (e.clientY - rect.top) / zoom;
          if ((x - handleX)**2 + (y - handleY)**2 < 900) { setIsDraggingFlare(true); e.currentTarget.setPointerCapture(e.pointerId); return; }
      }
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      
      // ALT Key Picker Override
      if (e.altKey || isAltPressed) {
          const color = pickColor(x, y);
          if (color) onPickColor(color);
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
      }

      const p = e.pressure || 0.5;
      if (settings.isGradientMode) { setGradientStart({ x, y }); setGradientCurrent({ x, y }); } 
      else if (settings.isTapeMode || settings.isPatternLine) { setTapeStart({ x, y }); setTapeCurrent({ x, y }); }
      else if (settings.isRectLassoFill) { setRectLassoStart({ x, y }); setRectLassoCurrent({ x, y }); }
      else if (settings.isLassoMode || settings.isLassoFill || settings.isStippleFill || settings.isPatternLasso || settings.isGradBlend) { setIsLassoing(true); setLassoPoints([{ x, y }]); } 
      else { startStroke(x, y, p, e.tiltX, e.tiltY); }
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning.current) { const dx = e.clientX - lastPanPoint.current.x; const dy = e.clientY - lastPanPoint.current.y; onPan(dx, dy); lastPanPoint.current = { x: e.clientX, y: e.clientY }; return; }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      
      if (isDraggingFlare) { const nx = x / docWidth; const ny = y / docHeight; if (onChange) onChange({ ...settings, flareTipPos: { x: nx, y: ny } }); return; }
      if (cursorRef.current && !isPanning.current) { const ctx = cursorRef.current.getContext('2d'); if (ctx) renderBrushCursor(ctx, x, y, e.pressure, e.tiltX, e.tiltY); }
      
      // ALT Key Picker Drag
      if ((e.altKey || isAltPressed) && e.buttons === 1) {
          const color = pickColor(x, y);
          if (color) onPickColor(color);
          return;
      }

      if (settings.isGradientMode && gradientStart) { setGradientCurrent({ x, y }); gradientVectorRef.current = { start: gradientStart, end: { x, y } }; drawSkyGradient(gradientStart, { x, y }, true); } 
      else if ((settings.isTapeMode || settings.isPatternLine) && tapeStart) { setTapeCurrent({ x, y }); } 
      else if (settings.isRectLassoFill && rectLassoStart) { setRectLassoCurrent({ x, y }); }
      else if ((settings.isLassoMode || settings.isLassoFill || settings.isStippleFill || settings.isPatternLasso || settings.isGradBlend) && isLassoing) { setLassoPoints(prev => [...prev, { x, y }]); } 
      else if (e.buttons === 1) { 
          const events = (e.nativeEvent instanceof PointerEvent && e.nativeEvent.getCoalescedEvents) ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent]; 
          const points = events.map(ev => { const cx = (ev.clientX - rect.left) / zoom; const cy = (ev.clientY - rect.top) / zoom; return { x: cx, y: cy, pressure: ev.pressure || 0.5, tiltX: ev.tiltX, tiltY: ev.tiltY }; }); 
          drawBatch(points); 
          reflectionDirtyRef.current = true;
      }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      isPanning.current = false;
      if (isDraggingFlare) { setIsDraggingFlare(false); e.currentTarget.releasePointerCapture(e.pointerId); return; }
      if (e.altKey || isAltPressed) {
          e.currentTarget.releasePointerCapture(e.pointerId);
          return;
      }
      const x = (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom;
      const y = (e.clientY - e.currentTarget.getBoundingClientRect().top) / zoom;
      if (settings.isGradientMode && gradientStart) { drawSkyGradient(gradientStart, { x, y }, false); setGradientStart(null); setGradientCurrent(null); } 
      else if (settings.isTapeMode && tapeStart) { drawTape(tapeStart.x, tapeStart.y, x, y); setTapeStart(null); setTapeCurrent(null); } 
      else if (settings.isPatternLine && tapeStart) { drawPatternLine(tapeStart.x, tapeStart.y, x, y); setTapeStart(null); setTapeCurrent(null); } 
      else if (settings.isRectLassoFill && rectLassoStart) { drawRectLassoFill(rectLassoStart, { x, y }); setRectLassoStart(null); setRectLassoCurrent(null); }
      else if ((settings.isLassoMode || settings.isLassoFill || settings.isStippleFill || settings.isPatternLasso || settings.isGradBlend) && isLassoing) { 
          setIsLassoing(false); 
          if (settings.isLassoFill) drawLassoFill(lassoPoints); 
          else if (settings.isStippleFill) drawStippleLasso(lassoPoints); 
          else if (settings.isPatternLasso) drawPatternLasso(lassoPoints); 
          else if (settings.isGradBlend) drawGradBlendLasso(lassoPoints);
          else drawLasso(lassoPoints); 
          setLassoPoints([]); 
      } 
      else { endStroke(); }
      reflectionDirtyRef.current = true;
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  
  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => { if (cursorRef.current) { const ctx = cursorRef.current.getContext('2d'); if (ctx) ctx.clearRect(0, 0, cursorRef.current.width, cursorRef.current.height); } };
  
  const cursorStyle = isSpacePressed || isPanning.current ? 'cursor-grab active:cursor-grabbing' : 
                      isAltPressed ? 'cursor-crosshair' :
                      (settings.isGradientMode || settings.isTapeMode || settings.isLassoMode || settings.isLassoFill || settings.isStippleFill || settings.isPatternLasso || settings.isPatternLine || settings.isRectLassoFill || settings.isGradBlend) ? 'cursor-crosshair' : 'cursor-none';
  
  const lassoSvgPoints = lassoPoints.map(p => `${p.x},${p.y}`).join(' ');
  const hasFilmEffect = settings.filmEnabled;
  
  // Stable ID for filters to prevent DOM thrashing on re-renders
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 9));
  const filmFilterId = `film-${instanceId}`;
  const pictorialismFilterId = `pictorialism-${instanceId}`;
  const risoFilterId = `riso-${instanceId}`;
  const chromaticAberrationFilterId = `ca-${instanceId}`;

  const filmFilterDef = useMemo(() => {
    if (!hasFilmEffect) return null;
    const stockMatrix = STOCK_MATRICES[settings.filmStock] || STOCK_MATRICES['Standard'];
    const saturationValue = 1 + (settings.filmDensity * 1.5);
    const contrastSlope = 1 + (settings.filmDensity * 0.5);
    const contrastIntercept = -(0.5 * contrastSlope) + 0.5;
    const blurStd = 2 + settings.filmHalation * 3;
    const bloomStd = 5 + settings.filmBloom * 10;
    const grainStrength = settings.filmGrain;
    const halationMatrix = `1 0 0 0 0 0 0.2 0 0 0 0 0 0.2 0 0 0 0 0 ${settings.filmHalation} 0`;
    const grainMatrix = calculateGrainMatrix(grainStrength);
    const grainFrequency = Math.max(0.15, 0.5 - (grainStrength * 0.35)); 

    return (
        <filter id={filmFilterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feColorMatrix in="SourceGraphic" type="matrix" values={stockMatrix} result="graded" />
            <feColorMatrix in="graded" type="saturate" values={String(saturationValue)} result="saturated" />
            <feComponentTransfer in="saturated" result="densified">
                <feFuncR type="linear" slope={contrastSlope} intercept={contrastIntercept} />
                <feFuncG type="linear" slope={contrastSlope} intercept={contrastIntercept} />
                <feFuncB type="linear" slope={contrastSlope} intercept={contrastIntercept} />
            </feComponentTransfer>
            <feColorMatrix in="densified" type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="luminance" />
            <feComponentTransfer in="luminance" result="highlights">
                <feFuncR type="linear" slope="3" intercept="-1.5"/><feFuncG type="linear" slope="3" intercept="-1.5"/><feFuncB type="linear" slope="3" intercept="-1.5"/></feComponentTransfer>
            <feGaussianBlur in="highlights" stdDeviation={blurStd} result="highlightBlur" />
            <feColorMatrix in="highlightBlur" type="matrix" values={halationMatrix} result="redHalation" />
            <feGaussianBlur in="densified" stdDeviation={bloomStd} result="bloom" />
            <feColorMatrix in="bloom" type="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${settings.filmBloom} 0`} result="fadedBloom" />
            <feTurbulence type="fractalNoise" baseFrequency={`${grainFrequency}`} numOctaves="3" stitchTiles="stitch" result="rawNoise" />
            <feColorMatrix in="rawNoise" type="matrix" values={grainMatrix} result="coloredGrain" />
            <feBlend mode="screen" in="redHalation" in2="densified" result="step1" />
            <feBlend mode="screen" in="fadedBloom" in2="step2" result="step2" />
            <feBlend mode="overlay" in="coloredGrain" in2="step2" result="final" />
        </filter>
    );
  }, [hasFilmEffect, settings.filmStock, settings.filmDensity, settings.filmHalation, settings.filmBloom, settings.filmGrain, filmFilterId]);

  const pictorialismFilterDef = useMemo(() => {
      const tableValues = "0.1 0.15 0.25 0.40 0.55 0.70 0.82 0.90 0.95 0.97 0.98 0.99 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0";
      const noiseSlope = 0.05 + (settings.pictorialismNoise * 0.2); 
      const softStdDev = 0.5 + (settings.pictorialismSoftness * 4.0); 

      return (
        <filter id={pictorialismFilterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="luma"/>
            <feComponentTransfer in="luma" result="exposed">
                <feFuncR type="linear" slope="0.574" />
                <feFuncG type="linear" slope="0.574" />
                <feFuncB type="linear" slope="0.574" />
            </feComponentTransfer>
            <feComponentTransfer in="exposed" result="toneMapped">
                <feFuncR type="table" tableValues={tableValues}/>
                <feFuncG type="table" tableValues={tableValues}/>
                <feFuncB type="table" tableValues={tableValues}/>
            </feComponentTransfer>
            <feGaussianBlur in="toneMapped" stdDeviation={`${softStdDev}`} result="blurred"/>
            <feColorMatrix in="blurred" type="matrix" values="1.00 0 0 0 0  0 0.97 0 0 0  0 0 0.84 0 0  0 0 0 1 0" result="tinted"/>
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" result="grain"/>
            <feColorMatrix in="grain" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0" result="monoGrain"/>
            <feComponentTransfer in="monoGrain" result="softGrain">
                <feFuncA type="linear" slope={`${noiseSlope}`}/>
            </feComponentTransfer>
            <feBlend mode="overlay" in="softGrain" in2="tinted" result="grained"/>
            <feFlood floodColor="#000000" result="black"/>
            <feDiffuseLighting in="black" lightingColor="white" surfaceScale="0" diffuseConstant="1" result="vignetteMap">
                 <fePointLight x="50%" y="50%" z="600" />
            </feDiffuseLighting>
            <feBlend mode="multiply" in="grained" in2="vignetteMap" result="final"/>
        </filter>
      );
  }, [pictorialismFilterId, settings.pictorialismNoise, settings.pictorialismSoftness]);

  const risoFilterDef = useMemo(() => {
      const rgb1 = parseColor(settings.risoColor1);
      const rgb2 = parseColor(settings.risoColor2);
      
      const c1 = { r: rgb1.r / 255, g: rgb1.g / 255, b: rgb1.b / 255 };
      const c2 = { r: rgb2.r / 255, g: rgb2.g / 255, b: rgb2.b / 255 };
      const freq = settings.risoGrainScale; 

      return (
        <filter id={risoFilterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            {/* Extract Alpha Mask */}
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="sourceAlpha"/>

            {/* Luma Extraction */}
            <feColorMatrix in="SourceGraphic" type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="luma"/>
            
            {/* Stochastic Noise Pattern */}
            <feTurbulence type="fractalNoise" baseFrequency={`${freq}`} numOctaves="1" stitchTiles="stitch" result="noise"/>
            <feColorMatrix type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0" in="noise" result="grayNoise"/>
            
            {/* Dithering/Halftoning */}
            <feComposite operator="arithmetic" k1="0" k2="1" k3="1" k4="-0.5" in="luma" in2="grayNoise" result="screened"/>
            
            {/* Thresholding */}
            <feComponentTransfer in="screened" result="binaryHalftone">
                <feFuncR type="linear" slope="20" intercept="-10"/>
                <feFuncG type="linear" slope="20" intercept="-10"/>
                <feFuncB type="linear" slope="20" intercept="-10"/>
            </feComponentTransfer>

            {/* Duotone Mapping */}
            <feComponentTransfer in="binaryHalftone" result="duotone">
               <feFuncR type="table" tableValues={`${c1.r} ${c2.r}`}/>
               <feFuncG type="table" tableValues={`${c1.g} ${c2.g}`}/>
               <feFuncB type="table" tableValues={`${c1.b} ${c2.b}`}/>
            </feComponentTransfer>

            {/* Mask Output with Alpha */}
            <feComposite operator="in" in="duotone" in2="sourceAlpha" result="final"/>
        </filter>
      );
  }, [risoFilterId, settings.risoGrainScale, settings.risoColor1, settings.risoColor2]);

  const chromaticAberrationFilterDef = useMemo(() => {
      // Range: 0 to 20px shift
      const shift = settings.chromaticAberrationIntensity * 20;
      
      return (
        <filter id={chromaticAberrationFilterId} colorInterpolationFilters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
            {/* Split Channels */}
            {/* Red Channel */}
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="red"/>
            <feOffset in="red" dx={`${shift}`} dy="0" result="red_shifted"/>
            
            {/* Green Channel */}
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="green"/>
            
            {/* Blue Channel */}
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" in="SourceGraphic" result="blue"/>
            <feOffset in="blue" dx={`${-shift}`} dy="0" result="blue_shifted"/>
            
            {/* Recombine - Screen blend mode is additive: (r,0,0) + (0,g,0) = (r,g,0) */}
            <feBlend mode="screen" in="red_shifted" in2="green" result="rg"/>
            <feBlend mode="screen" in="rg" in2="blue_shifted" result="final"/>
        </filter>
      );
  }, [chromaticAberrationFilterId, settings.chromaticAberrationIntensity]);

  const layerFilterUrl = useMemo(() => {
      if (settings.risoEnabled) return `url(#${risoFilterId})`;
      return 'none';
  }, [settings.risoEnabled, risoFilterId]);

  const globalFilterUrl = useMemo(() => {
      const filters = [];
      // Chain Global Filters: Chromatic Aberration -> Film -> Pictorialism
      // This allows Pictorialism (Grain/Softness) to affect the CA and Film look
      if (settings.chromaticAberrationEnabled) filters.push(`url(#${chromaticAberrationFilterId})`);
      
      const isFilmActive = settings.filmEnabled && (settings.filmDensity !== 0 || settings.filmHalation !== 0 || settings.filmBloom !== 0 || settings.filmGrain !== 0 || settings.filmStock !== 'Standard');
      if (isFilmActive) filters.push(`url(#${filmFilterId})`);
      
      if (settings.pictorialismEnabled) filters.push(`url(#${pictorialismFilterId})`);
      
      return filters.length > 0 ? filters.join(' ') : 'none';
  }, [settings.filmEnabled, settings.filmDensity, settings.filmHalation, settings.filmBloom, settings.filmGrain, settings.filmStock, filmFilterId, settings.chromaticAberrationEnabled, chromaticAberrationFilterId, settings.pictorialismEnabled, pictorialismFilterId]);

  useImperativeHandle(ref, () => ({
    capturePattern: () => capturePattern(),
    downloadImage: (options) => {
        const targetW = options?.width || docWidth;
        const targetH = options?.height || docHeight;
        
        const save = (c: HTMLCanvasElement) => {
            const link = document.createElement('a');
            link.download = `gouache-${Date.now()}.png`;
            link.href = c.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        const exportScale = targetW / docWidth;
        const canvas = document.createElement('canvas'); canvas.width = targetW; canvas.height = targetH; const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1.0; ctx.fillStyle = effectiveCanvasColor; ctx.fillRect(0, 0, targetW, targetH);
        
        // --- LAYER DRAWING WITH RISO SUPPORT ---
        const drawLayersWithFilter = (isGlow: boolean) => {
            const tempLayerCanvas = document.createElement('canvas');
            tempLayerCanvas.width = targetW;
            tempLayerCanvas.height = targetH;
            const tCtx = tempLayerCanvas.getContext('2d');
            if(!tCtx) return;
            
            // Draw Layers to Temp
            layers.forEach(l => {
                if (l.visible && l.ignoreGlow === isGlow) {
                    const lCanvas = layerRefs.current.get(l.id);
                    if (lCanvas) tCtx.drawImage(lCanvas, 0, 0, targetW, targetH);
                }
            });

            // If Riso is enabled, we must apply it here via filter string + drawImage
            // We need a specific export-scaled Riso filter ID
            if (settings.risoEnabled) {
                const risoExportId = `riso-export-${isGlow ? 'glow' : 'norm'}-${Date.now()}`;
                const rgb1 = parseColor(settings.risoColor1);
                const rgb2 = parseColor(settings.risoColor2);
                const c1 = { r: rgb1.r / 255, g: rgb1.g / 255, b: rgb1.b / 255 };
                const c2 = { r: rgb2.r / 255, g: rgb2.g / 255, b: rgb2.b / 255 };
                const freq = settings.risoGrainScale / exportScale; 
                
                const svgRiso = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none;">
                  <filter id="${risoExportId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="sourceAlpha"/>
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="luma"/>
                    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="1" stitchTiles="stitch" result="noise"/>
                    <feColorMatrix type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0" in="noise" result="grayNoise"/>
                    <feComposite operator="arithmetic" k1="0" k2="1" k3="1" k4="-0.5" in="luma" in2="grayNoise" result="screened"/>
                    <feComponentTransfer in="binaryHalftone" result="binaryHalftone">
                        <feFuncR type="linear" slope="20" intercept="-10"/><feFuncG type="linear" slope="20" intercept="-10"/><feFuncB type="linear" slope="20" intercept="-10"/>
                    </feComponentTransfer>
                    <feComponentTransfer in="binaryHalftone" result="duotone">
                       <feFuncR type="table" tableValues="${c1.r} ${c2.r}"/><feFuncG type="table" tableValues="${c1.g} ${c2.g}"/><feFuncB type="table" tableValues="${c1.b} ${c2.b}"/>
                    </feComponentTransfer>
                    <feComposite operator="in" in="duotone" in2="sourceAlpha" result="final"/>
                  </filter>
                </svg>`;
                
                const div = document.createElement('div');
                div.innerHTML = svgRiso;
                document.body.appendChild(div);
                
                ctx.save();
                ctx.filter = `url(#${risoExportId})`;
                ctx.drawImage(tempLayerCanvas, 0, 0);
                ctx.restore();
                
                document.body.removeChild(div);
            } else {
                ctx.drawImage(tempLayerCanvas, 0, 0);
            }
        };

        if (settings.skyEnabled && atmosphere.skyColors) { const { stops, sun, sunX, sunY, ground } = atmosphere.skyColors; const hPct = settings.skyHorizon * 100; const s = settings.skyScale; const horizonY = targetH * settings.skyHorizon; const stop0 = 0; const stop1 = hPct - (60 * s); const stop2 = hPct - (30 * s); const stop3 = hPct - (12 * s); const stop4 = hPct; const toOff = (pct: number) => Math.max(0, Math.min(1, pct / 100)); const grad = ctx.createLinearGradient(0, 0, 0, targetH); grad.addColorStop(toOff(stop0), stops[0].color); grad.addColorStop(toOff(stop1), stops[1].color); grad.addColorStop(toOff(stop2), stops[2].color); grad.addColorStop(toOff(stop3), stops[3].color); grad.addColorStop(toOff(stop4), stops[4].color); if (ground) { grad.addColorStop(toOff(Math.min(100, hPct + 0.4 * (100 - hPct))), ground); grad.addColorStop(1, ground); } ctx.fillStyle = grad; ctx.fillRect(0, 0, targetW, targetH); const sx = (sunX / docWidth) * targetW; const sy = (sunY / docHeight) * targetH; const sunRadius = (90 * settings.skyScale * exportScale) / 2; if (settings.sunEnabled) { const sunC = document.createElement('canvas'); sunC.width = targetW; sunC.height = targetH; const sCtx = sunC.getContext('2d'); if (sCtx) { sCtx.save(); let scaleY = 1.0; if (sy + sunRadius > horizonY) { const depth = (sy + sunRadius) - horizonY; scaleY = Math.max(0.6, 1.0 - (depth / (sunRadius * 2)) * 0.5); } sCtx.translate(sx, sy); sCtx.scale(1, scaleY); sCtx.translate(-sx, -sy); sCtx.shadowColor = sun; sCtx.shadowBlur = (settings.sunDiffusion > 0.5 ? 40 : 10) * exportScale; sCtx.beginPath(); sCtx.arc(sx, sy, sunRadius, 0, Math.PI * 2); sCtx.fillStyle = sun; sCtx.fill(); sCtx.restore(); sCtx.save(); sCtx.globalCompositeOperation = 'destination-out'; const fadeHeight = 20 * settings.skyScale * exportScale; const maskGrad = sCtx.createLinearGradient(0, horizonY, 0, horizonY + fadeHeight); maskGrad.addColorStop(0, "rgba(0,0,0,0.2)"); maskGrad.addColorStop(1, "rgba(0,0,0,1)"); sCtx.fillStyle = maskGrad; sCtx.fillRect(0, horizonY, targetW, fadeHeight * 2); sCtx.fillStyle = "black"; sCtx.fillRect(0, horizonY + fadeHeight, targetW, targetH - (horizonY + fadeHeight)); sCtx.restore(); ctx.drawImage(sunC, 0, 0); } } if (maskRef.current) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(maskRef.current, 0, 0, targetW, targetH); ctx.restore(); } if (settings.waterEnabled) { drawWaterPlane(ctx, targetW, targetH, horizonY, sx, sy, grad, sun, stops[4].color); if (maskRef.current) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(maskRef.current, 0, 0, targetW, targetH); ctx.restore(); } } ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = effectiveCanvasColor; ctx.fillRect(0, 0, targetW, targetH); ctx.globalCompositeOperation = 'source-over'; } else { ctx.fillStyle = effectiveCanvasColor; ctx.fillRect(0, 0, targetW, targetH); }
        
        const finalizeExport = (textureImg?: HTMLImageElement) => { 
            ctx.globalAlpha = 1.0; 
            ctx.globalCompositeOperation = 'source-over'; 
            if (textureImg) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.4; const pattern = ctx.createPattern(textureImg, 'repeat'); if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, targetW, targetH); } else { ctx.drawImage(textureImg, 0, 0, targetW, targetH); } ctx.restore(); } 
            
            drawLayersWithFilter(false);

            if (settings.skyEnabled && atmosphere.skyColors && settings.sunEnabled) { const { sunX, sunY, sun, stops } = atmosphere.skyColors; const sx = (sunX / docWidth) * targetW; const sy = (sunY / docHeight) * targetH; const intensity = settings.sunIntensity; const diffusion = settings.sunDiffusion; const coreRadius = (15 + (intensity * 25)) * exportScale; const safeDensity = settings.atmosphereDensity ?? 0.5; const maxBloom = safeDensity * 300; const bloomExtent = (20 + (maxBloom * intensity * diffusion)) * exportScale; const outerRadius = coreRadius + bloomExtent; const sunRgb = parseColor(sun); const glowPhysicsRgb = parseColor(stops[3].color); let glowColorRgb = lerpColor(sunRgb, glowPhysicsRgb, Math.min(1, safeDensity + 0.2)); if (diffusion < 0.5) { const redShift = (0.5 - diffusion) * 2.0; const deepRed = { r: 255, g: 40, b: 10 }; glowColorRgb = lerpColor(glowColorRgb, deepRed, redShift * 0.8); } const glowColorStr = `rgba(${glowColorRgb.r}, ${glowColorRgb.g}, ${glowColorRgb.b}`; const gGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, outerRadius); gGrad.addColorStop(0, sun); gGrad.addColorStop(coreRadius/outerRadius, `${glowColorStr}, ${0.8 * (1 - diffusion * 0.4)})`); gGrad.addColorStop(1, `${glowColorStr}, 0)`); const horizonY = targetH * settings.skyHorizon; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, targetW, horizonY); ctx.clip(); ctx.globalCompositeOperation = 'color-dodge'; ctx.globalAlpha = 0.8 + (intensity * 0.2); ctx.fillStyle = gGrad; ctx.fillRect(sx - outerRadius, sy - outerRadius, outerRadius*2, outerRadius*2); ctx.restore(); } 
            
            ctx.globalAlpha = 1.0; 
            
            drawLayersWithFilter(true);

            if (atmosphere.ambientParams) { const params = atmosphere.ambientParams; ctx.save(); ctx.globalCompositeOperation = (params.mixBlendMode as GlobalCompositeOperation) || 'source-over'; ctx.globalAlpha = params.opacity; if (params.type === 'gradient' && params.gradient) { const { x, y, stops } = params.gradient; const cx = (x / docWidth) * targetW; const cy = (y / docHeight) * targetH; const distToTL = Math.hypot(cx, cy); const distToTR = Math.hypot(targetW - cx, cy); const distToBL = Math.hypot(cx, targetH - cy); const distToBR = Math.hypot(targetW - cx, targetH - cy); const radius = Math.max(distToTL, distToTR, distToBL, distToBR); const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius); stops.forEach(stop => { grad.addColorStop(stop.offset, stop.color); }); ctx.fillStyle = grad; } else if (params.type === 'solid' && params.color) { ctx.fillStyle = params.color; } ctx.fillRect(0, 0, targetW, targetH); ctx.restore(); } if (atmosphere.gradeStyles) { const filter = (atmosphere.gradeStyles as any).backdropFilter || (atmosphere.gradeStyles as any).WebkitBackdropFilter; if (filter && filter !== 'none') { const tempC = document.createElement('canvas'); tempC.width = targetW; tempC.height = targetH; const tCtx = tempC.getContext('2d'); if (tCtx) { tCtx.drawImage(canvas, 0, 0); ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.filter = filter; ctx.drawImage(tempC, 0, 0); ctx.restore(); ctx.filter = 'none'; } } if (atmosphere.gradeStyles.backgroundColor) { ctx.save(); ctx.globalCompositeOperation = atmosphere.gradeStyles.mixBlendMode as GlobalCompositeOperation || 'overlay'; ctx.globalAlpha = (Number(atmosphere.gradeStyles.opacity) || 0) * 0.95; ctx.fillStyle = atmosphere.gradeStyles.backgroundColor; ctx.fillRect(0, 0, targetW, targetH); ctx.restore(); } } if (settings.skyEnabled && settings.lensFlareEnabled && atmosphere.skyColors && settings.sunEnabled) { const { sunX, sunY, sun } = atmosphere.skyColors; const sx = (sunX / docWidth) * targetW; const sy = (sunY / docHeight) * targetH; let tipX, tipY; if (settings.flareTipPos) { tipX = settings.flareTipPos.x * targetW; tipY = settings.flareTipPos.y * targetH; } else { tipX = targetW - sx; tipY = targetH - sy; } const flareC = document.createElement('canvas'); flareC.width = targetW; flareC.height = targetH; const fCtx = flareC.getContext('2d'); if (fCtx) { const sunRgb = parseColor(sun); drawGeometricLensFlare(fCtx, targetW, targetH, sx, sy, sunRgb, settings.lensFlareIntensity, 1.0, settings.lensFlareScale || 1.0, settings.skyScale, tipX, tipY); ctx.save(); ctx.globalCompositeOperation = 'color-dodge'; ctx.drawImage(flareC, 0, 0); ctx.restore(); } } 
        
            const filters = [];
            let svgString = '';
            
            if (settings.chromaticAberrationEnabled) {
                const caId = `ca-export-${Date.now()}`;
                const shift = settings.chromaticAberrationIntensity * 20 * exportScale;
                svgString += `<filter id="${caId}" color-interpolation-filters="sRGB" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="red"/><feOffset in="red" dx="${shift}" dy="0" result="red_shifted"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="green"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" in="SourceGraphic" result="blue"/><feOffset in="blue" dx="${-shift}" dy="0" result="blue_shifted"/><feBlend mode="screen" in="red_shifted" in2="green" result="rg"/><feBlend mode="screen" in="rg" in2="blue_shifted" result="final"/></filter>`;
                filters.push(`url(#${caId})`);
            }

            const isFilmNeutral = settings.filmDensity === 0 && settings.filmHalation === 0 && settings.filmBloom === 0 && settings.filmGrain === 0 && settings.filmStock === 'Standard';
            if (settings.filmEnabled && !isFilmNeutral) { 
                const filmId = `film-export-${Date.now()}`; 
                const stockMatrix = STOCK_MATRICES[settings.filmStock] || STOCK_MATRICES['Standard']; 
                const density = settings.filmDensity === 0 ? 0 : settings.filmDensity; 
                const saturationValue = density === 0 ? 1 : 1 + (density * 1.2); 
                const contrastSlope = density === 0 ? 1 : 1 + (density * 0.2); 
                const contrastIntercept = density === 0 ? 0 : -(0.5 * contrastSlope) + 0.5; 
                const blurStd = (2 + settings.filmHalation * 3) * exportScale; 
                const bloomStd = (5 + settings.filmBloom * 10) * exportScale; 
                const grainStrength = settings.filmGrain; 
                const grainFrequency = Math.max(0.01, (Math.max(0.15, 0.5 - (grainStrength * 0.35))) / exportScale); 
                const halationMatrix = `1 0 0 0 0 0 0.2 0 0 0 0 0 0.2 0 0 0 0 0 ${settings.filmHalation} 0`; 
                const grainMatrix = calculateGrainMatrix(grainStrength); 
                svgString += `<filter id="${filmId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%"><feColorMatrix in="SourceGraphic" type="matrix" values="${stockMatrix}" result="graded" /><feColorMatrix in="graded" type="saturate" values="${Math.max(0, saturationValue).toFixed(3)}" result="saturated" /><feComponentTransfer in="saturated" result="densified"><feFuncR type="linear" slope="${contrastSlope.toFixed(3)}" intercept="${contrastIntercept.toFixed(3)}" /><feFuncG type="linear" slope="${contrastSlope.toFixed(3)}" intercept="${contrastIntercept.toFixed(3)}" /><feFuncB type="linear" slope="${contrastSlope.toFixed(3)}" intercept="${contrastIntercept.toFixed(3)}" /></feComponentTransfer><feColorMatrix in="densified" type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="luminance" /><feComponentTransfer in="luminance" result="highlights"><feFuncR type="linear" slope="3" intercept="-1.5"/><feFuncG type="linear" slope="3" intercept="-1.5"/><feFuncB type="linear" slope="3" intercept="-1.5"/></feComponentTransfer><feGaussianBlur in="highlights" stdDeviation="${blurStd}" result="highlightBlur" /><feColorMatrix in="highlightBlur" type="matrix" values="${halationMatrix}" result="redHalation" /><feGaussianBlur in="densified" stdDeviation="${bloomStd}" result="bloom" /><feColorMatrix in="bloom" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${settings.filmBloom} 0" result="fadedBloom" /><feTurbulence type="fractalNoise" baseFrequency="${grainFrequency}" numOctaves="3" stitchTiles="stitch" result="rawNoise" /><feColorMatrix in="rawNoise" type="matrix" values="${grainMatrix}" result="coloredGrain" /><feBlend mode="screen" in="redHalation" in2="densified" result="step1" /><feBlend mode="screen" in="fadedBloom" in2="step2" result="step2" /><feBlend mode="overlay" in="coloredGrain" in2="step2" result="final" /></filter>`;
                filters.push(`url(#${filmId})`);
            }

            if (settings.pictorialismEnabled) {
                const picId = `pic-export-${Date.now()}`;
                const tableValues = "0.1 0.15 0.25 0.40 0.55 0.70 0.82 0.90 0.95 0.97 0.98 0.99 1.0 1.0 1.0 1.0 1.0 1.0 1.0 1.0";
                const noiseSlope = 0.05 + (settings.pictorialismNoise * 0.2); 
                const softStdDev = (0.5 + (settings.pictorialismSoftness * 4.0)) * exportScale; 
                const grainFreq = 0.8 / exportScale;
                svgString += `<filter id="${picId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="luma"/><feComponentTransfer in="luma" result="exposed"><feFuncR type="linear" slope="0.574" /><feFuncG type="linear" slope="0.574" /><feFuncB type="linear" slope="0.574" /></feComponentTransfer><feComponentTransfer in="exposed" result="toneMapped"><feFuncR type="table" tableValues="${tableValues}"/><feFuncG type="table" tableValues="${tableValues}"/><feFuncB type="table" tableValues="${tableValues}"/></feComponentTransfer><feGaussianBlur in="toneMapped" stdDeviation="${softStdDev}" result="blurred"/><feColorMatrix in="blurred" type="matrix" values="1.00 0 0 0 0  0 0.97 0 0 0  0 0 0.84 0 0  0 0 0 1 0" result="tinted"/><feTurbulence type="fractalNoise" baseFrequency="${grainFreq}" numOctaves="3" stitchTiles="stitch" result="grain"/><feColorMatrix in="grain" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0" result="monoGrain"/><feComponentTransfer in="monoGrain" result="softGrain"><feFuncA type="linear" slope="${noiseSlope}"/></feComponentTransfer><feBlend mode="overlay" in="softGrain" in2="tinted" result="grained"/><feFlood floodColor="#000000" result="black"/><feDiffuseLighting in="black" lightingColor="white" surfaceScale="0" diffuseConstant="1" result="vignetteMap"><fePointLight x="50%" y="50%" z="600" /></feDiffuseLighting><feBlend mode="multiply" in="grained" in2="vignetteMap" result="final"/></filter>`;
                filters.push(`url(#${picId})`);
            }

            if (filters.length > 0) {
                 const div = document.createElement('div'); 
                 div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none;">${svgString}</svg>`; 
                 document.body.appendChild(div); 
                 const tempC = document.createElement('canvas'); 
                 tempC.width = targetW; tempC.height = targetH; 
                 const tCtx = tempC.getContext('2d'); 
                 if (tCtx) { 
                     tCtx.drawImage(canvas, 0, 0); 
                     ctx.clearRect(0, 0, targetW, targetH); 
                     ctx.save(); 
                     ctx.filter = filters.join(' '); 
                     ctx.drawImage(tempC, 0, 0); 
                     ctx.restore(); 
                 } 
                 setTimeout(() => { document.body.removeChild(div); }, 100); 
            }
            
            save(canvas);
        };
        if (visualTexture) { const img = new Image(); img.crossOrigin = "Anonymous"; img.src = visualTexture; img.onload = () => finalizeExport(img); } else { finalizeExport(); }
    }
  }), [settings, atmosphere, canvasColor, docWidth, docHeight, layers, effectiveCanvasColor, addLayer, commitSnapshot]);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[#09090b] flex items-center justify-center overflow-hidden">
      <svg className="absolute w-0 h-0 pointer-events-none">
          <defs>
              {filmFilterDef}
              {pictorialismFilterDef}
              {risoFilterDef}
              {chromaticAberrationFilterDef}
          </defs>
      </svg>
      <div 
        className={`relative shadow-2xl ring-1 ring-white/10 origin-center ${cursorStyle}`}
        style={{ width: docWidth, height: docHeight, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, flexShrink: 0, filter: grayscaleMode ? 'grayscale(100%)' : 'none', touchAction: 'none', willChange: 'transform' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
      >
        <div className="absolute inset-0 w-full h-full overflow-hidden" style={{ filter: globalFilterUrl, willChange: hasFilmEffect ? 'filter' : 'auto' }}>
            <div className="absolute inset-0 w-full h-full transition-colors duration-200 ease-linear" style={{ backgroundColor: effectiveCanvasColor, zIndex: 0 }} />
            {settings.skyEnabled && <canvas ref={skyOcclusionRef} className="absolute inset-0 block w-full h-full" style={{ zIndex: 1 }} />}
            {settings.skyEnabled && settings.waterEnabled && <canvas ref={waterCanvasRef} className="absolute inset-0 block w-full h-full" style={{ zIndex: 2 }} />}
            {visualTexture && <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ backgroundImage: `url(${visualTexture})`, backgroundRepeat: 'repeat', mixBlendMode: 'multiply', opacity: 0.4, zIndex: 5 }} />}
            
            {/* Standard Layers (Below Atmosphere) */}
            <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: layerFilterUrl, zIndex: 5 }}>
                {layers.filter(l => !l.ignoreGlow).map(layer => (
                    <canvas key={layer.id} ref={(el) => { if (el) layerRefs.current.set(layer.id, el); else layerRefs.current.delete(layer.id); }} className={`absolute inset-0 block touch-none w-full h-full transition-opacity duration-200 ${!layer.visible ? 'opacity-0' : 'opacity-100'}`} style={{ pointerEvents: 'auto' }} />
                ))}
            </div>

            <div className="absolute inset-0 pointer-events-none transition-all duration-500 ease-in-out" style={{ ...atmosphere.glowStyles, zIndex: 10 }} />
            
            {/* Top Layers (Above Atmosphere) */}
            <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: layerFilterUrl, zIndex: 15 }}>
                {layers.filter(l => l.ignoreGlow).map(layer => (
                    <canvas key={layer.id} ref={(el) => { if (el) layerRefs.current.set(layer.id, el); else layerRefs.current.delete(layer.id); }} className={`absolute inset-0 block touch-none w-full h-full transition-opacity duration-200 ${!layer.visible ? 'opacity-0' : 'opacity-100'}`} style={{ pointerEvents: 'auto' }} />
                ))}
            </div>

            <div className="absolute inset-0 pointer-events-none transition-all duration-500 ease-in-out" style={{ ...atmosphere.ambientStyles, zIndex: 18 }} />
            <div className="absolute inset-0 pointer-events-none transition-all duration-500 ease-in-out" style={{ ...atmosphere.gradeStyles, zIndex: 19 }} />
            <canvas ref={lensFlareRef} className="absolute inset-0 block pointer-events-none w-full h-full" style={{ zIndex: 35, opacity: settings.skyEnabled ? 1 : 0, mixBlendMode: 'color-dodge' }} />
        </div>
        
        <canvas ref={maskRef} className="absolute inset-0 block touch-none w-full h-full" style={{ mixBlendMode: settings.skyEnabled ? 'normal' : 'multiply', opacity: settings.skyEnabled ? 0.6 : 0.8, pointerEvents: 'none', zIndex: 30 }} />
        <canvas ref={cursorRef} className="absolute inset-0 block pointer-events-none w-full h-full" style={{ zIndex: 50 }} />
        
        {(settings.isTapeMode || settings.isPatternLine) && tapeStart && tapeCurrent && <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible" style={{ zIndex: 40 }}><line x1={tapeStart.x} y1={tapeStart.y} x2={tapeCurrent.x} y2={tapeCurrent.y} stroke={settings.isPatternLine ? "#10b981" : "#4299e1"} strokeWidth={settings.isPatternLine ? settings.size : settings.tapeWidth} strokeOpacity="0.5" strokeLinecap="butt" strokeDasharray="10 5" /></svg>}
        {(settings.isRectLassoFill && rectLassoStart && rectLassoCurrent) && <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible" style={{ zIndex: 40 }}><rect x={Math.min(rectLassoStart.x, rectLassoCurrent.x)} y={Math.min(rectLassoStart.y, rectLassoCurrent.y)} width={Math.abs(rectLassoCurrent.x - rectLassoStart.x)} height={Math.abs(rectLassoCurrent.y - rectLassoStart.y)} fill="rgba(20, 184, 166, 0.2)" stroke="#14b8a6" strokeWidth="2" strokeDasharray="5 5" /></svg>}
        {(settings.isLassoMode || settings.isLassoFill || settings.isStippleFill || settings.isPatternLasso || settings.isGradBlend) && isLassoing && <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible" style={{ zIndex: 40 }}><polygon points={lassoSvgPoints} fill={settings.isPatternLasso ? "rgba(16, 185, 129, 0.2)" : (settings.isStippleFill ? "rgba(234, 179, 8, 0.2)" : (settings.isLassoFill ? "rgba(20, 184, 166, 0.2)" : (settings.isGradBlend ? "rgba(168, 85, 247, 0.2)" : (settings.lassoMode === 'add' ? "rgba(66, 153, 225, 0.2)" : "rgba(255, 99, 71, 0.2)"))))} stroke={settings.isPatternLasso ? "#10b981" : (settings.isStippleFill ? "#ca8a04" : (settings.isLassoFill ? "#14b8a6" : (settings.isGradBlend ? "#a855f7" : (settings.lassoMode === 'add' ? "#4299e1" : "#ff6347"))))} strokeWidth="2" strokeDasharray="5 5" /></svg>}
        
        {settings.isGradientMode && gradientStart && gradientCurrent && <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible" style={{ zIndex: 40 }}><circle cx={gradientStart.x} cy={gradientStart.y} r={10} fill="rgba(255, 200, 100, 0.5)" stroke="white" strokeWidth="1" /><line x1={gradientStart.x} y1={gradientStart.y} x2={gradientCurrent.x} y2={gradientCurrent.y} stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1" strokeDasharray="4 4" /><circle cx={gradientCurrent.x} cy={gradientCurrent.y} r={4} fill="rgba(255, 255, 255, 0.3)" /></svg>}
        
        {showHandle && (
            <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" style={{ zIndex: 100 }}>
                {atmosphere.skyColors && (
                    <line x1={atmosphere.skyColors.sunX} y1={atmosphere.skyColors.sunY} x2={handleX} y2={handleY} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 6" />
                )}
                <circle cx={handleX} cy={handleY} r={8} fill={isDraggingFlare ? "rgba(34,211,238,0.8)" : "rgba(34,211,238,0.1)"} stroke="rgba(34,211,238,0.9)" strokeWidth="2" className="pointer-events-auto cursor-move hover:fill-[rgba(34,211,238,0.3)] transition-colors drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
                <circle cx={handleX} cy={handleY} r={12} fill="transparent" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="2 2" className="pointer-events-none opacity-50" />
                <circle cx={handleX} cy={handleY} r={30} fill="transparent" className="pointer-events-auto cursor-move" />
            </svg>
        )}
      </div>
    </div>
  );
});

Canvas.displayName = "Canvas";
