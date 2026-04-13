import React, { useState, useEffect } from 'react';
import PlanetCard from './PlanetCard';
import StarCharts from './StarCharts';

export default function StarDetailPanel({ star }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(false);
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
  }, [star?.name]);

  if (!star) return null;

  return (
    <div className="flex flex-col gap-10 w-full animate-fade-in relative z-10 pt-4 pb-12">
      {star.planets.length === 0 ? (
        <div className="w-full bg-yellow-500/5 border border-yellow-500/30 rounded-3xl p-10 md:p-14 text-center shadow-[0_0_30px_rgba(234,179,8,0.1)] backdrop-blur-md flex flex-col items-center">
           <svg className="w-16 h-16 text-yellow-500/80 mb-6 drop-shadow-md" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
           </svg>
           <h3 className="text-yellow-400 font-orbitron font-bold text-2xl md:text-3xl mb-4 drop-shadow-sm">No Planetary Candidates Detected</h3>
           <p className="text-yellow-400/80 text-lg md:text-xl font-light max-w-3xl mx-auto leading-relaxed">
             We compute with <span className="font-bold text-yellow-400">{star.noPlanetConfidence}% confidence</span> that no major transits identifying exoplanetary bodies exist within the observation window for target <span className="font-mono bg-yellow-500/10 px-3 py-1 rounded inline-block text-yellow-300 ml-1 border border-yellow-500/20">{star.name}</span>.
           </p>
        </div>
      ) : (
        <div className="flex justify-start gap-8 overflow-x-auto pb-6 custom-scrollbar snap-x">
           {star.planets.map(p => (
             <div key={p.id} className="snap-start min-w-[320px] max-w-sm flex-shrink-0">
                <PlanetCard planet={p} />
             </div>
           ))}
        </div>
      )}

      <div className="mt-4 border-t border-white/10 pt-10">
         <h3 className="font-orbitron font-bold text-xl text-white mb-8 text-center md:text-left drop-shadow-md">Target Physical Analysis</h3>
         {isMounted ? (
            <StarCharts star={star} />
         ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full">
               <div className="h-[400px] bg-space-surface/40 animate-pulse rounded-[2rem] border border-white/5"></div>
               <div className="h-[400px] bg-space-surface/40 animate-pulse rounded-[2rem] border border-white/5"></div>
               <div className="h-[400px] bg-space-surface/40 animate-pulse rounded-[2rem] border border-white/5"></div>
               <div className="h-[400px] bg-space-surface/40 animate-pulse rounded-[2rem] border border-white/5"></div>
            </div>
         )}
      </div>
    </div>
  );
}
