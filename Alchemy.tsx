
import React, { useState, useEffect } from 'react';
import { Beaker, Flame, Sparkles, Zap, Atom } from 'lucide-react';

const Alchemy: React.FC = () => {
    const [bubbles, setBubbles] = useState<{id: number, x: number, y: number, size: number, speed: number}[]>([]);
    
    useEffect(() => {
        const interval = setInterval(() => {
            setBubbles(prev => {
                const newBubbles = prev
                    .map(b => ({ ...b, y: b.y - b.speed }))
                    .filter(b => b.y > -20);
                
                if (Math.random() > 0.7) {
                    newBubbles.push({
                        id: Date.now(),
                        x: Math.random() * 100,
                        y: 110,
                        size: 4 + Math.random() * 12,
                        speed: 0.5 + Math.random() * 1.5
                    });
                }
                return newBubbles;
            });
        }, 50);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full h-full bg-zinc-950 text-indigo-100 font-sans flex flex-col items-center justify-center relative overflow-hidden select-none">
            {/* Ambient Background */}
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_#312e81_0%,_transparent_70%)]" />

            <div className="relative z-10 flex flex-col items-center gap-10">
                <div className="relative group cursor-pointer">
                    <div className="absolute inset-0 bg-indigo-500 blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                    
                    {/* Cauldron / Main Icon */}
                    <div className="relative w-48 h-48 rounded-full border border-white/10 flex items-center justify-center bg-zinc-900/50 backdrop-blur-md shadow-2xl shadow-indigo-500/20">
                        <Beaker className="w-20 h-20 text-indigo-300 drop-shadow-[0_0_15px_rgba(165,180,252,0.5)]" strokeWidth={1.5} />
                        
                        {/* Bubbles */}
                        <div className="absolute inset-0 overflow-hidden rounded-full mask-image-b">
                            {bubbles.map(b => (
                                <div 
                                    key={b.id}
                                    className="absolute rounded-full bg-indigo-400/30 blur-[1px] border border-white/10"
                                    style={{
                                        left: `${b.x}%`,
                                        top: `${b.y}%`,
                                        width: b.size,
                                        height: b.size
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="text-center space-y-3">
                    <h1 className="text-5xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-white drop-shadow-lg">ALCHEMY</h1>
                    <div className="flex items-center justify-center gap-3">
                        <div className="h-px w-8 bg-white/10" />
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.3em]">Lab v0.1 • Experimental</p>
                        <div className="h-px w-8 bg-white/10" />
                    </div>
                </div>

                {/* Dummy Grid */}
                <div className="grid grid-cols-4 gap-4 mt-8">
                    {[Flame, Sparkles, Zap, Atom].map((Icon, i) => (
                        <button key={i} className="p-5 rounded-2xl bg-zinc-900/40 border border-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all group backdrop-blur-sm">
                            <Icon className="w-6 h-6 text-zinc-500 group-hover:text-indigo-300 group-hover:scale-110 transition-transform duration-300" strokeWidth={1.5} />
                        </button>
                    ))}
                </div>
            </div>

            <div className="absolute bottom-10 text-[10px] font-bold uppercase tracking-widest text-zinc-700">
                Awaiting Ingredients...
            </div>
        </div>
    );
};

export default Alchemy;
