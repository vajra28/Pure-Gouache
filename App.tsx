
import React, { useState } from 'react';
import PureGouache from './PureGouache';
import Alchemy from './Alchemy';
import { Brush, Beaker } from 'lucide-react';

type AppMode = 'gouache' | 'alchemy';

const App: React.FC = () => {
  const [activeApp, setActiveApp] = useState<AppMode>('gouache');

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950 font-sans selection:bg-indigo-500/30">
      
      {/* --- App Container --- */}
      <div className="w-full h-full">
          {activeApp === 'gouache' ? <PureGouache /> : <Alchemy />}
      </div>

      {/* --- Minimal Icon Switcher (Moved to Top Left) --- */}
      <div className="fixed top-6 left-6 z-[100] group pointer-events-none">
          <div className="pointer-events-auto bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-xl flex items-center gap-1 transition-all duration-300 hover:border-white/20 hover:scale-105">
             
             <button 
                onClick={() => setActiveApp('gouache')}
                className={`p-2 rounded-full transition-all duration-200 ${activeApp === 'gouache' ? 'bg-zinc-100 text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`}
                title="Gouache Studio"
             >
                <Brush className="w-4 h-4" strokeWidth={2.5} />
             </button>

             <button 
                onClick={() => setActiveApp('alchemy')}
                className={`p-2 rounded-full transition-all duration-200 ${activeApp === 'alchemy' ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]' : 'text-zinc-500 hover:text-indigo-300 hover:bg-indigo-500/10'}`}
                title="Alchemy Lab"
             >
                <Beaker className="w-4 h-4" strokeWidth={2.5} />
             </button>

          </div>
      </div>

    </div>
  );
};

export default App;
