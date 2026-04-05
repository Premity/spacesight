import React from 'react';

export default function PlanetCard({ planet }) {
  const getConfidenceColor = (conf) => {
    switch (conf.toLowerCase()) {
      case 'high': return 'text-green-400 bg-green-400/10 border-green-400/30 shadow-[0_0_15px_rgba(74,222,128,0.2)]';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30 shadow-[0_0_15px_rgba(250,204,21,0.2)]';
      case 'low': return 'text-red-400 bg-red-400/10 border-red-400/30 shadow-[0_0_15px_rgba(248,113,113,0.2)]';
      default: return 'text-white bg-white/10 border-white/30';
    }
  };

  return (
    <div className="group bg-space-surface/60 backdrop-blur-md border border-space-purple/30 rounded-3xl p-10 shadow-[0_0_20px_rgba(124,58,237,0.15)] hover:shadow-[0_0_40px_rgba(124,58,237,0.3)] hover:-translate-y-1 transition-all duration-500 relative overflow-hidden flex-1 min-w-[300px]">
      
      {/* Animated orbit ring decorative element */}
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full border border-space-purple/30 border-dashed animate-[spin_12s_linear_infinite] pointer-events-none">
        <div className="absolute top-1/2 left-0 w-3.5 h-3.5 bg-space-teal rounded-full shadow-[0_0_15px_rgba(6,182,212,0.9)] -translate-x-1.5 -translate-y-1.5"></div>
      </div>
      
      <div className="flex justify-between items-start mb-10 relative z-10">
        <div>
          <span className="text-space-text/50 text-xs font-bold uppercase tracking-widest block mb-2">Planet ID</span>
          <h3 className="font-orbitron text-3xl font-bold text-white drop-shadow-md">{planet.id}</h3>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border ${getConfidenceColor(planet.confidence)}`}>
          {planet.confidence}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-y-8 gap-x-6 relative z-10">
        <div>
          <span className="text-space-text/40 text-[0.65rem] font-bold uppercase tracking-widest block mb-2">Orbital Period</span>
          <span className="font-mono text-xl text-white">{planet.orbitalPeriod || planet.orbitalPeriodDays} <span className="text-xs text-space-text/50 font-sans tracking-wide">days</span></span>
        </div>
        <div>
          <span className="text-space-text/40 text-[0.65rem] font-bold uppercase tracking-widest block mb-2">Transit Depth</span>
          <span className="font-mono text-xl text-white">{planet.transitDepth || planet.transitDepthPercent}%</span>
        </div>
        <div className="col-span-2">
          <span className="text-space-text/40 text-[0.65rem] font-bold uppercase tracking-widest block mb-2">Estimated Radius</span>
          <span className="font-mono text-xl text-white">{planet.estimatedRadius || planet.estimatedRadiusEarths} <span className="text-xs text-space-text/50 font-sans tracking-wide">Earth Radii</span></span>
        </div>
      </div>
    </div>
  );
}
