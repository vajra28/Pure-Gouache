import React, { useRef, useEffect, useCallback, useState } from 'react';
import { BrushSettings, Point, Layer } from '../types';
import { clearCanvas } from '../utils/canvasUtils';
import { hexToRgb, lerpColor, rgbToString, mixOklabFloatInPlace, shiftHslRgb, rgbToHex, mixPigmentsFloatInPlace } from '../utils/color';

// --- TYPES ---
interface Star {
    x: number;
    y: number;
    size: number;
    brightness: number;
}

interface SkyState {
    stops: { offset: number, color: string }[];
    stopsRgb: { offset: number, r: number, g: number, b: number }[]; 
    ground: { r: number, g: number, b: number };
    sun: { r: number, g: number, b: number };
    sunPos: { x: number, y: number };
    glow?: {
        color: { r: number, g: number, b: number };
        coreRadius: number;
        outerRadius: number;
        intensity: number; 
    };
    reflection?: {
        baseColor: { r: number, g: number, b: number };
        midColor: { r: number, g: number, b: number };
        opacity: number;
        width: number;
        height: number;
    };
}

interface EngineRefs {
  layerCanvases: Map<string, HTMLCanvasElement>;
  mask: HTMLCanvasElement | null;
  temp: HTMLCanvasElement | null; 
  composite: HTMLCanvasElement | null;
  heightMapPattern: CanvasPattern | null;
  snapshot: ImageData | null; 
  stars: Star[] | null; 
  skyState: SkyState | null;
  skyLut: Uint8ClampedArray | null; 
  patternImage: HTMLImageElement | null;
}

interface ColorRGB {
    r: number;
    g: number;
    b: number;
}

interface Bristle {
  dx: number; 
  dy: number; 
  length: number; 
  thickness: number; 
  tempBias: number; 
  hueBias: number; 
  feather: number; 
  drySensitivity: number; 
  color: ColorRGB;
  hasPaint: boolean;
  normX?: number;
  normY?: number;
}

interface HistoryState {
    layerId: string;
    painting: ImageData;
    mask: ImageData;
}

interface WetBuffer {
    data: Uint8ClampedArray;
    width: number; 
    height: number;
    x: number; 
    y: number;
}

export interface AtmosphereState {
    glowStyles: React.CSSProperties;
    ambientStyles: React.CSSProperties;
    gradeStyles: React.CSSProperties;
    ambientParams: {
        type: 'gradient' | 'solid';
        color?: string;
        gradient?: {
            x: number; y: number;
            stops: { offset: number; color: string }[];
        };
        mixBlendMode: string;
        opacity: number;
    } | null;
    skyColors: {
        stops: { offset: number, color: string }[];
        ground: string;
        sun: string;
        sunX: number;
        sunY: number;
    } | null;
}

// --- CONSTANTS & HELPERS ---
const WARM_TINT = { r: 255, g: 160, b: 60 };
const COOL_TINT = { r: 40, g: 70, b: 110 };
const MAX_HISTORY_BYTES = 150 * 1024 * 1024; 

const SKY_KEYS = {
    day: { zenith: {r: 25, g: 70, b: 160}, upper: {r: 70, g: 130, b: 210}, ozone: {r: 110, g: 170, b: 230}, glow: {r: 180, g: 210, b: 240}, horizon: {r: 210, g: 235, b: 255}, sun: {r: 255, g: 255, b: 245} },
    golden: { zenith: {r: 30, g: 60, b: 130}, upper: {r: 70, g: 100, b: 180}, ozone: {r: 140, g: 150, b: 200}, glow: {r: 255, g: 180, b: 100}, horizon: {r: 255, g: 200, b: 50}, sun: {r: 255, g: 240, b: 210} },
    sunset: { zenith: {r: 30, g: 42, b: 58}, upper: {r: 65, g: 80, b: 100}, ozone: {r: 110, g: 100, b: 100}, glow: {r: 180, g: 90, b: 50}, horizon: {r: 130, g: 50, b: 20}, sun: {r: 255, g: 200, b: 140} },
    civil_twilight: { zenith: {r: 15, g: 25, b: 40}, upper: {r: 40, g: 50, b: 70}, ozone: {r: 80, g: 60, b: 65}, glow: {r: 120, g: 50, b: 30}, horizon: {r: 60, g: 25, b: 10}, sun: {r: 255, g: 50, b: 50} },
    nautical_twilight: { zenith: {r: 5, g: 8, b: 25}, upper: {r: 15, g: 20, b: 50}, ozone: {r: 30, g: 35, b: 70}, glow: {r: 60, g: 50, b: 80}, horizon: {r: 20, g: 15, b: 30}, sun: {r: 50, g: 10, b: 10} },
    night: { zenith: {r: 0, g: 1, b: 8}, upper: {r: 1, g: 3, b: 15}, ozone: {r: 5, g: 8, b: 20}, glow: {r: 8, g: 12, b: 25}, horizon: {r: 10, g: 15, b: 30}, sun: {r: 0, g: 0, b: 0} }
};

const calculateSkyPhysics = (elevation: number, density: number, humidity: number) => {
    const mix = (c1: ColorRGB, c2: ColorRGB, t: number) => lerpColor(c1, c2, t);
    let zenith, upper, ozone, glow, horizon, sunColor, bloomColor;
    let bloomSizeMult = 1.0;

    if (elevation > 0.2) {
        const t = Math.max(0, Math.min(1, (elevation - 0.2) / 0.8));
        zenith = mix(SKY_KEYS.golden.zenith, SKY_KEYS.day.zenith, t);
        upper = mix(SKY_KEYS.golden.upper, SKY_KEYS.day.upper, t);
        ozone = mix(SKY_KEYS.golden.ozone, SKY_KEYS.day.ozone, t);
        glow = mix(SKY_KEYS.golden.glow, SKY_KEYS.day.glow, t);
        horizon = mix(SKY_KEYS.golden.horizon, SKY_KEYS.day.horizon, t);
        sunColor = mix(SKY_KEYS.golden.sun, SKY_KEYS.day.sun, t);
        bloomColor = {r: 255, g: 255, b: 255};
        bloomSizeMult = 2.0;
    } else if (elevation > 0.0) {
        const t = elevation / 0.2;
        zenith = mix(SKY_KEYS.sunset.zenith, SKY_KEYS.golden.zenith, t);
        upper = mix(SKY_KEYS.sunset.upper, SKY_KEYS.golden.upper, t);
        ozone = mix(SKY_KEYS.sunset.ozone, SKY_KEYS.golden.ozone, t);
        glow = mix(SKY_KEYS.sunset.glow, SKY_KEYS.golden.glow, t);
        horizon = mix(SKY_KEYS.sunset.horizon, SKY_KEYS.golden.horizon, t);
        sunColor = mix(SKY_KEYS.sunset.sun, SKY_KEYS.golden.sun, t);
        bloomColor = {r: 255, g: 200, b: 150}; 
        bloomSizeMult = 4.0;
    } else if (elevation > -0.06) {
        const t = (elevation - (-0.06)) / 0.06;
        zenith = mix(SKY_KEYS.civil_twilight.zenith, SKY_KEYS.sunset.zenith, t);
        upper = mix(SKY_KEYS.civil_twilight.upper, SKY_KEYS.sunset.upper, t);
        ozone = mix(SKY_KEYS.civil_twilight.ozone, SKY_KEYS.sunset.ozone, t);
        glow = mix(SKY_KEYS.civil_twilight.glow, SKY_KEYS.sunset.glow, t);
        horizon = mix(SKY_KEYS.civil_twilight.horizon, SKY_KEYS.sunset.horizon, t);
        sunColor = mix(SKY_KEYS.civil_twilight.sun, SKY_KEYS.sunset.sun, t);
        bloomColor = {r: 255, g: 100, b: 50}; 
        bloomSizeMult = 3.0;
    } else if (elevation > -0.12) {
        const t = (elevation - (-0.12)) / 0.06;
        zenith = mix(SKY_KEYS.nautical_twilight.zenith, SKY_KEYS.civil_twilight.zenith, t);
        upper = mix(SKY_KEYS.nautical_twilight.upper, SKY_KEYS.civil_twilight.upper, t);
        ozone = mix(SKY_KEYS.nautical_twilight.ozone, SKY_KEYS.civil_twilight.ozone, t);
        glow = mix(SKY_KEYS.nautical_twilight.glow, SKY_KEYS.civil_twilight.glow, t);
        horizon = mix(SKY_KEYS.nautical_twilight.horizon, SKY_KEYS.civil_twilight.horizon, t);
        sunColor = mix(SKY_KEYS.nautical_twilight.sun, SKY_KEYS.civil_twilight.sun, t);
        bloomColor = {r: 100, g: 50, b: 100};
        bloomSizeMult = 1.0;
    } else {
        const t = Math.max(0, Math.min(1, (elevation - (-0.25)) / 0.13));
        zenith = mix(SKY_KEYS.night.zenith, SKY_KEYS.nautical_twilight.zenith, t);
        upper = mix(SKY_KEYS.night.upper, SKY_KEYS.nautical_twilight.upper, t);
        ozone = mix(SKY_KEYS.night.ozone, SKY_KEYS.nautical_twilight.ozone, t);
        glow = mix(SKY_KEYS.night.glow, SKY_KEYS.nautical_twilight.glow, t);
        horizon = mix(SKY_KEYS.night.horizon, SKY_KEYS.nautical_twilight.horizon, t);
        sunColor = {r: 0, g: 0, b: 0};
        bloomColor = {r: 0, g: 0, b: 0};
        bloomSizeMult = 0;
    }

    const vacuumThreshold = 0.15;
    const vacuumFactor = density < vacuumThreshold ? (vacuumThreshold - density) / vacuumThreshold : 0;
    const atmosphereStrength = Math.min(1, density * 1.5); 
    const scatteringColor = { r: 135, g: 206, b: 250 }; 
    const sunLightIntensity = Math.max(0, Math.min(1, elevation + 0.3)); 
    const scatterStrength = Math.pow(atmosphereStrength, 0.5) * sunLightIntensity * 0.5;

    if (elevation > 0.1) {
        zenith = mix(zenith, scatteringColor, scatterStrength * 0.4);
        upper = mix(upper, scatteringColor, scatterStrength * 0.3);
        ozone = mix(ozone, scatteringColor, scatterStrength * 0.2);
    } else {
        const slate = { r: 50, g: 60, b: 80 };
        zenith = mix(zenith, slate, scatterStrength * 0.2);
        upper = mix(upper, slate, scatterStrength * 0.2);
    }

    if (vacuumFactor > 0) {
        const deepSpaceBlue = {r: 5, g: 10, b: 25};
        zenith = mix(zenith, deepSpaceBlue, vacuumFactor);
        upper = mix(upper, deepSpaceBlue, vacuumFactor * 0.9);
        ozone = mix(ozone, deepSpaceBlue, vacuumFactor * 0.7);
        glow = mix(glow, deepSpaceBlue, vacuumFactor * 0.8); 
        horizon = mix(horizon, deepSpaceBlue, vacuumFactor * 0.6);
    }

    const haze = {r: 215, g: 225, b: 235};
    const totalHaze = (humidity * 0.6) + (Math.max(0, density - 0.5) * 0.5);
    horizon = mix(horizon, haze, totalHaze * 0.3);
    glow = mix(glow, haze, totalHaze * 0.2);
    if (totalHaze > 0.2 && elevation > -0.1) { ozone = mix(ozone, glow, totalHaze * 0.3); }

    return { zenith, upper, ozone, glow, horizon, sunColor, bloomColor, bloomSizeMult };
};

const getBrushPaddingFactor = (brushType: string) => {
    switch (brushType) {
        case 'fan3': return 8.0; 
        case 'fan2': return 4.0;
        case 'pastel': case 'pastel2': return 3.0;
        default: return 2.5;
    }
};

const blendScreen = (b: ColorRGB, s: ColorRGB, alpha: number) => {
    const r = 255 - (255 - b.r) * (255 - s.r) / 255;
    const g = 255 - (255 - b.g) * (255 - s.g) / 255;
    const b_ = 255 - (255 - b.b) * (255 - s.b) / 255;
    return lerpColor(b, {r,g,b:b_}, alpha);
};

const blendColorDodge = (b: ColorRGB, s: ColorRGB, alpha: number) => {
    const dodge = (base: number, blend: number) => {
        if (base === 0) return 0;
        if (blend === 255) return 255;
        const val = base * 255 / (255 - blend);
        return Math.min(255, val);
    };
    const r = dodge(b.r, s.r);
    const g = dodge(b.g, s.g);
    const b_ = dodge(b.b, s.b);
    return lerpColor(b, {r,g,b:b_}, alpha);
};

// --- HOOK START ---
export const useGouacheEngine = (settings: BrushSettings, canvasColor: string, logicalWidth: number, logicalHeight: number, pixelRatio: number = 1) => {
  const refs = useRef<EngineRefs>({ 
      layerCanvases: new Map(), mask: null, temp: null, composite: null, heightMapPattern: null, snapshot: null, stars: null, skyState: null, skyLut: null, patternImage: null
  });
  
  const prevAtmosphereHashRef = useRef<string>('');
  
  const [layers, setLayers] = useState<Layer[]>([
      { id: 'layer-1', name: 'Layer 1', visible: true, ignoreGlow: false }
  ]);
  const [activeLayerId, setActiveLayerId] = useState('layer-1');
  const activeLayerIdRef = useRef('layer-1');
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);

  const layerContextsRef = useRef<Map<string, CanvasRenderingContext2D>>(new Map());
  const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const canvasColorRef = useRef(canvasColor);
  
  const [atmosphere, setAtmosphere] = useState<AtmosphereState>({ glowStyles: {}, ambientStyles: {}, gradeStyles: {}, ambientParams: null, skyColors: null });
  const [sunPosition, setSunPosition] = useState<{x: number, y: number} | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  
  const state = useRef({
    isDrawing: false,
    lastPoint: { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0 } as Point,
    angle: 0, 
    hasMoved: false,
    paintLoad: 1.0,
    bristles: [] as Bristle[],
    history: [] as HistoryState[],
    historyIndex: -1,
  });

  const getActiveContext = () => layerContextsRef.current.get(activeLayerIdRef.current) || null;
  const getActiveCanvas = () => refs.current.layerCanvases.get(activeLayerIdRef.current) || null;

  // --- BRISTLE GENERATION (AUTHORITATIVE) ---
  const updateBristles = useCallback((type: string, size: number) => {
    const baseColor = hexToRgb(settingsRef.current.color);
    const wetMode = settingsRef.current.wetMode;
    const newBristles: Bristle[] = [];
    const startWithPaint = !wetMode;

    if (type === 'pastel' || type === 'pastel2') {
        const particleCount = 60; 
        const voids: {x: number, y: number, r: number}[] = [];
        const numVoids = 3 + Math.floor(Math.random() * 3);
        for(let v=0; v<numVoids; v++) {
            voids.push({ x: (Math.random() - 0.5) * 1.0, y: (Math.random() - 0.5) * 1.0, r: 0.15 + Math.random() * 0.25 });
        }
        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()); 
            const px = r * Math.cos(theta);
            const py = r * Math.sin(theta);
            let rejected = false;
            for(const v of voids) { if (Math.hypot(px - v.x, py - v.y) < v.r) { rejected = true; break; } }
            if (rejected) continue;

            newBristles.push({
                dx: px, dy: py, length: 0.1, thickness: 0.5 + Math.random() * 2.5, 
                tempBias: (Math.random() - 0.5) * 1.0, hueBias: (Math.random() - 0.5) * 1.5, 
                feather: 0, drySensitivity: Math.random(), color: { ...baseColor }, hasPaint: true, normX: px, normY: py
            });
        }
    } else {
        let countMultiplier = 1.5;
        if (type === 'fan3') countMultiplier = 3.5;
        const bristleCount = Math.floor(size * countMultiplier); 
        
        for (let i = 0; i < bristleCount; i++) {
            let dx = 0, dy = 0, length = 1.0, thickness = 1.0;
            if (type === 'round') {
                const r = Math.pow(Math.random(), 0.5) * 0.5; const theta = Math.random() * Math.PI * 2;
                dx = r * Math.cos(theta); dy = r * Math.sin(theta) * 0.5; thickness = 1.0 - r; 
            } else if (type === 'fan') {
                dx = (Math.random() - 0.5) * 1.2; dy = (Math.random() - 0.5) * 0.1; length = 0.8 + Math.random() * 0.4;
            } else if (type === 'fan2') {
                const t = (Math.random() - 0.5) * 2.5;
                if (Math.abs(t) > 0.2 && Math.random() < 0.4) continue; 
                dx = t; dy = (Math.random() - 0.5) * 0.1; length = 0.7 + (Math.random() * 0.5); thickness = 0.5 + Math.random() * 0.8;
            } else if (type === 'fan3') {
                const u = (Math.random() - 0.5) * 2; const t = Math.sign(u) * Math.pow(Math.abs(u), 3); 
                dx = t * 1.1; dy = (Math.random() - 0.5) * 0.2; length = 0.6 + Math.random() * 0.6; thickness = 0.4 + Math.random() * 0.6;
            } else if (type === 'hog') {
                dx = (Math.random() - 0.5) * 0.8; dy = (Math.random() - 0.5) * 0.4; length = 0.5 + Math.random() * 1.0; 
            } else if (type === 'chisel') {
                dx = (i / bristleCount) - 0.5; dy = 0; length = 1.0; thickness = 1.5;
            } else { 
                dx = (i / bristleCount) - 0.5; dy = (Math.random() - 0.5) * 0.1; 
            }
            newBristles.push({
                dx, dy, length: length * (0.9 + Math.random() * 0.2), thickness: thickness * (0.8 + Math.random() * 0.4),
                tempBias: (Math.random() - 0.5) + (Math.random() - 0.5), hueBias: (Math.random() - 0.5) * 2, feather: (Math.random() - 0.5) * 0.5, drySensitivity: Math.random(),
                color: { ...baseColor }, hasPaint: startWithPaint
            });
        }
    }
    
    if (type !== 'pastel' && type !== 'pastel2') newBristles.sort((a, b) => a.dy - b.dy);
    else newBristles.sort(() => Math.random() - 0.5);
    state.current.bristles = newBristles;
  }, [settings.wetMode]); 

  useEffect(() => {
    updateBristles(settings.brushType, settings.size);
  }, [settings.brushType, settings.size, updateBristles]);

  useEffect(() => {
    const rgb = hexToRgb(settings.color);
    state.current.bristles.forEach(b => {
        if (!settings.wetMode) b.color = { ...rgb };
    });
  }, [settings.color, settings.wetMode]);


  useEffect(() => {
    if (settings.patternTexture) {
        const img = new Image();
        img.src = settings.patternTexture;
        img.onload = () => { refs.current.patternImage = img; };
    } else { refs.current.patternImage = null; }
  }, [settings.patternTexture]);

  const addLayer = useCallback(() => {
      const newId = `layer-${Date.now()}`;
      setLayers(prev => [...prev, { id: newId, name: `Layer ${prev.length + 1}`, visible: true, ignoreGlow: false }]);
      setActiveLayerId(newId);
  }, []);

  const removeLayer = useCallback((id: string) => {
      setLayers(prev => {
          if (prev.length <= 1) return prev;
          const newLayers = prev.filter(l => l.id !== id);
          if (activeLayerIdRef.current === id) {
             const last = newLayers[newLayers.length - 1];
             if(last) setActiveLayerId(last.id);
          }
          return newLayers;
      });
      layerContextsRef.current.delete(id);
      refs.current.layerCanvases.delete(id);
  }, []);

  useEffect(() => {
      const exists = layers.find(l => l.id === activeLayerId);
      if (!exists && layers.length > 0) setActiveLayerId(layers[layers.length - 1].id);
  }, [layers, activeLayerId]);

  const toggleLayerVisibility = useCallback((id: string) => {
      setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const toggleLayerGlow = useCallback((id: string) => {
      setLayers(prev => prev.map(l => l.id === id ? { ...l, ignoreGlow: !l.ignoreGlow } : l));
  }, []);

  useEffect(() => {
      let currentSunPos = sunPosition;
      let effectiveElevation = 0;

      if (settings.isGradientMode) {
          const t = settings.gradientTime;
          if (t < 0.5) {
              effectiveElevation = -0.1 + (t / 0.5) * 1.1; 
          } else {
              effectiveElevation = 1.0 - ((t - 0.5) / 0.5) * 1.1;
          }
          const horizonY = logicalHeight * settings.skyHorizon;
          const sx = logicalWidth * 0.5; 
          const maxSkyHeight = logicalHeight * 0.9;
          const sy = horizonY - (effectiveElevation * maxSkyHeight);
          currentSunPos = { x: sx, y: sy };

      } else if (settings.skyEnabled) {
          const horizonY = logicalHeight * settings.skyHorizon;
          const sx = logicalWidth * settings.sunAzimuth;
          const maxSkyHeight = logicalHeight * 0.9;
          const sy = horizonY - (settings.sunElevation * maxSkyHeight);
          currentSunPos = { x: sx, y: sy };
          effectiveElevation = settings.sunElevation;
      }

      if (!currentSunPos) {
          if (prevAtmosphereHashRef.current !== 'OFF') {
            setAtmosphere({ glowStyles: { opacity: 0 }, ambientStyles: { opacity: 0 }, gradeStyles: { opacity: 0 }, ambientParams: null, skyColors: null });
            refs.current.skyState = null;
            refs.current.skyLut = null;
            prevAtmosphereHashRef.current = 'OFF';
          }
          return;
      }
      
      const { gradientHumidity, sunIntensity, atmosphereDensity, sunDiffusion, skyHorizon, skyScale } = settings;
      const safeDensity = atmosphereDensity ?? 0.5;
      const physics = calculateSkyPhysics(effectiveElevation, safeDensity, gradientHumidity);
      
      let ambientStyles: React.CSSProperties = {};
      let gradeStyles: React.CSSProperties = {};
      let glowStyles: React.CSSProperties = { opacity: 0 };
      let ambientParams: AtmosphereState['ambientParams'] = null;
      
      let samplingGlowParams = undefined;
      let reflectionParams = undefined;

      if (settings.skyEnabled) {
          const cx = `${currentSunPos.x}px`;
          const cy = `${currentSunPos.y}px`;
          
          const hazeColor = lerpColor(physics.horizon, physics.ozone, 0.5); 
          const atmoOpacity = Math.min(0.9, safeDensity * 1.2); 
          
          const ambientBackground = `radial-gradient(circle at ${cx} ${cy}, 
              rgba(${hazeColor.r}, ${hazeColor.g}, ${hazeColor.b}, 0) 0%, 
              rgba(${hazeColor.r}, ${hazeColor.g}, ${hazeColor.b}, ${atmoOpacity * 0.2}) 30%, 
              rgba(${hazeColor.r}, ${hazeColor.g}, ${hazeColor.b}, ${atmoOpacity}) 100%
          )`;
          
          ambientStyles = { background: ambientBackground, mixBlendMode: 'screen', opacity: 1, pointerEvents: 'none' };
          ambientParams = {
              type: 'gradient',
              gradient: {
                  x: currentSunPos.x,
                  y: currentSunPos.y,
                  stops: [
                      { offset: 0, color: `rgba(${hazeColor.r}, ${hazeColor.g}, ${hazeColor.b}, 0)` },
                      { offset: 0.3, color: `rgba(${hazeColor.r}, ${hazeColor.g}, ${hazeColor.b}, ${atmoOpacity * 0.2})` },
                      { offset: 1.0, color: `rgba(${hazeColor.r}, ${hazeColor.g}, ${hazeColor.b}, ${atmoOpacity})` }
                  ]
              },
              mixBlendMode: 'screen',
              opacity: 1
          };
          
          let gradeColor = physics.zenith; 
          let gradeMode: React.CSSProperties['mixBlendMode'] = 'normal';
          let gradeOpacity = 0;
          let gradeFilter = 'none';

          if (effectiveElevation > 0.15) { gradeColor = physics.ozone; gradeMode = 'soft-light'; gradeOpacity = 0.15; gradeFilter = 'saturate(1.05)'; } 
          else if (effectiveElevation > 0.02) { gradeColor = physics.glow; gradeMode = 'overlay'; gradeOpacity = 0.5; gradeFilter = 'saturate(1.3) contrast(1.1) sepia(0.2)'; } 
          else if (effectiveElevation > -0.10) { gradeColor = lerpColor(physics.zenith, physics.glow, 0.3); gradeMode = 'multiply'; gradeOpacity = 0.6; gradeFilter = 'brightness(0.85) saturate(1.2) contrast(1.2)'; } 
          else if (effectiveElevation > -0.25) { gradeColor = physics.zenith; gradeMode = 'multiply'; gradeOpacity = 0.8; gradeFilter = 'brightness(0.6) saturate(1.1) contrast(1.3)'; } 
          else { gradeColor = {r: 5, g: 10, b: 25}; gradeMode = 'multiply'; gradeOpacity = 0.93; gradeFilter = 'brightness(0.4) grayscale(0.5) contrast(1.4)'; }

          gradeStyles = { backgroundColor: rgbToString(gradeColor), mixBlendMode: gradeMode, opacity: gradeOpacity, backdropFilter: gradeFilter, WebkitBackdropFilter: gradeFilter, pointerEvents: 'none' };
          
           const sunIsLow = settings.sunElevation < 0.2 && settings.sunElevation > -0.15;
          if (sunIsLow) {
              const reflectionOpacity = Math.min(1, (0.2 - settings.sunElevation) * 5);
              if (reflectionOpacity > 0.01) {
                 const pinkOpacity = Math.max(0, Math.min(1, (0.12 - settings.sunElevation) * 10));
                 const pinkColorRgb = { r: 255, g: 0, b: 110 }; 
                 const midColorRgb = { r: 255, g: 100, b: 50 };
                 let baseRefl = physics.sunColor;
                 if (pinkOpacity > 0.5) baseRefl = pinkColorRgb;
                 reflectionParams = { baseColor: baseRefl, midColor: midColorRgb, opacity: reflectionOpacity * 0.8, width: (90 * skyScale), height: 250 * skyScale };
              }
          }
      } else {
          let ambientHex = '#ffffff'; let gradeHex = '#808080'; let gradeMode: React.CSSProperties['mixBlendMode'] = 'overlay'; let gradeOpacity = 0;
          if (effectiveElevation > 0.4) { ambientHex = '#ffffff'; gradeHex = '#ffffff'; gradeOpacity = 0; }
          else if (effectiveElevation > 0.1) { ambientHex = '#fffaee'; gradeHex = '#ffebcd'; gradeMode = 'soft-light'; gradeOpacity = 0.2; }
          else if (effectiveElevation > -0.05) { ambientHex = '#d0ccc0'; gradeHex = '#ff4500'; gradeMode = 'hard-light'; gradeOpacity = 0.4 + (gradientHumidity * 0.2); }
          else if (effectiveElevation > -0.15) { ambientHex = '#8a8aa0'; gradeHex = '#800080'; gradeMode = 'overlay'; gradeOpacity = 0.5; }
          else { ambientHex = '#1a2035'; gradeHex = '#4b0082'; gradeMode = 'multiply'; gradeOpacity = 0.6; }
          ambientStyles = { backgroundColor: ambientHex, mixBlendMode: 'multiply', opacity: 1, pointerEvents: 'none' };
          ambientParams = {
              type: 'solid',
              color: ambientHex,
              mixBlendMode: 'multiply',
              opacity: 1
          };
          gradeStyles = { backgroundColor: gradeHex, mixBlendMode: gradeMode, opacity: gradeOpacity, pointerEvents: 'none' };
      }

      const intensity = sunIntensity || 0;
      const sunRgb = physics.sunColor;
      const diffusion = sunDiffusion ?? 0.6;

      if (settings.skyEnabled && intensity > 0.01 && effectiveElevation > -0.01) {
          const cx = `${currentSunPos.x}px`;
          const cy = `${currentSunPos.y}px`;
          let glowColorRgb = lerpColor(sunRgb, physics.glow, Math.min(1, safeDensity + 0.2));
          if (diffusion < 0.5) {
              const redShift = (0.5 - diffusion) * 2.0; 
              const deepRed = { r: 255, g: 40, b: 10 };
              glowColorRgb = lerpColor(glowColorRgb, deepRed, redShift * 0.8);
          }
          const coreRadius = 15 + (intensity * 25); 
          const maxBloom = safeDensity * 300; 
          const bloomExtent = 20 + (maxBloom * intensity * diffusion);
          const outerRadius = coreRadius + bloomExtent;
          const horizonClipPct = (1 - settings.skyHorizon) * 100;

          glowStyles = {
              background: `radial-gradient(circle at ${cx} ${cy}, 
                  rgba(${sunRgb.r}, ${sunRgb.g}, ${sunRgb.b}, 1.0) 0%, 
                  rgba(${glowColorRgb.r}, ${glowColorRgb.g}, ${glowColorRgb.b}, ${0.8 * (1 - diffusion * 0.4)}) ${coreRadius}px, 
                  rgba(${glowColorRgb.r}, ${glowColorRgb.g}, ${glowColorRgb.b}, 0) ${outerRadius}px
              )`,
              mixBlendMode: 'color-dodge', 
              opacity: 0.8 + (intensity * 0.2),
              pointerEvents: 'none',
              clipPath: `inset(0 0 ${horizonClipPct}% 0)` 
          };
          samplingGlowParams = { color: glowColorRgb, coreRadius: coreRadius, outerRadius: outerRadius, intensity: 0.8 + (intensity * 0.2) };
      }
      
      const baseWater = { r: 10, g: 15, b: 35 };
      let ground = lerpColor(baseWater, physics.horizon, 0.35); 
      if (effectiveElevation < -0.1) ground = lerpColor(ground, {r:2, g:2, b:5}, 0.9);

      const stops = [{ offset: 0, color: rgbToString(physics.zenith) }, { offset: 45, color: rgbToString(physics.upper) }, { offset: 75, color: rgbToString(physics.ozone) }, { offset: 92, color: rgbToString(physics.glow) }, { offset: 100, color: rgbToString(physics.horizon) }];
      const stopsRgb = [{ offset: 0, ...physics.zenith }, { offset: 45, ...physics.upper }, { offset: 75, ...physics.ozone }, { offset: 92, ...physics.glow }, { offset: 100, ...physics.horizon }];

      const lut = new Uint8ClampedArray(logicalHeight * 4);
      const hPct = skyHorizon * 100;
      const s = skyScale;
      const getStopY = (offset: number) => Math.max(0, ((hPct - offset) / 100) * logicalHeight);
      const y0 = 0; const y1 = Math.floor(getStopY(60 * s)); const y2 = Math.floor(getStopY(30 * s)); const y3 = Math.floor(getStopY(12 * s)); const y4 = Math.floor(logicalHeight * skyHorizon);

      for (let y = 0; y < logicalHeight; y++) {
          const idx = y * 4;
          let c: ColorRGB = ground; 
          if (y < y4) { 
              let c1, c2, t;
              if (y < y1) { c1 = stopsRgb[0]; c2 = stopsRgb[1]; t = (y - y0) / (Math.max(1, y1 - y0)); } 
              else if (y < y2) { c1 = stopsRgb[1]; c2 = stopsRgb[1]; t = (y - y1) / (Math.max(1, y2 - y1)); } 
              else if (y < y3) { c1 = stopsRgb[2]; c2 = stopsRgb[3]; t = (y - y2) / (Math.max(1, y3 - y2)); } 
              else { c1 = stopsRgb[3]; c2 = stopsRgb[4]; t = (y - y3) / (Math.max(1, y4 - y3)); }
              c = lerpColor(c1, c2, Math.max(0, Math.min(1, t)));
          }
          lut[idx] = c.r; lut[idx + 1] = c.g; lut[idx + 2] = c.b; lut[idx + 3] = 255;
      }

      refs.current.skyState = { stops, stopsRgb, ground: ground, sun: physics.sunColor, sunPos: currentSunPos, glow: samplingGlowParams, reflection: reflectionParams };
      refs.current.skyLut = lut; 

      const shouldGenerateColors = settings.skyEnabled || settings.isGradientMode;

      const nextAtmosphereState = { 
          glowStyles, ambientStyles, gradeStyles, ambientParams,
          skyColors: shouldGenerateColors ? { stops: stops, ground: rgbToString(ground), sun: rgbToString(physics.sunColor), sunX: currentSunPos.x, sunY: currentSunPos.y } : null
      };
      const nextHash = JSON.stringify(nextAtmosphereState);
      if (nextHash !== prevAtmosphereHashRef.current) { prevAtmosphereHashRef.current = nextHash; setAtmosphere(nextAtmosphereState); }

  }, [settings.gradientTime, settings.gradientHumidity, settings.sunIntensity, settings.skyEnabled, settings.isGradientMode, settings.sunElevation, settings.skyHorizon, settings.sunAzimuth, sunPosition, logicalWidth, logicalHeight, settings.atmosphereDensity, settings.sunDiffusion, settings.skyScale]);

  useEffect(() => { canvasColorRef.current = canvasColor; }, [canvasColor]);

  const commitHistory = useCallback(() => {
      const activeCtx = layerContextsRef.current.get(activeLayerIdRef.current);
      const activeCanvas = refs.current.layerCanvases.get(activeLayerIdRef.current);
      if (!activeCtx || !activeCanvas || !maskCtxRef.current) return;
      const w = activeCanvas.width; const h = activeCanvas.height;

      // SAFETY GUARD: Zero dimension check
      if (w <= 0 || h <= 0) return;

      if (state.current.historyIndex < state.current.history.length - 1) state.current.history.splice(state.current.historyIndex + 1);
      state.current.history.push({ layerId: activeLayerIdRef.current, painting: activeCtx.getImageData(0, 0, w, h), mask: maskCtxRef.current.getImageData(0, 0, w, h) });
      state.current.historyIndex++;
      let currentMemoryUsage = state.current.history.reduce((acc, h) => acc + h.painting.data.length + h.mask.data.length, 0);
      while (state.current.history.length > 0 && currentMemoryUsage > MAX_HISTORY_BYTES) {
          const removed = state.current.history.shift();
          if (removed) { currentMemoryUsage -= (removed.painting.data.length + removed.mask.data.length); state.current.historyIndex--; }
      }
      if (state.current.history.length > 20) { state.current.history.shift(); state.current.historyIndex--; }
  }, []);

  const undo = useCallback(() => {
      if (state.current.historyIndex <= 0 || !maskCtxRef.current) return;
      state.current.historyIndex--;
      const prevState = state.current.history[state.current.historyIndex];
      if (prevState) {
          const ctx = layerContextsRef.current.get(prevState.layerId);
          if (ctx) ctx.putImageData(prevState.painting, 0, 0);
          maskCtxRef.current.putImageData(prevState.mask, 0, 0);
      }
  }, []);

  const redo = useCallback(() => {
      if (state.current.historyIndex >= state.current.history.length - 1 || !maskCtxRef.current) return;
      state.current.historyIndex++;
      const nextState = state.current.history[state.current.historyIndex];
      if (nextState) {
          const ctx = layerContextsRef.current.get(nextState.layerId);
          if (ctx) ctx.putImageData(nextState.painting, 0, 0);
          maskCtxRef.current.putImageData(nextState.mask, 0, 0);
      }
  }, []);

  // UPDATED: SAFE RESIZE WITHOUT CONTENT LOSS
  const updateSize = useCallback((width: number, height: number) => {
      const { temp, layerCanvases, mask, composite } = refs.current;
      const dpr = pixelRatio; // Use capped pixel ratio
      const newWidth = width * dpr;
      const newHeight = height * dpr;

      // SAFETY GUARD: 
      if (newWidth <= 0 || newHeight <= 0) return;

      const safeResize = (c: HTMLCanvasElement) => {
         if (c.width === newWidth && c.height === newHeight) return false;
         
         const tempC = document.createElement('canvas');
         tempC.width = c.width;
         tempC.height = c.height;
         const tempCtx = tempC.getContext('2d');
         if (tempCtx && c.width > 0 && c.height > 0) tempCtx.drawImage(c, 0, 0);

         c.width = newWidth;
         c.height = newHeight;
         c.style.width = '100%';
         c.style.height = '100%';
         const ctx = c.getContext('2d');
         
         if (ctx) {
             ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
             ctx.imageSmoothingEnabled = true;
             
             ctx.save();
             ctx.setTransform(1, 0, 0, 1, 0, 0);
             if (tempC.width > 0 && tempC.height > 0) ctx.drawImage(tempC, 0, 0);
             ctx.restore();
         }
         return true; 
      };

      let anyResized = false;
      if (mask) { if (safeResize(mask)) anyResized = true; }
      if (temp) { safeResize(temp); } 
      if (composite) { safeResize(composite); }
      layerCanvases.forEach(c => { if (safeResize(c)) anyResized = true; });

      if (anyResized) {
          state.current.history = []; 
          state.current.historyIndex = -1; 
          commitHistory();
      } else if (state.current.history.length === 0) {
          commitHistory();
      }
  }, [commitHistory, pixelRatio]);

  const init = useCallback((getLayerCanvas: (id: string) => HTMLCanvasElement | null, mask: HTMLCanvasElement, heightMap?: HTMLCanvasElement) => {
    layers.forEach(l => {
        const c = getLayerCanvas(l.id);
        if (c) {
             refs.current.layerCanvases.set(l.id, c);
             const ctx = c.getContext('2d', { willReadFrequently: true });
             if(ctx) { ctx.imageSmoothingEnabled = true; layerContextsRef.current.set(l.id, ctx); }
        }
    });
    refs.current.mask = mask;
    if (!refs.current.temp) refs.current.temp = document.createElement('canvas');
    if (!refs.current.composite) refs.current.composite = document.createElement('canvas');
    
    const mCtx = mask.getContext('2d', { willReadFrequently: true });
    const tCtx = refs.current.temp!.getContext('2d', { willReadFrequently: true });
    if (mCtx && tCtx) {
      maskCtxRef.current = mCtx; tempCtxRef.current = tCtx;
      if (heightMap && tempCtxRef.current) refs.current.heightMapPattern = tempCtxRef.current.createPattern(heightMap, 'repeat');
      updateSize(logicalWidth, logicalHeight);
    }
  }, [logicalWidth, logicalHeight, updateSize, layers]);

  useEffect(() => { updateSize(logicalWidth, logicalHeight); }, [logicalWidth, logicalHeight, updateSize]);

  const setPaperTexture = useCallback((heightMap: HTMLCanvasElement) => {
      if (tempCtxRef.current) {
          refs.current.heightMapPattern = tempCtxRef.current.createPattern(heightMap, 'repeat');
      }
  }, []);

  const applyAtmosphericGlow = useCallback((baseColor: ColorRGB, x: number, y: number, state: SkyState | null): ColorRGB => {
      if (!settingsRef.current.skyEnabled || !state || !state.glow || !state.sunPos) return baseColor;
      const { glow, sunPos } = state; const dx = x - sunPos.x; const dy = y - sunPos.y; const distSq = dx*dx + dy*dy; 
      if (distSq < glow.outerRadius * glow.outerRadius) {
          const dist = Math.sqrt(distSq); const normDist = dist / glow.outerRadius; const glowStrength = Math.pow(1 - normDist, 2) * glow.intensity;
          if (glowStrength > 0.01) { return blendColorDodge(baseColor, glow.color, glowStrength); }
      }
      return baseColor;
  }, []);

  const sampleSkyRGB = useCallback((x: number, y: number): { r: number, g: number, b: number } | null => {
      if (!settingsRef.current.skyEnabled || !refs.current.skyState) return null;
      const { stopsRgb, ground, sun, sunPos, reflection } = refs.current.skyState; const { skyHorizon, skyScale, waterEnabled, waterOpacity } = settingsRef.current;
      const horizonY = logicalHeight * skyHorizon; let baseColor = { ...ground };
      if (y > horizonY) { const groundHeight = logicalHeight - horizonY; const dist = Math.max(0, y - horizonY); const t = Math.min(1, dist / (groundHeight * 0.4)); const horizonColor = stopsRgb[4]; baseColor = lerpColor(horizonColor, ground, t); } else { if (sunPos) { const dx = x - sunPos.x; const dy = y - sunPos.y; const distSq = dx*dx + dy*dy; const sunRadius = (90 * skyScale) / 2; if (distSq < sunRadius * sunRadius) return sun; } const lut = refs.current.skyLut; if (lut) { const yInt = Math.floor(Math.max(0, Math.min(logicalHeight - 1, y))); const idx = yInt * 4; baseColor = { r: lut[idx], g: lut[idx + 1], b: lut[idx + 2] }; } }
      if (y > horizonY && reflection && sunPos) { const dy = y - horizonY; if (dy < reflection.height && dy >= 0) { const dx = Math.abs(x - sunPos.x); const halfWidth = reflection.width / 2; const blurRadius = 15; let hIntensity = 0; if (dx < halfWidth) { hIntensity = 1; } else { const distPastEdge = dx - halfWidth; if (distPastEdge < blurRadius * 2) { hIntensity = 1 - (distPastEdge / (blurRadius * 2)); } } if (hIntensity > 0) { const vPct = dy / reflection.height; let reflColor; let vOpacity = 1; if (vPct < 0.6) { const t = vPct / 0.6; reflColor = lerpColor(reflection.baseColor, reflection.midColor, t); vOpacity = 1.0 - (t * 0.5); } else { const t = (vPct - 0.6) / 0.4; reflColor = reflection.midColor; vOpacity = 0.5 * (1.0 - t); } const totalAlpha = reflection.opacity * hIntensity * vOpacity; baseColor = blendScreen(baseColor, reflColor, totalAlpha); } } }
      const hazeHeight = 100; const hazeHalf = hazeHeight / 2; const distFromHorizon = Math.abs(y - horizonY);
      if (distFromHorizon < hazeHalf) { const relY = (y - (horizonY - hazeHalf)) / hazeHeight; let hazeAlpha = 0; if (relY < 0.4) { hazeAlpha = relY / 0.4; } else if (relY > 0.6) { hazeAlpha = 1.0 - ((relY - 0.6) / 0.4); } else { hazeAlpha = 1.0; } const finalHazeAlpha = hazeAlpha * 0.6; if (finalHazeAlpha > 0.01) { baseColor = blendScreen(baseColor, stopsRgb[4], finalHazeAlpha); } }
      baseColor = applyAtmosphericGlow(baseColor, x, y, refs.current.skyState);
      return baseColor;
  }, [logicalHeight, applyAtmosphericGlow]);

  const getWetBuffer = useCallback((x: number, y: number, w: number, h: number): WetBuffer | null => {
      const dpr = pixelRatio;
      const startX = Math.floor(x * dpr);
      const startY = Math.floor(y * dpr);
      const width = Math.ceil(w * dpr);
      const height = Math.ceil(h * dpr);

      // SAFETY GUARD
      if (width <= 0 || height <= 0) return null;

      let compC = refs.current.composite;
      if (!compC) {
          compC = document.createElement('canvas');
          refs.current.composite = compC;
      }
      
      if (compC.width < width || compC.height < height) {
          compC.width = Math.max(compC.width, width);
          compC.height = Math.max(compC.height, height);
      }

      const compCtx = compC.getContext('2d', { willReadFrequently: true });
      if (!compCtx) return null;

      compCtx.clearRect(0, 0, width, height);

      layers.forEach(layer => {
          if (layer.visible) {
              const lCanvas = refs.current.layerCanvases.get(layer.id);
              if (lCanvas) {
                  compCtx.drawImage(lCanvas, startX, startY, width, height, 0, 0, width, height);
              }
          }
      });

      try {
          const imgData = compCtx.getImageData(0, 0, width, height);
          return {
              data: imgData.data,
              width: width,
              height: height,
              x: startX,
              y: startY
          };
      } catch (e) {
          return null;
      }
  }, [layers, pixelRatio]);

  const capturePattern = useCallback((): string | null => {
      const activeCanvas = getActiveCanvas();
      if (!activeCanvas) return null;
      return activeCanvas.toDataURL();
  }, [activeLayerId]);

  const drawPatternLine = useCallback((x1: number, y1: number, x2: number, y2: number) => {
      const ctx = getActiveContext();
      const patternImg = refs.current.patternImage;
      if (!ctx || !patternImg) return;
      const dx = x2 - x1; const dy = y2 - y1; const length = Math.hypot(dx, dy); if (length < 1) return;
      const settings = settingsRef.current;
      const jitterScale = settings.patternJitterScale || 0; const jitterRot = settings.patternJitterRotation || 0; const jitterHue = settings.patternJitterHue || 0; const jitterSat = settings.patternJitterSaturation || 0; const jitterVal = settings.patternJitterValue || 0;
      const baseVisualSize = Math.max(15, 50 * settings.patternScale); const spacing = Math.max(5, baseVisualSize * 0.5); 
      const steps = Math.ceil(length / spacing); if (steps > 2000) return; 
      const stepX = (dx / length) * spacing; const stepY = (dy / length) * spacing;
      ctx.save();
      for (let i = 0; i <= steps; i++) {
          const cx = x1 + stepX * i; const cy = y1 + stepY * i;
          let instanceRot = settings.patternStampRotation;
          if (jitterRot > 0) { const offset = (Math.random() - 0.5) * 2.0 * (jitterRot * 180); instanceRot = (instanceRot + offset) % 360; }
          const rad = (instanceRot + settings.patternAngle) * Math.PI / 180;
          let instanceScale = settings.patternScale;
          if (jitterScale > 0) { const scaleMult = 1.0 + (Math.random() - 0.5) * 2.0 * jitterScale; instanceScale *= Math.max(0.1, scaleMult); }
          let filterString = '';
          if (jitterHue > 0) { const hueOffset = (Math.random() - 0.5) * 360 * jitterHue; filterString += `hue-rotate(${hueOffset}deg) `; }
          if (jitterSat > 0) { const satMult = 100 + (Math.random() - 0.5) * 200 * jitterSat; filterString += `saturate(${Math.max(0, satMult)}%) `; }
          if (jitterVal > 0) { const valMult = 100 + (Math.random() - 0.5) * 200 * jitterVal; filterString += `brightness(${Math.max(0, valMult)}%) `; }
          const scaleFactor = (50 / patternImg.width) * instanceScale; const drawW = patternImg.width * scaleFactor; const drawH = patternImg.height * scaleFactor;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rad); 
          if (filterString) { ctx.filter = filterString.trim(); }
          ctx.drawImage(patternImg, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
      }
      ctx.restore(); commitHistory();
  }, [commitHistory]);

  const drawPatternLasso = useCallback((points: {x: number, y: number}[]) => {
      const ctx = getActiveContext(); const patternImg = refs.current.patternImage; if (!ctx || !patternImg || points.length < 3) return;
      const settings = settingsRef.current;
      let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
      points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      const padding = Math.max(20, 50 * settings.patternScale); minX -= padding; maxX += padding; minY -= padding; maxY += padding;
      const jitterScale = settings.patternJitterScale || 0; const jitterRot = settings.patternJitterRotation || 0; const jitterHue = settings.patternJitterHue || 0; const jitterSat = settings.patternJitterSaturation || 0; const jitterVal = settings.patternJitterValue || 0;
      const baseVisualSize = Math.max(15, 50 * settings.patternScale); const stepX = baseVisualSize * 0.8; const stepY = baseVisualSize * 0.8;
      const cols = (maxX - minX) / stepX; const rows = (maxY - minY) / stepY; if (cols * rows > 5000) return;
      ctx.save(); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) { const xc = (points[i].x + points[i + 1].x) / 2; const yc = (points[i].y + points[i + 1].y) / 2; ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc); }
      if (points.length > 2) ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.closePath(); ctx.clip(); 
      const startGridX = Math.floor(minX / stepX) * stepX; const startGridY = Math.floor(minY / stepY) * stepY;
      for (let gy = startGridY; gy < maxY; gy += stepY) {
          for (let gx = startGridX; gx < maxX; gx += stepX) {
              const seed = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453; const rand1 = seed - Math.floor(seed); const rand2 = (seed * 1.5) - Math.floor(seed * 1.5); const rand3 = (seed * 2.0) - Math.floor(seed * 2.0); const rand4 = (seed * 13.37) % 1; const rand5 = (seed * 42.42) % 1; 
              let instanceRot = settings.patternStampRotation; if (jitterRot > 0) { const offset = (rand1 - 0.5) * 2.0 * (jitterRot * 180); instanceRot = (instanceRot + offset) % 360; }
              const rad = (instanceRot + settings.patternAngle) * Math.PI / 180; let instanceScale = settings.patternScale; if (jitterScale > 0) { const scaleMult = 1.0 + (rand2 - 0.5) * 2.0 * jitterScale; instanceScale *= Math.max(0.1, scaleMult); }
              let filterString = ''; if (jitterHue > 0) { const hueOffset = (rand3 - 0.5) * 360 * jitterHue; filterString += `hue-rotate(${hueOffset}deg) `; } if (jitterSat > 0) { const satMult = 100 + (Math.abs(rand4) - 0.5) * 200 * jitterSat; filterString += `saturate(${Math.max(0, satMult)}%) `; } if (jitterVal > 0) { const valMult = 100 + (Math.abs(rand5) - 0.5) * 200 * jitterVal; filterString += `brightness(${Math.max(0, valMult)}%) `; }
              const scaleFactor = (50 / patternImg.width) * instanceScale; const drawW = patternImg.width * scaleFactor; const drawH = patternImg.height * scaleFactor;
              ctx.save(); ctx.translate(gx + stepX/2, gy + stepY/2); ctx.rotate(rad); if (filterString) { ctx.filter = filterString.trim(); } ctx.drawImage(patternImg, -drawW / 2, -drawH / 2, drawW, drawH); ctx.restore();
          }
      }
      if (settingsRef.current.useTexture && refs.current.heightMapPattern) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.5; ctx.fillStyle = refs.current.heightMapPattern; ctx.fill(); }
      if (refs.current.mask) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1.0; ctx.drawImage(refs.current.mask, 0, 0, ctx.canvas.width / pixelRatio, ctx.canvas.height / pixelRatio); }
      ctx.restore(); commitHistory();
  }, [commitHistory, pixelRatio]);

  const drawStippleLasso = useCallback((points: {x: number, y: number}[]) => {
      const activeCtx = getActiveContext(); const activeCanvas = getActiveCanvas(); if (!activeCtx || !activeCanvas || points.length < 3) return;
      const dpr = pixelRatio; const width = activeCanvas.width; const height = activeCanvas.height; const currentSettings = settingsRef.current;
      let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y; points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      const angleRad = (currentSettings.patternAngle - 90) * (Math.PI / 180); const vecX = Math.cos(angleRad); const vecY = Math.sin(angleRad);
      const corners = [{x: minX, y: minY}, {x: maxX, y: minY}, {x: maxX, y: maxY}, {x: minX, y: maxY}]; let minProj = Infinity, maxProj = -Infinity; corners.forEach(c => { const proj = c.x * vecX + c.y * vecY; minProj = Math.min(minProj, proj); maxProj = Math.max(maxProj, proj); }); const projRange = Math.max(1, maxProj - minProj);
      const baseRgb = hexToRgb(currentSettings.color); const baseColorStr = rgbToString(baseRgb); const dotSize = Math.max(0.5, currentSettings.size / 10); const density = Math.min(1.0, currentSettings.opacity); 
      const tCtx = tempCtxRef.current; if (!tCtx || !refs.current.temp) return;
      tCtx.save(); tCtx.setTransform(dpr, 0, 0, dpr, 0, 0); tCtx.clearRect(0, 0, width/dpr, height/dpr);
      tCtx.beginPath(); tCtx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length - 1; i++) { const xc = (points[i].x + points[i + 1].x) / 2; const yc = (points[i].y + points[i + 1].y) / 2; tCtx.quadraticCurveTo(points[i].x, points[i].y, xc, yc); } if (points.length > 2) tCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y); tCtx.closePath(); tCtx.clip();
      const area = (maxX - minX) * (maxY - minY); const dotCount = (area / (dotSize * dotSize * 2)) * density * 5; const maxDots = 50000; const actualDots = Math.min(dotCount, maxDots); const hasVariation = currentSettings.colorVariation > 0.01 || currentSettings.hueVariation > 0.01;
      tCtx.globalAlpha = 1.0; 
      if (!hasVariation) {
          tCtx.fillStyle = baseColorStr; tCtx.beginPath();
          for (let i = 0; i < actualDots; i++) { const rx = minX + Math.random() * (maxX - minX); const ry = minY + Math.random() * (maxY - minY); const proj = rx * vecX + ry * vecY; const t = (proj - minProj) / projRange; const gradientFactor = 1.0 - t; 
              if (Math.random() < gradientFactor) { const r = dotSize * (0.5 + Math.random() * 0.5); tCtx.moveTo(rx + r, ry); tCtx.arc(rx, ry, r, 0, Math.PI * 2); } }
          tCtx.fill();
      } else {
          for (let i = 0; i < actualDots; i++) { const rx = minX + Math.random() * (maxX - minX); const ry = minY + Math.random() * (maxY - minY); const proj = rx * vecX + ry * vecY; const t = (proj - minProj) / projRange; const gradientFactor = 1.0 - t; 
              if (Math.random() < gradientFactor) { let dotRgb = {...baseRgb}; if (currentSettings.hueVariation > 0.01) { const hueShift = (Math.random() - 0.5) * 2 * currentSettings.hueVariation * 60; dotRgb = shiftHslRgb(dotRgb, hueShift, 0, 0); } if (currentSettings.colorVariation > 0.01) { const drift = (Math.random() - 0.5) * 2 * currentSettings.colorVariation; const targetTint = drift > 0 ? WARM_TINT : COOL_TINT; dotRgb = lerpColor(dotRgb, targetTint, Math.abs(drift)); } tCtx.fillStyle = rgbToString(dotRgb); tCtx.beginPath(); const r = dotSize * (0.5 + Math.random() * 0.5); tCtx.arc(rx, ry, r, 0, Math.PI * 2); tCtx.fill(); } }
      }
      if (currentSettings.useTexture && refs.current.heightMapPattern) { tCtx.globalCompositeOperation = 'destination-out'; tCtx.globalAlpha = 0.5; tCtx.fillStyle = refs.current.heightMapPattern; tCtx.fillRect(minX, minY, maxX - minX, maxY - minY); }
      if (refs.current.mask) { tCtx.globalCompositeOperation = 'destination-out'; tCtx.globalAlpha = 1.0; tCtx.drawImage(refs.current.mask, 0, 0, width/dpr, height/dpr); }
      tCtx.restore(); activeCtx.save(); activeCtx.globalAlpha = 1.0; activeCtx.globalCompositeOperation = currentSettings.isEraser ? 'destination-out' : (currentSettings.blendMode || 'source-over'); activeCtx.setTransform(1, 0, 0, 1, 0, 0); activeCtx.drawImage(refs.current.temp, 0, 0); activeCtx.restore(); tCtx.save(); tCtx.setTransform(1, 0, 0, 1, 0, 0); tCtx.clearRect(0, 0, width, height); tCtx.restore(); commitHistory();
  }, [commitHistory, pixelRatio]);

  const drawLasso = useCallback((points: {x: number, y: number}[]) => {
      const ctx = maskCtxRef.current; if (!ctx || points.length < 3) return;
      ctx.save(); ctx.globalCompositeOperation = settingsRef.current.lassoMode === 'subtract' ? 'destination-out' : 'source-over';
      ctx.fillStyle = '#2b6cb0'; ctx.globalAlpha = 1.0;
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length - 1; i++) { const xc = (points[i].x + points[i + 1].x) / 2; const yc = (points[i].y + points[i + 1].y) / 2; ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc); } if (points.length > 2) ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y); ctx.closePath(); ctx.fill(); ctx.restore(); commitHistory();
  }, [commitHistory]);

  const drawRectLassoFill = useCallback((p1: {x: number, y: number}, p2: {x: number, y: number}) => {
      const activeCtx = getActiveContext(); const tCtx = tempCtxRef.current; const activeCanvas = getActiveCanvas(); if (!activeCtx || !activeCanvas || !refs.current.temp || !tCtx) return;
      const dpr = pixelRatio; const width = activeCanvas.width; const height = activeCanvas.height; const currentSettings = settingsRef.current;
      const minX = Math.min(p1.x, p2.x); const minY = Math.min(p1.y, p2.y); const w = Math.abs(p2.x - p1.x); const h = Math.abs(p2.y - p1.y); 
      
      // SAFETY GUARD
      if (w < 1 || h < 1) return;
      
      let fillRgb = hexToRgb(currentSettings.color); if (currentSettings.hueVariation > 0.01) { const hueShift = (Math.random() - 0.5) * 2 * currentSettings.hueVariation * 60; fillRgb = shiftHslRgb(fillRgb, hueShift, 0, 0); } if (currentSettings.colorVariation > 0.01) { const drift = (Math.random() - 0.5) * 2 * currentSettings.colorVariation; const targetTint = drift > 0 ? WARM_TINT : COOL_TINT; fillRgb = lerpColor(fillRgb, targetTint, Math.abs(drift)); } const fillStyleStr = rgbToString(fillRgb);
      tCtx.save(); tCtx.setTransform(dpr, 0, 0, dpr, 0, 0); tCtx.clearRect(0, 0, width / dpr, height / dpr); tCtx.globalCompositeOperation = 'source-over'; tCtx.fillStyle = fillStyleStr; tCtx.globalAlpha = currentSettings.opacity; tCtx.fillRect(minX, minY, w, h);
      if (currentSettings.wetMode && !currentSettings.isEraser) { const wetBuffer = getWetBuffer(minX, minY, w, h); if (wetBuffer) { const bx = Math.floor(minX * dpr); const by = Math.floor(minY * dpr); const bw = Math.ceil(w * dpr); const bh = Math.ceil(h * dpr); if (bw > 0 && bh > 0) { const tempImageData = tCtx.getImageData(bx, by, bw, bh); const tempData = tempImageData.data; const wetData = wetBuffer.data; const tColor = { r: 0, g: 0, b: 0 }; const wColor = { r: 0, g: 0, b: 0 }; const len = tempData.length; for(let i = 0; i < len; i += 4) { if (tempData[i+3] > 0) { if (i < wetData.length && wetData[i+3] > 20) { tColor.r = tempData[i]; tColor.g = tempData[i+1]; tColor.b = tempData[i+2]; wColor.r = wetData[i]; wColor.g = wetData[i+1]; wColor.b = wetData[i+2]; mixOklabFloatInPlace(tColor, wColor, 0.15); tempData[i] = tColor.r; tempData[i+1] = tColor.g; tempData[i+2] = tColor.b; } } } tCtx.putImageData(tempImageData, bx, by); } } }
      if (currentSettings.useTexture && refs.current.heightMapPattern) { tCtx.globalCompositeOperation = 'destination-out'; const textureInfluence = 0.5; tCtx.globalAlpha = textureInfluence; tCtx.fillStyle = refs.current.heightMapPattern; tCtx.fillRect(minX, minY, w, h); }
      if (refs.current.mask) { tCtx.globalCompositeOperation = 'destination-out'; tCtx.globalAlpha = 1.0; tCtx.drawImage(refs.current.mask, 0, 0, width / dpr, height / dpr); }
      tCtx.restore(); activeCtx.save(); activeCtx.globalAlpha = 1.0; activeCtx.globalCompositeOperation = currentSettings.isEraser ? 'destination-out' : (currentSettings.blendMode || 'source-over'); activeCtx.setTransform(1, 0, 0, 1, 0, 0); activeCtx.drawImage(refs.current.temp, 0, 0); activeCtx.restore(); tCtx.save(); tCtx.setTransform(1, 0, 0, 1, 0, 0); tCtx.clearRect(0, 0, width, height); tCtx.restore(); commitHistory();
  }, [commitHistory, getWetBuffer, pixelRatio]);

  const drawGradBlendLasso = useCallback((points: {x: number, y: number}[]) => {
      const activeCtx = getActiveContext();
      const tCtx = tempCtxRef.current;
      const activeCanvas = getActiveCanvas();
      if (!activeCtx || !activeCanvas || !refs.current.temp || !tCtx || points.length < 3) return;

      const dpr = pixelRatio;
      const width = activeCanvas.width;
      const height = activeCanvas.height;
      const currentSettings = settingsRef.current;

      // 1. Calculate Bounds
      let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
      points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      
      const w = (maxX - minX) * dpr;
      const h = (maxY - minY) * dpr;
      if(w < 1 || h < 1) return;

      // 2. Prepare Colors
      const baseC1 = hexToRgb(currentSettings.color);
      const baseC2 = hexToRgb(currentSettings.gradColor2 || '#ffffff');

      // 3. Determine Gradient Vector (Start Point -> Furthest Point in Lasso)
      const start = points[0];
      let maxDistSq = 0;
      let end = points[0];
      points.forEach(p => {
          const d = (p.x - start.x)**2 + (p.y - start.y)**2;
          if (d > maxDistSq) { maxDistSq = d; end = p; }
      });
      const vec = { x: end.x - start.x, y: end.y - start.y };
      const lenSq = maxDistSq || 1; 

      // 4. Fill Temp Canvas with Dithered Gradient
      tCtx.save();
      tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tCtx.clearRect(0, 0, width/dpr, height/dpr);
      
      // Clip to lasso
      tCtx.beginPath();
      tCtx.moveTo(points[0].x, points[0].y);
      for(let i=1; i<points.length; i++) tCtx.lineTo(points[i].x, points[i].y);
      tCtx.closePath();
      tCtx.clip();

      const bx = Math.floor(minX * dpr);
      const by = Math.floor(minY * dpr);
      const bw = Math.ceil((maxX - minX) * dpr);
      const bh = Math.ceil((maxY - minY) * dpr);
      
      if (bw <= 0 || bh <= 0) { tCtx.restore(); return; }

      // Fill shape with black to define alpha mask
      tCtx.fillStyle = '#000000'; 
      tCtx.fill();
      
      const imgData = tCtx.getImageData(bx, by, bw, bh);
      const data = imgData.data;
      
      for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
              const idx = (y * bw + x) * 4;
              if (data[idx + 3] > 0) { // If pixel is inside shape
                  // Calculate position in logical space
                  const gx = (bx + x) / dpr;
                  const gy = (by + y) / dpr;
                  
                  // Project onto vector
                  const vpx = gx - start.x;
                  const vpy = gy - start.y;
                  const t = (vpx * vec.x + vpy * vec.y) / lenSq;
                  const clampedT = Math.max(0, Math.min(1, t));
                  
                  // Stochastic Dithering
                  const noise = Math.random();
                  const useC2 = noise < clampedT;
                  let finalColor = useC2 ? baseC2 : baseC1;
                  
                  // Apply Variations (Pixel Level)
                  if (currentSettings.hueVariation > 0.01) {
                      const hueShift = (Math.random() - 0.5) * 2 * currentSettings.hueVariation * 60;
                      finalColor = shiftHslRgb(finalColor, hueShift, 0, 0);
                  }
                  if (currentSettings.colorVariation > 0.01) {
                      const drift = (Math.random() - 0.5) * 2 * currentSettings.colorVariation;
                      const targetTint = drift > 0 ? WARM_TINT : COOL_TINT;
                      finalColor = lerpColor(finalColor, targetTint, Math.abs(drift));
                  }
                  
                  data[idx] = finalColor.r;
                  data[idx+1] = finalColor.g;
                  data[idx+2] = finalColor.b;
                  data[idx+3] = 255 * currentSettings.opacity; 
              }
          }
      }
      
      tCtx.putImageData(imgData, bx, by);
      tCtx.restore();

      // --- NEW: APPLY TEXTURE AND MASK ---
      tCtx.save();
      tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      if (currentSettings.useTexture && refs.current.heightMapPattern) {
          tCtx.globalCompositeOperation = 'destination-out';
          const textureInfluence = 0.5;
          tCtx.globalAlpha = textureInfluence;
          tCtx.fillStyle = refs.current.heightMapPattern;
          tCtx.fillRect(minX, minY, maxX - minX, maxY - minY);
      }

      if (refs.current.mask) {
          tCtx.globalCompositeOperation = 'destination-out';
          tCtx.globalAlpha = 1.0;
          tCtx.drawImage(refs.current.mask, 0, 0, width / dpr, height / dpr);
      }
      tCtx.restore();
      // -----------------------------------

      // 5. Composite to Main Layer
      activeCtx.save();
      activeCtx.globalCompositeOperation = currentSettings.blendMode || 'source-over';
      activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      activeCtx.drawImage(refs.current.temp, 0, 0);
      activeCtx.restore();

      // Clear temp
      tCtx.save();
      tCtx.setTransform(1, 0, 0, 1, 0, 0);
      tCtx.clearRect(0, 0, width, height);
      tCtx.restore();

      commitHistory();
  }, [commitHistory, pixelRatio]);

  const drawLassoFill = useCallback((points: {x: number, y: number}[]) => {
      const activeCtx = getActiveContext(); const tCtx = tempCtxRef.current; const activeCanvas = getActiveCanvas(); if (!activeCtx || !activeCanvas || !refs.current.temp || !tCtx || points.length < 3) return;
      const dpr = pixelRatio; const width = activeCanvas.width; const height = activeCanvas.height; const currentSettings = settingsRef.current;
      let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y; points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      const boundsW = (maxX - minX) * dpr; const boundsH = (maxY - minY) * dpr;
      
      // SAFETY GUARD
      if (boundsW < 1 || boundsH < 1) return;

      let fillRgb = hexToRgb(currentSettings.color); if (currentSettings.hueVariation > 0.01) { const hueShift = (Math.random() - 0.5) * 2 * currentSettings.hueVariation * 60; fillRgb = shiftHslRgb(fillRgb, hueShift, 0, 0); } if (currentSettings.colorVariation > 0.01) { const drift = (Math.random() - 0.5) * 2 * currentSettings.colorVariation; const targetTint = drift > 0 ? WARM_TINT : COOL_TINT; fillRgb = lerpColor(fillRgb, targetTint, Math.abs(drift)); } const fillStyleStr = rgbToString(fillRgb);
      tCtx.save(); tCtx.setTransform(dpr, 0, 0, dpr, 0, 0); tCtx.clearRect(0, 0, width / dpr, height / dpr); tCtx.globalCompositeOperation = 'source-over'; tCtx.fillStyle = fillStyleStr; tCtx.globalAlpha = currentSettings.opacity;
      tCtx.beginPath(); tCtx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length - 1; i++) { const xc = (points[i].x + points[i + 1].x) / 2; const yc = (points[i].y + points[i + 1].y) / 2; tCtx.quadraticCurveTo(points[i].x, points[i].y, xc, yc); } if (points.length > 2) tCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y); tCtx.closePath(); tCtx.fill();
      if (currentSettings.wetMode && !currentSettings.isEraser) { const wetBuffer = getWetBuffer(minX, minY, maxX - minX, maxY - minY); if (wetBuffer) { const bx = Math.floor(minX * dpr); const by = Math.floor(minY * dpr); const bw = Math.ceil((maxX - minX) * dpr); const bh = Math.ceil((maxY - minY) * dpr); if (bw > 0 && bh > 0) { const tempImageData = tCtx.getImageData(bx, by, bw, bh); const tempData = tempImageData.data; const wetData = wetBuffer.data; const tColor = { r: 0, g: 0, b: 0 }; const wColor = { r: 0, g: 0, b: 0 }; const len = tempData.length; for(let i = 0; i < len; i += 4) { if (tempData[i+3] > 0) { if (i < wetData.length && wetData[i+3] > 20) { tColor.r = tempData[i]; tColor.g = tempData[i+1]; tColor.b = tempData[i+2]; wColor.r = wetData[i]; wColor.g = wetData[i+1]; wColor.b = wetData[i+2]; mixOklabFloatInPlace(tColor, wColor, 0.15); tempData[i] = tColor.r; tempData[i+1] = tColor.g; tempData[i+2] = tColor.b; } } } tCtx.putImageData(tempImageData, bx, by); } } }
      if (currentSettings.useTexture && refs.current.heightMapPattern) { tCtx.globalCompositeOperation = 'destination-out'; const textureInfluence = 0.5; tCtx.globalAlpha = textureInfluence; tCtx.fillStyle = refs.current.heightMapPattern; tCtx.fill(); }
      if (refs.current.mask) { tCtx.globalCompositeOperation = 'destination-out'; tCtx.globalAlpha = 1.0; tCtx.drawImage(refs.current.mask, 0, 0, width / dpr, height / dpr); }
      tCtx.restore(); activeCtx.save(); activeCtx.globalAlpha = 1.0; activeCtx.globalCompositeOperation = currentSettings.isEraser ? 'destination-out' : (currentSettings.blendMode || 'source-over'); activeCtx.setTransform(1, 0, 0, 1, 0, 0); activeCtx.drawImage(refs.current.temp, 0, 0); activeCtx.restore(); tCtx.save(); tCtx.setTransform(1, 0, 0, 1, 0, 0); tCtx.clearRect(0, 0, width, height); tCtx.restore(); commitHistory();
  }, [commitHistory, getWetBuffer, pixelRatio]);

  // --- DRAWING LOGIC (AUTHORITATIVE) ---
  const drawSegment = (
      x: number, y: number, pressure: number, tiltX: number | undefined, tiltY: number | undefined,
      writeBoundsRef: { minX: number, minY: number, maxX: number, maxY: number },
      wetBuffer: WetBuffer | null
  ) => {
    if (!state.current.isDrawing || !getActiveContext() || !tempCtxRef.current) return;
    
    const tCtx = tempCtxRef.current;
    const dpr = pixelRatio;
    const { lastPoint } = state.current;
    const { bristles } = state.current;
    const currentSettings = settingsRef.current;

    const isFan2 = currentSettings.brushType === 'fan2';
    const isFan3 = currentSettings.brushType === 'fan3';
    const isPastel = currentSettings.brushType === 'pastel';
    const isPastel2 = currentSettings.brushType === 'pastel2';
    
    const dist = Math.hypot(x - lastPoint.x, y - lastPoint.y);
    const baseSize = currentSettings.size;
    
    let spacingFactor = 0.08; 
    if (currentSettings.pressureSensitivity) {
         const minP = Math.min(lastPoint.pressure, pressure);
         spacingFactor *= Math.max(0.15, minP); 
    }
    
    let stepSize = Math.max(1.5, baseSize * spacingFactor);
    if (isPastel) stepSize = Math.max(1.5, baseSize * 0.22);
    if (isPastel2) stepSize = Math.max(1.5, baseSize * 0.25);

    if (dist < stepSize && state.current.hasMoved) {
        return; 
    }

    const steps = Math.ceil(dist / stepSize); 

    if (dist > 4) {
      const targetAngle = Math.atan2(y - lastPoint.y, x - lastPoint.x);
      if (!state.current.hasMoved) {
          state.current.angle = targetAngle;
          state.current.hasMoved = true;
      } else {
        const rotateSpeed = (currentSettings.brushType === 'chisel') ? 0.35 : 0.08;
        let diff = targetAngle - state.current.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        state.current.angle += diff * rotateSpeed; 
      }
    }

    const baseOpacity = currentSettings.opacity;
    let tiltMag = 0.5;
    if (tiltX !== undefined && tiltY !== undefined) {
         const maxTilt = Math.max(Math.abs(tiltX), Math.abs(tiltY)); 
         tiltMag = Math.min(1, maxTilt / 60); 
    }
    let rotationOffset = 0;
    if ((isFan2 || isFan3) && tiltX !== undefined) rotationOffset = (tiltX / 45) * (Math.PI / 4);
    const angle = state.current.angle + Math.PI / 2 + rotationOffset;
    
    const speed = dist; 
    const speedFactor = Math.min(speed / 15, 1.0); 

    const staticBristleColorStr = (!currentSettings.wetMode && currentSettings.colorVariation < 0.01 && currentSettings.hueVariation < 0.01)
        ? rgbToString(hexToRgb(currentSettings.color))
        : null;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const curX = lastPoint.x + (x - lastPoint.x) * t;
      const curY = lastPoint.y + (y - lastPoint.y) * t;
      const curPressure = lastPoint.pressure + (pressure - lastPoint.pressure) * t;

      const pad = baseSize * 2; 
      writeBoundsRef.minX = Math.min(writeBoundsRef.minX, curX - pad);
      writeBoundsRef.minY = Math.min(writeBoundsRef.minY, curY - pad);
      writeBoundsRef.maxX = Math.max(writeBoundsRef.maxX, curX + pad);
      writeBoundsRef.maxY = Math.max(writeBoundsRef.maxY, curY + pad);

      let currentSize = baseSize;
      if (currentSettings.pressureSensitivity && !isFan2 && !isFan3 && !isPastel && !isPastel2) {
          currentSize *= curPressure;
      }

      let depletionRate = currentSettings.wetMode ? 0.0001 : 0.0003;
      if (currentSettings.wetMode && state.current.paintLoad < 0.5) depletionRate = 0.00005;
      if ((isPastel || isPastel2) && !currentSettings.wetMode) depletionRate = 0; 

      const depletion = depletionRate * (1 + speedFactor * 3) * stepSize; 
      state.current.paintLoad = Math.max(0, state.current.paintLoad - depletion);
      const impasto = Math.pow(curPressure, 2); 
      const instanceCount = (isPastel || isPastel2) ? 2 : 1;

      for (let c = 0; c < instanceCount; c++) {
          let instanceAngle = angle;
          let instanceSize = currentSize;
          let instanceSquash = 1.0;

          if (isPastel || isPastel2) {
              instanceAngle = Math.random() * Math.PI * 2;
              const sizeJitter = 0.08; 
              instanceSize = currentSize * (1.0 - (Math.random() * sizeJitter)); 
              instanceSize *= (0.4 + curPressure * 0.6); 
              instanceSquash = 1.0 - (Math.random() * 0.06);
          }

          const iCos = Math.cos(instanceAngle);
          const iSin = Math.sin(instanceAngle);

          for (let b = 0; b < bristles.length; b++) {
            const bristle = bristles[b];
            let bx = bristle.dx * instanceSize;
            let by = bristle.dy * instanceSize; 
            by *= instanceSquash;

            if (isFan2) bx *= (0.8 + (tiltMag * 0.4)); 
            if (isFan3 && !isPastel && !isPastel2) {
                const extremeSpread = 1.0 + Math.pow(curPressure, 2) * 4.0;
                bx = bristle.dx * currentSize * extremeSpread;
                if (curPressure > 0.25) {
                    const chaos = (curPressure - 0.25) * 1.5; 
                    by += (Math.sin(b * 0.5) * chaos * currentSize * 0.4);
                }
            }
            
            if (!isPastel && !isPastel2) {
                const noise = (Math.sin(curX * 0.2) + Math.cos(curY * 0.2)) * 0.1;
                const dryThreshold = (1 - state.current.paintLoad) * 0.5 + (speedFactor * 0.3);
                if (dryThreshold + noise > bristle.drySensitivity) continue; 
            }

            const rx = bx * iCos - by * iSin;
            const ry = bx * iSin + by * iCos;
            const scatterX = (isPastel || isPastel2) ? (Math.random() - 0.5) * instanceSize * 0.03 : 0;
            const scatterY = (isPastel || isPastel2) ? (Math.random() - 0.5) * instanceSize * 0.03 : 0;
            const finalX = curX + rx + scatterX;
            const finalY = curY + ry + scatterY;

            // --- OPTIMIZED WET BLEND LOOKUP ---
            if (currentSettings.wetMode && wetBuffer) {
               const pX = (finalX * dpr) | 0;
               const pY = (finalY * dpr) | 0;
               const localX = pX - wetBuffer.x;
               const localY = pY - wetBuffer.y;

               if (localX >= 0 && localY >= 0 && localX < wetBuffer.width && localY < wetBuffer.height) { 
                   const idx = (localY * wetBuffer.width + localX) * 4;
                   if (wetBuffer.data[idx + 3] > 20) {
                       const existingColor = { r: wetBuffer.data[idx], g: wetBuffer.data[idx + 1], b: wetBuffer.data[idx + 2] };
                       
                       if (!bristle.hasPaint) {
                            bristle.color = { ...existingColor };
                            bristle.hasPaint = true;
                            state.current.paintLoad = Math.max(state.current.paintLoad, 0.5);
                       } else {
                            const mixFactor = 0.1;
                            mixPigmentsFloatInPlace(bristle.color, existingColor, mixFactor);
                            state.current.paintLoad = Math.min(1, state.current.paintLoad + 0.05);
                       }
                   }
               }
            }

            if (currentSettings.wetMode && !bristle.hasPaint) continue;

            let bristleWidth = Math.max(1, instanceSize * 0.05 * bristle.thickness * (1 + impasto));
            const bristleLen = instanceSize * 0.15 * bristle.length; 
            
            let alpha = baseOpacity * state.current.paintLoad;
            
            if (!isPastel && !isPastel2) {
                 const edgeFactor = currentSettings.brushType === 'chisel' ? 1 : (1 - Math.pow(Math.abs(bristle.dx) * 1.8, 3));
                 alpha *= edgeFactor;
                 if (currentSettings.pressureSensitivity) {
                    if (isFan2 || isFan3) alpha *= Math.pow(curPressure, 2.5); else alpha *= (0.3 + curPressure * 1.5);
                 }
                 if (currentSettings.wetMode) alpha *= 0.95; 
            } else if (isPastel) {
                 alpha = baseOpacity * Math.pow(curPressure, 1.5);
                 if (currentSettings.wetMode) alpha *= 0.95;
            } else if (isPastel2) {
                 alpha = baseOpacity * Math.pow(curPressure, 2.5);
                 if (currentSettings.wetMode) alpha *= 0.95;
            }

            alpha = Math.min(1, Math.max(0, alpha));
            if (alpha < 0.01) continue;

            let fillStyleStr;
            if (staticBristleColorStr) {
                fillStyleStr = staticBristleColorStr;
            } else {
                let bristleRgb = { ...bristle.color };
                if (currentSettings.hueVariation > 0.01 && Math.abs(bristle.hueBias) > 0.01) {
                    bristleRgb = shiftHslRgb(bristleRgb, bristle.hueBias * currentSettings.hueVariation * 60, 0, 0);
                }
                if (currentSettings.colorVariation > 0.01 && Math.abs(bristle.tempBias) > 0.05) { 
                    const effectIntensity = Math.abs(bristle.tempBias) * currentSettings.colorVariation;
                    bristleRgb = lerpColor(bristleRgb, bristle.tempBias > 0 ? WARM_TINT : COOL_TINT, effectIntensity);
                }
                fillStyleStr = rgbToString(bristleRgb);
            }

            tCtx.globalAlpha = alpha;
            tCtx.globalCompositeOperation = currentSettings.blendMode || 'source-over';
            tCtx.fillStyle = fillStyleStr;
            tCtx.save();
            tCtx.translate(finalX, finalY);
            tCtx.rotate(instanceAngle); 
            
            if (isPastel2) {
               const spotRadius = Math.max(0.5, bristleWidth * 0.6); 
               tCtx.beginPath();
               tCtx.rect(-spotRadius, -spotRadius, spotRadius * 2, spotRadius * 2);
               tCtx.fill();
            } else {
               const featherOffset = bristle.feather * bristleLen; 
               tCtx.fillRect(-bristleWidth/2, featherOffset, bristleWidth, bristleLen);
            }
            tCtx.restore();
          }
      }
    }
    
    if (currentSettings.useTexture && refs.current.heightMapPattern) {
        let textureInfluence = 1.0; 
        if (isPastel) {
             textureInfluence = 1.0 - (Math.pow(pressure, 2.0) * 0.85);
             textureInfluence = Math.max(0.1, Math.min(1.0, textureInfluence));
        } else if (isPastel2) {
             textureInfluence = 1.0 - (Math.pow(pressure, 3.0) * 0.9);
             textureInfluence = Math.max(0.1, Math.min(1.0, textureInfluence));
        } else {
             let influence = 1.0 - (pressure * 1.3);
             const dryFactor = Math.pow(1.0 - state.current.paintLoad, 0.5);
             influence = Math.max(influence, dryFactor);
             textureInfluence = Math.min(1.0, Math.max(0, influence));
        }

        if (textureInfluence > 0.01) {
            tCtx.save();
            tCtx.globalCompositeOperation = 'destination-out';
            tCtx.globalAlpha = textureInfluence; 
            tCtx.fillStyle = refs.current.heightMapPattern;
            
            const padding = baseSize; 
            const minX = Math.min(state.current.lastPoint.x, x) - padding;
            const minY = Math.min(state.current.lastPoint.y, y) - padding;
            const maxX = Math.max(state.current.lastPoint.x, x) + padding;
            const maxY = Math.max(state.current.lastPoint.y, y) + padding;
            
            tCtx.beginPath();
            tCtx.rect(minX, minY, maxX - minX, maxY - minY);
            tCtx.fill();
            tCtx.restore();
        }
    }
    
    // Mask logic
    if (refs.current.mask) {
        tCtx.save();
        tCtx.globalCompositeOperation = 'destination-out';
        tCtx.globalAlpha = 1.0;
        tCtx.setTransform(dpr, 0, 0, dpr, 0, 0); 
        tCtx.drawImage(refs.current.mask, 0, 0, refs.current.mask.width / dpr, refs.current.mask.height / dpr);
        tCtx.restore();
    }

    state.current.lastPoint = { x, y, pressure, tiltX, tiltY };
  };

  const drawBatch = useCallback((points: Point[]) => {
      const activeCtx = getActiveContext();
      const activeCanvas = getActiveCanvas();
      if (!activeCtx || !activeCanvas || !refs.current.temp || !tempCtxRef.current || points.length === 0) return;

      const dpr = pixelRatio;
      const w = activeCanvas.width / dpr;
      const h = activeCanvas.height / dpr;
      
      tempCtxRef.current.clearRect(0, 0, w, h);
      
      const writeBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      let wetBuffer: WetBuffer | null = null;
      
      const filteredEvents: typeof points = [];
      let lastEv = state.current.lastPoint;
      
      points.forEach((e, i) => {
         const isLast = i === points.length - 1;
         const d = Math.hypot(e.x - lastEv.x, e.y - lastEv.y);
         if (d > 0.5 || isLast) { 
             filteredEvents.push(e);
             lastEv = e;
         }
      });

      if (filteredEvents.length === 0) return;

      if (settingsRef.current.wetMode) {
          const startP = state.current.lastPoint;
          let rMinX = startP.x, rMinY = startP.y, rMaxX = startP.x, rMaxY = startP.y;
          
          filteredEvents.forEach(e => {
              rMinX = Math.min(rMinX, e.x);
              rMinY = Math.min(rMinY, e.y);
              rMaxX = Math.max(rMaxX, e.x);
              rMaxY = Math.max(rMaxY, e.y);
          });
          
          const pad = settingsRef.current.size * 2 * dpr;
          const sx = Math.max(0, Math.floor(rMinX * dpr - pad));
          const sy = Math.max(0, Math.floor(rMinY * dpr - pad));
          const ex = Math.min(activeCanvas.width, Math.ceil(rMaxX * dpr + pad));
          const ey = Math.min(activeCanvas.height, Math.ceil(rMaxY * dpr + pad));
          const sw = ex - sx;
          const sh = ey - sy;

          if (sw > 0 && sh > 0) {
              // Use getWetBuffer logic (composited) to support mixing across layers
              const buffer = getWetBuffer(sx / dpr, sy / dpr, sw / dpr, sh / dpr);
              if (buffer) wetBuffer = buffer;
          }
      }

      filteredEvents.forEach(p => {
          drawSegment(p.x, p.y, p.pressure, p.tiltX, p.tiltY, writeBounds, wetBuffer);
      });
      
      if (writeBounds.minX < writeBounds.maxX && writeBounds.minY < writeBounds.maxY) {
          activeCtx.save();
          activeCtx.globalCompositeOperation = settingsRef.current.isEraser ? 'destination-out' : (settingsRef.current.blendMode || 'source-over');
          activeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          
          const pad = 2;
          const sx = Math.max(0, Math.floor(writeBounds.minX - pad));
          const sy = Math.max(0, Math.floor(writeBounds.minY - pad));
          const sw = Math.min(w, Math.ceil(writeBounds.maxX + pad)) - sx;
          const sh = Math.min(h, Math.ceil(writeBounds.maxY + pad)) - sy;
          
          if (sw > 0 && sh > 0) {
            activeCtx.drawImage(refs.current.temp!, sx * dpr, sy * dpr, sw * dpr, sh * dpr, sx, sy, sw, sh);
          }
          activeCtx.restore();
      }
      wetBuffer = null;
      
  }, [drawSegment, getWetBuffer, pixelRatio]);

  const drawStroke = useCallback((x: number, y: number, pressure: number, tiltX?: number, tiltY?: number) => {
      drawBatch([{x, y, pressure: pressure || 0.5, tiltX, tiltY}]);
  }, [drawBatch]);

  const startStroke = useCallback((x: number, y: number, pressure: number = 0.5, tiltX: number = 0, tiltY: number = 0) => {
    state.current.isDrawing = true;
    state.current.lastPoint = { x, y, pressure, tiltX, tiltY };
    
    if (settingsRef.current.autoClean) {
        const freshColor = hexToRgb(settingsRef.current.color);
        state.current.bristles.forEach(b => {
            if (settingsRef.current.wetMode) {
                b.hasPaint = false; 
            } else {
                b.color = { ...freshColor };
                b.hasPaint = true;
            }
        });
        state.current.paintLoad = 1.0;
    } else {
        state.current.paintLoad = Math.max(state.current.paintLoad, 0.5);
    }
    state.current.hasMoved = false; 
  }, []);

  const endStroke = useCallback(() => {
    if (state.current.isDrawing) {
        state.current.isDrawing = false;
        commitHistory();
    }
  }, [commitHistory]);

  const pickColor = useCallback((x: number, y: number): string | null => {
      const dpr = pixelRatio;
      
      for (let i = layers.length - 1; i >= 0; i--) {
          const layer = layers[i];
          if (!layer.visible) continue;
          
          const ctx = layerContextsRef.current.get(layer.id);
          if (ctx) {
              try {
                  const w = ctx.canvas.width;
                  if (w === 0) return null; // Guard against 0 width
                  const pixel = ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data;
                  if (pixel[3] > 0) {
                      return rgbToHex(pixel[0], pixel[1], pixel[2]);
                  }
              } catch(e) { }
          }
      }
      
      if (settingsRef.current.skyEnabled) {
          const skyRgb = sampleSkyRGB(x, y);
          if (skyRgb) return rgbToHex(skyRgb.r, skyRgb.g, skyRgb.b);
      }
      
      return canvasColorRef.current;
  }, [layers, sampleSkyRGB, pixelRatio]);

  const clear = useCallback(() => {
      const activeCanvas = getActiveCanvas();
      if (activeCanvas) {
          clearCanvas(activeCanvas);
          commitHistory();
      }
  }, [commitHistory]);

  const clearMask = useCallback(() => {
      const mask = refs.current.mask;
      if (mask) {
          clearCanvas(mask);
          commitHistory();
      }
  }, [commitHistory]);

  const invertMask = useCallback(() => {
      const mask = refs.current.mask;
      const ctx = maskCtxRef.current;
      if (!mask || !ctx) return;
      const w = mask.width;
      const h = mask.height;

      // SAFETY GUARD
      if (w <= 0 || h <= 0) return;

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
          data[i + 3] = 255 - data[i + 3];
          data[i] = 43; data[i + 1] = 108; data[i + 2] = 176;
      }
      ctx.putImageData(imageData, 0, 0);
      commitHistory();
  }, [commitHistory]);

  const drawTape = useCallback((x1: number, y1: number, x2: number, y2: number) => {
      const ctx = maskCtxRef.current;
      if (!ctx) return;
      
      const width = settingsRef.current.tapeWidth;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      
      const nx = -dy / len;
      const ny = dx / len;
      const halfWidth = width / 2;
      const step = 2; 
      const steps = Math.ceil(len / step);
      const leftEdge: {x: number, y: number}[] = [];
      const rightEdge: {x: number, y: number}[] = [];

      for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = x1 + dx * t;
          const cy = y1 + dy * t;
          const roughness = 1.5; 
          const j1 = (Math.random() - 0.5) * roughness;
          const j2 = (Math.random() - 0.5) * roughness;
          leftEdge.push({ x: cx + nx * (halfWidth + j1), y: cy + ny * (halfWidth + j1) });
          rightEdge.push({ x: cx - nx * (halfWidth + j2), y: cy - ny * (halfWidth + j2) });
      }

      ctx.save();
      ctx.globalCompositeOperation = settingsRef.current.lassoMode === 'subtract' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      if (leftEdge.length > 0) ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
      for (let i = 1; i < leftEdge.length; i++) ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
      for (let i = rightEdge.length - 1; i >= 0; i--) ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
      ctx.closePath();
      ctx.fillStyle = '#2b6cb0'; 
      ctx.globalAlpha = 1.0; 
      ctx.fill();
      ctx.restore();
      commitHistory();
  }, [commitHistory]);

  const drawSkyGradient = useCallback((p1: {x: number, y: number}, p2: {x: number, y: number}, isPreview: boolean) => {
      const activeCtx = getActiveContext();
      const activeCanvas = getActiveCanvas();
      const tCtx = tempCtxRef.current;
      if (!activeCtx || !activeCanvas || !tCtx || !refs.current.temp) return;

      const dpr = pixelRatio;
      const width = activeCanvas.width;
      const height = activeCanvas.height;

      // SAFETY GUARD
      if (width <= 0 || height <= 0) return;

      if (isPreview && !refs.current.snapshot) {
           refs.current.snapshot = activeCtx.getImageData(0, 0, width, height);
      }
      
      if (isPreview && refs.current.snapshot) {
          activeCtx.putImageData(refs.current.snapshot, 0, 0);
      }

      tCtx.save();
      tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tCtx.clearRect(0, 0, width / dpr, height / dpr);

      const grad = tCtx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
      const stops = refs.current.skyState?.stops || atmosphere.skyColors?.stops;
      
      if (stops) {
           stops.forEach(s => grad.addColorStop(s.offset/100, s.color));
      } else {
           grad.addColorStop(0, settingsRef.current.color);
           grad.addColorStop(1, 'rgba(255,255,255,0)');
      }

      tCtx.globalCompositeOperation = 'source-over';
      tCtx.globalAlpha = settingsRef.current.opacity;
      tCtx.fillStyle = grad;
      tCtx.fillRect(0, 0, width / dpr, height / dpr);

      if (refs.current.mask) {
          tCtx.globalCompositeOperation = 'destination-out';
          tCtx.globalAlpha = 1.0;
          tCtx.drawImage(refs.current.mask, 0, 0, width / dpr, height / dpr);
      }
      tCtx.restore();

      activeCtx.save();
      activeCtx.globalCompositeOperation = settingsRef.current.blendMode || 'source-over';
      activeCtx.globalAlpha = 1.0; 
      activeCtx.setTransform(1, 0, 0, 1, 0, 0); 
      activeCtx.drawImage(refs.current.temp, 0, 0);
      activeCtx.restore();

      tCtx.save();
      tCtx.setTransform(1, 0, 0, 1, 0, 0);
      tCtx.clearRect(0, 0, width, height);
      tCtx.restore();

      if (!isPreview) {
          refs.current.snapshot = null;
          commitHistory();
      }
  }, [commitHistory, atmosphere, pixelRatio]);

  const commitSnapshot = useCallback(() => {
      refs.current.snapshot = null;
  }, []);

  const cancelSnapshot = useCallback(() => {
      const activeCtx = getActiveContext();
      if (activeCtx && refs.current.snapshot) {
          activeCtx.putImageData(refs.current.snapshot, 0, 0);
          refs.current.snapshot = null;
      }
  }, []);

  const renderBrushCursor = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, pressure: number = 0.5, tiltX: number = 0, tiltY: number = 0) => {
      const dpr = pixelRatio;
      const w = ctx.canvas.width / dpr;
      const h = ctx.canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      
      const { bristles, angle } = state.current;
      const isFan2 = settingsRef.current.brushType === 'fan2';
      const isFan3 = settingsRef.current.brushType === 'fan3';
      const isPastel = settingsRef.current.brushType === 'pastel';
      const isPastel2 = settingsRef.current.brushType === 'pastel2';

      let currentSize = settingsRef.current.size;
      if (settingsRef.current.pressureSensitivity && !isFan2 && !isFan3) {
          currentSize *= pressure;
      }
      
      let tiltMag = 0.5;
      if (tiltX !== 0 || tiltY !== 0) {
           const maxTilt = Math.max(Math.abs(tiltX), Math.abs(tiltY)); 
           tiltMag = Math.min(1, maxTilt / 60); 
      }
      
      let rotationOffset = 0;
      if (isFan2 || isFan3) rotationOffset = (tiltX / 45) * (Math.PI / 4);
      
      const drawAngle = angle + Math.PI / 2 + rotationOffset;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(drawAngle);

      ctx.fillStyle = settingsRef.current.color;
      ctx.globalAlpha = 0.6; 

      const skipFactor = isFan3 || isPastel || isPastel2 ? 3 : 1;

      for (let b = 0; b < bristles.length; b += skipFactor) {
           const bristle = bristles[b];
           const splay = 1.0 + (pressure * 0.8);
           let bx = bristle.dx * currentSize * splay;
           let by = bristle.dy * currentSize * splay;

           if (isFan2) bx *= (0.8 + (tiltMag * 0.4)); 

           if (isFan3 && !isPastel && !isPastel2) {
                const extremeSpread = 1.0 + Math.pow(pressure, 2) * 4.0;
                bx = bristle.dx * currentSize * extremeSpread;
                if (pressure > 0.25) {
                     const chaos = (pressure - 0.25) * 1.5; 
                     by += (Math.sin(b * 0.5) * chaos * currentSize * 0.4);
                }
           }
  
           const bristleWidth = Math.max(1.5, currentSize * 0.05 * bristle.thickness);
           
           ctx.beginPath();
           if (isPastel2) {
               const r = bristleWidth / 2;
               ctx.rect(bx - r, by - r, r*2, r*2);
           } else {
               ctx.arc(bx, by, bristleWidth / 2, 0, Math.PI * 2);
           }
           ctx.fill();
      }
      
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = settingsRef.current.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const radius = currentSize * (isFan2 || isFan3 ? 0.8 : 0.4);
      
      if (isPastel || isPastel2) {
           ctx.setLineDash([2, 4]);
           ctx.arc(0, 0, currentSize * 0.5, 0, Math.PI * 2);
           ctx.stroke();
           ctx.setLineDash([]);
      } else if (settingsRef.current.brushType === 'flat' || settingsRef.current.brushType === 'chisel') {
           ctx.rect(-radius, -2, radius * 2, 4);
           ctx.stroke();
      }
      
      ctx.restore();
  }, [pixelRatio]);

  return {
    init, startStroke, endStroke, drawStroke, drawBatch, clear, pickColor, drawTape, drawLasso, drawLassoFill, drawRectLassoFill,
    drawStippleLasso, drawPatternLasso, drawPatternLine, drawGradBlendLasso, capturePattern,
    clearMask, invertMask, renderBrushCursor, undo, redo, drawSkyGradient, commitSnapshot, cancelSnapshot, atmosphere, 
    layers, activeLayerId, setActiveLayerId, addLayer, removeLayer, toggleLayerVisibility, toggleLayerGlow, setPaperTexture
  };
};
