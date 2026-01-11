

export type BrushType = 'flat' | 'hog' | 'round' | 'fan' | 'fan2' | 'fan3' | 'chisel' | 'pastel' | 'pastel2';
export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'color-dodge' | 'overlay' | 'lighten' | 'darken';

export interface Layer {
    id: string;
    name: string;
    visible: boolean;
    ignoreGlow: boolean; // If true, layer renders on top of atmosphere
}

export interface BrushSettings {
  brushType: BrushType;
  size: number;
  opacity: number;
  color: string;
  wetMode: boolean; // Blending enabled
  blendMode: BlendMode; // Layer composite operation
  pressureSensitivity: boolean;
  useTexture: boolean; // New: Toggle texture physics
  isEraser: boolean; // New: Global Eraser toggle
  colorVariation: number; // Thermal/Color drift intensity (Warm/Cool)
  hueVariation: number; // HSL Hue jitter intensity
  isTapeMode: boolean; // Tape tool active
  tapeWidth: number; // New: Width of the masking tape
  isLassoMode: boolean; // New: Lasso tool active (Masking)
  isLassoFill: boolean; // New: Lasso Fill tool active (Painting)
  isRectLassoFill: boolean; // New: Rectangular Lasso Fill tool active (Painting)
  isStippleFill: boolean; // New: Stipple Lasso tool
  lassoMode: 'add' | 'subtract'; // New: Add or remove mask
  isGradientMode: boolean; // New: Gradient/Sky tool active
  
  // New Tool: Gradient Blend Lasso
  isGradBlend: boolean;
  gradColor2: string;

  // Pattern Toolset
  isPatternLasso: boolean; // New: Lasso Pattern Fill
  isPatternLine: boolean; // New: Line Pattern Stamp
  patternTexture: string | null; // Data URL of the captured pattern
  patternScale: number; // 0.1 to 5.0
  patternAngle: number; // 0 to 360 degrees (Grid Orientation)
  patternStampRotation: number; // New: 0 to 360 degrees (Individual Stamp Rotation)
  patternJitterScale: number; // New: 0.0 to 1.0 (Random Scale Intensity)
  patternJitterRotation: number; // New: 0.0 to 1.0 (Random Rotation Intensity)
  patternJitterHue: number; // New: 0.0 to 1.0 (Random Hue Shift Intensity)
  patternJitterSaturation: number; // New: 0.0 to 1.0 (Random Saturation Intensity)
  patternJitterValue: number; // New: 0.0 to 1.0 (Random Brightness/Value Intensity)

  gradientTime: number; // New: 0.0 (Sunrise) -> 1.0 (Night)
  gradientHumidity: number; // New: 0.0 (Clear) -> 1.0 (Hazy)
  sunIntensity: number; // New: Intensity of the sun glow peaking through strokes
  sunDiffusion: number; // New: Sharpness vs Diffusion of the sun glow (0.0 = Sharp/Red, 1.0 = Soft/Diffuse)
  
  // Physical Sky (Dynamic Background)
  skyEnabled: boolean; // New: Toggle dynamic sky background
  sunEnabled: boolean; // New: Toggle visibility of the sun disc
  skyTime: number; // Deprecated in favor of calculation, kept for types compatibility if needed
  skyHorizon: number; // 0.0 (Top) -> 1.0 (Bottom) of canvas (The Horizon Line)
  sunAzimuth: number; // 0.0 (Left) -> 1.0 (Right)
  sunElevation: number; // New: -0.2 (Night) -> 0.0 (Horizon) -> 1.0 (Zenith)
  skyScale: number; // New: 0.5 (Small) -> 3.0 (Large) - Scales the sun/moon
  atmosphereDensity: number; // New: 0.0 (Vacuum) -> 1.0 (Thick/Dispersed)

  // Water Plane
  waterEnabled: boolean; // Toggle water reflection
  waterLayerReflections: boolean; // New: Toggle reflection of painted layers
  waterOpacity: number; // 0.0 to 1.0 transparency of the water
  waterTurbulenceX: number; // 0.0 to 1.0 Horizontal spread/distortion
  waterTurbulenceY: number; // 0.0 to 1.0 Vertical spread/wave height
  waterFractal: number; // 0.0 to 1.0 Jaggedness/Noise frequency

  // Lens Flare / Adjustment Layer
  lensFlareEnabled: boolean; // New: Toggle geometric lens flare
  lensFlareIntensity: number; // New: 0.0 to 1.0
  lensFlareScale: number; // New: 0.5 to 3.0
  lensFlareHandleEnabled: boolean; // New: Toggle interactive positioning handle
  flareTipPos: { x: number, y: number } | null; // New: Normalized coordinates of the flare end-point

  // 16mm Print Emulation
  filmEnabled: boolean; // New: Master toggle for film effects
  filmDensity: number; // Overall Contrast + Saturation
  filmHalation: number; // Red edge bleed
  filmBloom: number; // Highlight diffusion
  filmGrain: number; // RGB Noise strength
  filmStock: string; // New: Color grading preset (e.g., 'Kodak 2383', 'Portra')
  
  autoClean: boolean; // New: Auto-clean brush between strokes
  
  // Pictorialism
  pictorialismEnabled: boolean; // New: Pictorialism effect toggle
  pictorialismNoise: number; // New: Control noise intensity
  pictorialismSoftness: number; // New: Control diffusion/softness

  // Riso Print
  risoEnabled: boolean; // New: Riso effect toggle
  risoGrainScale: number; // New: Controls texture grain size (0.2 to 2.0)
  risoColor1: string; // New: Shadow color (Ink)
  risoColor2: string; // New: Highlight color (Paper)

  // Chromatic Aberration
  chromaticAberrationEnabled: boolean; // New: Chromatic Aberration toggle
  chromaticAberrationIntensity: number; // New: Shift intensity (0.0 to 1.0)
}

export interface Point {
  x: number;
  y: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
}
