
import React, { useState } from 'react';
import { BrushSettings } from '../types';
import { 
    Upload, X, Settings2, Film, CloudSun, Waves, Aperture, Image, CloudFog, Printer, Zap, Thermometer, Droplet, FileText, GripVertical, ChevronLeft
} from 'lucide-react';

interface ControlsProps {
  settings: BrushSettings;
  onChange: (s: BrushSettings) => void;
  washTemp: number;
  onWashChange: (val: number) => void;
  washIntensity: number;
  onWashIntensityChange: (val: number) => void;
  onUploadTexture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
  onExport: (is4k: boolean) => void;
  hideMobileToolbar?: boolean;
}

const FILM_STOCKS = [
    'Standard', 'Kodak 2383', 'Kodak Portra 400', 'Kodak Ektar 100', 'Cinestill 800T', 'Fuji Velvia 50', 'Ilford HP5 Plus'
];

type ControlSection = 'atmosphere' | 'water' | 'lens' | 'base' | 'film' | 'fx' | 'export';

export const Controls: React.FC<ControlsProps> = ({ 
    settings, onChange, washTemp, onWashChange, washIntensity, onWashIntensityChange,
    onUploadTexture, isOpen, onClose, isMobile, onExport
}) => {
  const [activeSection, setActiveSection] = useState<ControlSection | null>(null);
  
  const toggleSection = (section: ControlSection) => {
      setActiveSection(activeSection === section ? null : section);
  };

  const handleChange = (key: keyof BrushSettings, value: any) => {
    if (key === 'skyEnabled' && value === true) onChange({ ...settings, skyEnabled: true, useTexture: false });
    else if (key === 'useTexture' && value === true) onChange({ ...settings, useTexture: true, skyEnabled: false });
    else onChange({ ...settings, [key]: value });
  };

  const renderSlider = (label: string, value: number, min: number, max: number, step: number, onChangeVal: (v: number) => void, colorClass: string = "accent-zinc-400") => (
      <div className="space-y-1">
          <div className="flex justify-between text-[9px] text-zinc-300 font-bold uppercase tracking-wider">
              <span>{label}</span>
              <span className="text-zinc-400 font-mono">{Math.abs(value) < 1 && value !== 0 ? value.toFixed(2) : Math.round(value)}</span>
          </div>
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChangeVal(Number(e.target.value))} className={`w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer ${colorClass}`} />
      </div>
  );

  const DockButton = ({ icon: Icon, active, onClick, color = "text-zinc-400", label }: any) => (
      <button 
        onClick={onClick}
        title={label}
        className={`p-2.5 rounded-full transition-all duration-200 group relative ${active ? 'bg-white/10 text-zinc-100 shadow-sm shadow-white/5 ring-1 ring-white/10' : 'bg-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-200'}`}
      >
          <Icon className={`w-4 h-4 ${active ? 'text-zinc-100' : color}`} strokeWidth={active ? 2.5 : 1.5} />
      </button>
  );

  const renderSectionContent = () => {
      switch (activeSection) {
          case 'export': return (
            <div className="grid grid-cols-1 gap-2">
                <button onClick={() => onExport(false)} className="h-8 bg-zinc-800/40 hover:bg-zinc-800/60 border border-white/10 hover:border-white/20 rounded-lg flex items-center justify-center gap-2 transition-all text-zinc-300">
                    <span className="text-[9px] font-bold uppercase tracking-widest">Standard PNG</span>
                </button>
                <button onClick={() => onExport(true)} className="h-8 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 hover:border-indigo-500/50 rounded-lg flex items-center justify-center gap-2 transition-all text-indigo-300">
                    <span className="text-[9px] font-bold uppercase tracking-widest">4K High-Res</span>
                </button>
            </div>
          );
          case 'atmosphere': return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Enable Sky</span>
                    <button onClick={() => handleChange('skyEnabled', !settings.skyEnabled)} className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${settings.skyEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}>
                        <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${settings.skyEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                    </button>
                </div>
                <div className={`space-y-3 transition-opacity ${!settings.skyEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                    {renderSlider("Time", settings.sunElevation, -0.3, 1.0, 0.01, (v) => handleChange('sunElevation', v), "accent-orange-500")}
                    {renderSlider("Azimuth", settings.sunAzimuth, 0, 1, 0.01, (v) => handleChange('sunAzimuth', v), "accent-orange-500")}
                    {renderSlider("Density", settings.atmosphereDensity, 0, 1, 0.01, (v) => handleChange('atmosphereDensity', v))}
                    {renderSlider("Haze", settings.gradientHumidity, 0, 1, 0.01, (v) => handleChange('gradientHumidity', v))}
                    {renderSlider("Glow", settings.sunDiffusion, 0, 1, 0.01, (v) => handleChange('sunDiffusion', v))}
                    {renderSlider("Scale", settings.skyScale, 0.5, 3.0, 0.1, (v) => handleChange('skyScale', v))}
                </div>
            </div>
          );
          case 'water': return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Enable Water</span>
                    <button onClick={() => handleChange('waterEnabled', !settings.waterEnabled)} className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${settings.waterEnabled ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                        <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${settings.waterEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                    </button>
                </div>
                <div className={`space-y-3 transition-opacity ${!settings.waterEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Reflections</span>
                        <button onClick={() => handleChange('waterLayerReflections', !settings.waterLayerReflections)} className={`w-6 h-3 rounded-full relative ${settings.waterLayerReflections ? 'bg-cyan-500/50' : 'bg-zinc-800'}`}>
                            <div className={`w-2 h-2 bg-white rounded-full absolute top-0.5 transition-all ${settings.waterLayerReflections ? 'left-[14px]' : 'left-0.5'}`} />
                        </button>
                    </div>
                    {renderSlider("Opacity", settings.waterOpacity, 0, 1, 0.01, (v) => handleChange('waterOpacity', v), "accent-cyan-500")}
                    {renderSlider("Turbulence X", settings.waterTurbulenceX, 0, 1, 0.01, (v) => handleChange('waterTurbulenceX', v), "accent-cyan-500")}
                    {renderSlider("Turbulence Y", settings.waterTurbulenceY, 0, 1, 0.01, (v) => handleChange('waterTurbulenceY', v), "accent-cyan-500")}
                </div>
            </div>
          );
          case 'lens': return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Enable Flare</span>
                    <button onClick={() => handleChange('lensFlareEnabled', !settings.lensFlareEnabled)} className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${settings.lensFlareEnabled ? 'bg-pink-500' : 'bg-zinc-700'}`}>
                        <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${settings.lensFlareEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                    </button>
                </div>
                <div className={`space-y-3 transition-opacity ${!settings.lensFlareEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                    {renderSlider("Intensity", settings.lensFlareIntensity, 0, 1, 0.01, (v) => handleChange('lensFlareIntensity', v), "accent-pink-500")}
                    {renderSlider("Scale", settings.lensFlareScale, 0.1, 3.0, 0.1, (v) => handleChange('lensFlareScale', v), "accent-pink-500")}
                    <div className="flex justify-between items-center bg-zinc-800/30 p-2 rounded-lg">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Manual Handle</span>
                        <button onClick={() => handleChange('lensFlareHandleEnabled', !settings.lensFlareHandleEnabled)} className={`w-6 h-3 rounded-full relative ${settings.lensFlareHandleEnabled ? 'bg-pink-500/50' : 'bg-zinc-800'}`}>
                            <div className={`w-2 h-2 bg-white rounded-full absolute top-0.5 transition-all ${settings.lensFlareHandleEnabled ? 'left-[14px]' : 'left-0.5'}`} />
                        </button>
                    </div>
                </div>
            </div>
          );
          case 'base': return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Paper Texture</span>
                    <div className="flex gap-2">
                        <button onClick={() => handleChange('useTexture', !settings.useTexture)} className={`p-1.5 rounded-lg border ${settings.useTexture ? 'bg-amber-900/20 border-amber-500/20 text-amber-500' : 'border-transparent text-zinc-600'}`}>
                            <FileText className="w-3.5 h-3.5" />
                        </button>
                        <label className="cursor-pointer p-1.5 text-zinc-600 hover:text-zinc-300 rounded-lg hover:bg-white/5">
                            <Upload className="w-3.5 h-3.5" />
                            <input type="file" className="hidden" onChange={onUploadTexture} accept="image/*" />
                        </label>
                    </div>
                </div>
                <div className="h-px bg-white/10 w-full" />
                {renderSlider("Wash Temp", washTemp, 0, 1, 0.01, (v) => onWashChange(v))}
                {renderSlider("Wash Strength", washIntensity, 0, 1, 0.01, (v) => onWashIntensityChange(v))}
            </div>
          );
          case 'film': return (
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Enable</span>
                    <button onClick={() => handleChange('filmEnabled', !settings.filmEnabled)} className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${settings.filmEnabled ? 'bg-red-500' : 'bg-zinc-700'}`}>
                        <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${settings.filmEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                    </button>
                </div>
                <div className={`space-y-3 transition-opacity ${!settings.filmEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                    <div className="bg-zinc-800/40 p-1.5 rounded-lg border border-white/5">
                        <select value={settings.filmStock} onChange={(e) => handleChange('filmStock', e.target.value)} className="w-full bg-transparent text-[9px] font-bold uppercase text-zinc-300 outline-none">
                            {FILM_STOCKS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    {renderSlider("Density", settings.filmDensity, 0, 1, 0.01, (v) => handleChange('filmDensity', v), "accent-red-500")}
                    {renderSlider("Halation", settings.filmHalation, 0, 1, 0.01, (v) => handleChange('filmHalation', v))}
                    {renderSlider("Bloom", settings.filmBloom, 0, 1, 0.01, (v) => handleChange('filmBloom', v))}
                    {renderSlider("Grain", settings.filmGrain, 0, 1, 0.01, (v) => handleChange('filmGrain', v))}
                </div>
            </div>
          );
          case 'fx': return (
            <div className="space-y-4">
                {/* Pictorialism */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CloudFog className="w-3 h-3 text-yellow-200" />
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Soft Focus</span>
                        </div>
                        <button onClick={() => handleChange('pictorialismEnabled', !settings.pictorialismEnabled)} className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${settings.pictorialismEnabled ? 'bg-yellow-200' : 'bg-zinc-700'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full bg-zinc-900 shadow-sm transition-transform duration-300 ${settings.pictorialismEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    {settings.pictorialismEnabled && (
                        <div className="space-y-2 pl-2 border-l border-white/5">
                            {renderSlider("Diffusion", settings.pictorialismSoftness, 0, 1, 0.01, (v) => handleChange('pictorialismSoftness', v), "accent-yellow-200")}
                            {renderSlider("Grain", settings.pictorialismNoise, 0, 1, 0.01, (v) => handleChange('pictorialismNoise', v), "accent-yellow-200")}
                        </div>
                    )}
                </div>

                <div className="h-px bg-white/10 w-full" />

                {/* Riso */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Printer className="w-3 h-3 text-emerald-400" />
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Riso Print</span>
                        </div>
                        <button onClick={() => handleChange('risoEnabled', !settings.risoEnabled)} className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${settings.risoEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${settings.risoEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    {settings.risoEnabled && (
                        <div className="space-y-2 pl-2 border-l border-white/5">
                            {renderSlider("Dot Scale", settings.risoGrainScale, 0.2, 2.0, 0.1, (v) => handleChange('risoGrainScale', v), "accent-emerald-400")}
                            <div className="flex gap-2">
                                <input type="color" value={settings.risoColor1} onChange={(e) => handleChange('risoColor1', e.target.value)} className="w-full h-5 rounded cursor-pointer bg-transparent" />
                                <input type="color" value={settings.risoColor2} onChange={(e) => handleChange('risoColor2', e.target.value)} className="w-full h-5 rounded cursor-pointer bg-transparent" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-px bg-white/10 w-full" />

                {/* Aberration */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Zap className="w-3 h-3 text-fuchsia-400" />
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Aberration</span>
                        </div>
                        <button onClick={() => handleChange('chromaticAberrationEnabled', !settings.chromaticAberrationEnabled)} className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${settings.chromaticAberrationEnabled ? 'bg-fuchsia-500' : 'bg-zinc-700'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${settings.chromaticAberrationEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    {settings.chromaticAberrationEnabled && (
                        <div className="pl-2 border-l border-white/5">
                            {renderSlider("Shift", settings.chromaticAberrationIntensity, 0, 1, 0.01, (v) => handleChange('chromaticAberrationIntensity', v), "accent-fuchsia-500")}
                        </div>
                    )}
                </div>
            </div>
          );
          default: return null;
      }
  };

  if (!isOpen && !isMobile) return null;

  const containerStyle = activeSection 
    ? { width: '200px', borderRadius: '20px' } 
    : { width: '56px', borderRadius: '9999px' };

  return (
    <div className={`fixed z-40 right-4 top-1/2 -translate-y-1/2 transition-transform duration-300 ${isMobile ? (isOpen ? 'translate-x-0' : 'translate-x-[200%]') : ''}`}>
        
        <div 
            className="pointer-events-auto bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl ring-1 ring-black/20 transition-all duration-300 ease-spring overflow-hidden flex flex-col"
            style={{ ...containerStyle, maxHeight: '75vh' }}
        >
            {activeSection ? (
                // --- EXPANDED VIEW ---
                <div className="flex flex-col h-full w-full animate-in fade-in slide-in-from-right-4 duration-200">
                    <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/5 shrink-0">
                        <button onClick={() => setActiveSection(null)} className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors">
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">{activeSection}</span>
                        </button>
                        <button onClick={() => setActiveSection(null)} className="text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                        {renderSectionContent()}
                    </div>
                </div>
            ) : (
                // --- COLLAPSED VIEW ---
                <div className="flex flex-col gap-3 items-center py-4 px-1.5 w-full animate-in fade-in slide-in-from-left-4 duration-200">
                    {/* Handle */}
                    <div className="text-zinc-500 cursor-grab active:cursor-grabbing"><GripVertical className="w-3.5 h-3.5" /></div>

                    {/* Wash Temp Slider */}
                    <div className="flex flex-col gap-1 w-full items-center group relative" title="Wash Temp">
                        <div className="h-[50px] w-6 flex items-center justify-center relative">
                            <input 
                                type="range" min="0" max="1" step="0.01"
                                value={washTemp} 
                                onChange={(e) => onWashChange(Number(e.target.value))}
                                className="appearance-none bg-zinc-700/60 rounded-lg cursor-pointer accent-orange-400 absolute"
                                style={{ width: '50px', height: '3px', transform: 'rotate(-90deg)', transformOrigin: 'center' }} 
                            />
                        </div>
                    </div>

                    {/* Wash Strength Slider */}
                    <div className="flex flex-col gap-1 w-full items-center group relative" title="Wash Strength">
                        <div className="h-[50px] w-6 flex items-center justify-center relative">
                            <input 
                                type="range" min="0" max="1" step="0.01"
                                value={washIntensity} 
                                onChange={(e) => onWashIntensityChange(Number(e.target.value))}
                                className="appearance-none bg-zinc-700/60 rounded-lg cursor-pointer accent-cyan-400 absolute"
                                style={{ width: '50px', height: '3px', transform: 'rotate(-90deg)', transformOrigin: 'center' }} 
                            />
                        </div>
                    </div>

                    <div className="w-6 h-px bg-white/10 shrink-0" />

                    <div className="flex flex-col gap-1.5 w-full items-center">
                        <DockButton icon={Image} active={activeSection === 'export'} onClick={() => toggleSection('export')} label="Export" />
                        <DockButton icon={CloudSun} active={activeSection === 'atmosphere'} onClick={() => toggleSection('atmosphere')} color="text-orange-400" label="Atmosphere" />
                        <DockButton icon={Waves} active={activeSection === 'water'} onClick={() => toggleSection('water')} color="text-cyan-400" label="Water" />
                        <DockButton icon={Aperture} active={activeSection === 'lens'} onClick={() => toggleSection('lens')} color="text-pink-400" label="Lens" />
                        <DockButton icon={Settings2} active={activeSection === 'base'} onClick={() => toggleSection('base')} label="Canvas" />
                        <DockButton icon={Film} active={activeSection === 'film'} onClick={() => toggleSection('film')} color="text-red-400" label="Film" />
                        <DockButton icon={Zap} active={activeSection === 'fx'} onClick={() => toggleSection('fx')} color="text-purple-400" label="FX" />
                        {isMobile && (
                            <>
                                <div className="w-6 h-px bg-white/10 shrink-0" />
                                <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
