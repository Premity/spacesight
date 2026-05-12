import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import InfoTooltip from '../ui/InfoTooltip';

export default function StarCharts({ star }) {
  const fluxValues = star.lightCurve.map(d => d.flux);
  const minFlux = Math.min(...fluxValues);
  const maxFlux = Math.max(...fluxValues);
  const fluxPadding = (maxFlux - minFlux) * 0.1;
  const fluxDomain = [
    Math.max(0, minFlux - fluxPadding),
    maxFlux + fluxPadding,
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full animate-fade-in">
      <DetailChartCard title="Detrended Normalized Flux Timeline" tooltip="The star's brightness over time after removing long-term trends. Dips below 1.0 indicate a planet passing in front of the star (a transit). The depth of the dip relates to planet size.">
         <ResponsiveContainer width="100%" height="100%">
           <LineChart data={star.lightCurve} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
             <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
             <YAxis domain={fluxDomain} tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} allowDataOverflow />
             <Tooltip
               contentStyle={{backgroundColor: '#0d0d1a', border: '1px solid #7c3aed', color: '#fff', borderRadius: '12px', boxShadow: '0 0 20px rgba(124,58,237,0.3)'}}
               labelFormatter={() => 'Observation Timestamp'}
               formatter={(val) => [val.toFixed(6), 'Normalized Flux']}
               cursor={{stroke: '#ffffff15', strokeWidth: 2}}
             />
             <Line type="linear" dataKey="flux" stroke="#7c3aed" dot={false} strokeWidth={0.8} isAnimationActive={false} activeDot={{r: 6, fill: '#7c3aed', stroke: '#0d0d1a', strokeWidth: 2}} />
           </LineChart>
         </ResponsiveContainer>
      </DetailChartCard>

      <DetailChartCard title="BLS Periodogram Power Spectrum" tooltip="Box Least Squares (BLS) periodogram: tests thousands of candidate orbital periods and scores how well each one fits a transit pattern. Peaks indicate likely orbital periods — the tallest peak is what the pipeline selected as the best candidate.">
         <ResponsiveContainer width="100%" height="100%">
           <AreaChart data={star.blsPeriodogram} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
             <XAxis dataKey="period" tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} tickCount={8} />
             <YAxis tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <Tooltip 
               contentStyle={{backgroundColor: '#0d0d1a', border: '1px solid #06b6d4', color: '#fff', borderRadius: '12px', boxShadow: '0 0 20px rgba(6,182,212,0.3)'}}
               labelFormatter={(period) => `Period: ${period}d`}
               formatter={(val) => [val.toFixed(3), 'Power Score']}
               cursor={{stroke: '#ffffff15', strokeWidth: 2}}
             />
             <Area type="monotone" dataKey="power" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} strokeWidth={2} activeDot={{r: 6, fill: '#06b6d4', stroke: '#0d0d1a', strokeWidth: 2}} />
           </AreaChart>
         </ResponsiveContainer>
      </DetailChartCard>
      
      <DetailChartCard title="Orbital Diagram Model" tooltip="A schematic view of detected planets orbiting their host star. Orbit sizes are scaled relative to each other by orbital period — longer period = larger orbit. Hover over a planet dot for details.">
         <div className="w-full h-full flex flex-col justify-center items-center relative overflow-hidden">
           {/* Orbit ellipses scaled by orbital period (log scale so spread orbits stay distinguishable) */}
           {star.planets.length > 0 ? (() => {
             const periods = star.planets.map(p => Math.max(p.orbitalPeriod || 1, 0.5));
             const logMin = Math.log(Math.min(...periods));
             const logMax = Math.log(Math.max(...periods));
             const logRange = logMax - logMin || 1;
             const MAX_W = 92; const MIN_W = 35;
             const MAX_H = 55; const MIN_H = 22;
             return star.planets.map((p, i) => {
               const t = (Math.log(Math.max(p.orbitalPeriod || 1, 0.5)) - logMin) / logRange;
               const w = MIN_W + t * (MAX_W - MIN_W);
               const h = MIN_H + t * (MAX_H - MIN_H);
               return (
                 <div key={`orbit-${p.id}`}
                   className="border border-dashed absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                   style={{
                     width: `${w}%`, height: `${h}%`,
                     borderRadius: '50%',
                     borderColor: `rgba(6,182,212,${0.18 + i * 0.1})`,
                   }}
                 />
               );
             });
           })() : null}

           {/* Star */}
           <div className="w-14 h-14 rounded-full bg-yellow-100 shadow-[0_0_50px_rgba(254,240,138,0.8)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center border-4 border-[#0d0d1a] z-10">
              <span className="text-yellow-600/50 text-[10px] font-bold">STAR</span>
           </div>

           {/* Planets positioned along their elliptical orbits */}
           {star.planets.length > 0 ? (() => {
             const periods = star.planets.map(p => Math.max(p.orbitalPeriod || 1, 0.5));
             const logMin = Math.log(Math.min(...periods));
             const logMax = Math.log(Math.max(...periods));
             const logRange = logMax - logMin || 1;
             const MAX_W = 92; const MIN_W = 35;
             const MAX_H = 55; const MIN_H = 22;
             return star.planets.map((p, i) => {
               const t = (Math.log(Math.max(p.orbitalPeriod || 1, 0.5)) - logMin) / logRange;
               const w = MIN_W + t * (MAX_W - MIN_W);
               const h = MIN_H + t * (MAX_H - MIN_H);
               const angleDeg = (i * 137.5) % 360;
               const angleRad = (angleDeg * Math.PI) / 180;
               const offsetX = Math.cos(angleRad) * (w / 2);
               const offsetY = Math.sin(angleRad) * (h / 2);
               return <PlanetDot key={p.id} planet={p} offsetX={offsetX} offsetY={offsetY} />;
             });
           })() : (
             <span className="text-space-text/40 font-mono relative text-sm uppercase tracking-widest bg-space-surface/80 px-4 py-2 rounded-full border border-white/5 z-10">Stellar Target Only</span>
           )}
         </div>
      </DetailChartCard>
      
      <DetailChartCard title="Planet Size Reference vs Local System" tooltip="Visual comparison of detected planet radii against Earth and Jupiter for scale. Sizes are proportional — a planet at 11.2 R⊕ would be Jupiter-sized.">
         <div className="w-full h-full flex items-end justify-center pb-8 gap-10 px-6 overflow-x-auto" style={{scrollbarWidth: 'none'}}>
            {/* Earth reference — scaled to match Jupiter anchor (128px = 11.2 R⊕) */}
            <div className="flex flex-col items-center gap-3 shrink-0">
               <div style={{width: Math.round(128/11.2), height: Math.round(128/11.2)}} className="rounded-full bg-blue-400/80 shadow-[inset_-3px_-3px_8px_rgba(0,0,0,0.5)]"></div>
               <span className="text-[10px] text-space-text/50 font-mono tracking-widest uppercase">Earth (1 R⊕)</span>
            </div>

            {star.planets.map(p => {
               const PX_PER_EARTH = 128 / 11.2;
               const size = Math.max(8, p.estimatedRadius * PX_PER_EARTH);
               return <PlanetSizeDot key={p.id} planet={p} size={size} />;
            })}

            {/* Jupiter reference */}
            <div className="flex flex-col items-center gap-3 shrink-0 ml-4 border-l border-white/10 pl-10">
               <div className="w-32 h-32 rounded-full bg-orange-400/60 shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
                  <div className="absolute top-1/4 w-full h-2 bg-orange-300/40"></div>
                  <div className="absolute top-2/3 w-full h-4 bg-orange-500/40"></div>
               </div>
               <span className="text-[10px] text-space-text/50 font-mono tracking-widest uppercase">Jupiter (11.2 R⊕)</span>
            </div>
         </div>
      </DetailChartCard>
    </div>
  );
}

const TOOLTIP_W = 190;

function usePlanetTip() {
  const [tip, setTip] = useState(null);
  const compute = (e) => {
    const x = e.clientX, y = e.clientY;
    const fitsRight = x + 12 + TOOLTIP_W < window.innerWidth - 8;
    return { x: fitsRight ? x + 12 : x - 12 - TOOLTIP_W, y: y - 56 };
  };
  return {
    tip,
    handlers: {
      onMouseEnter: (e) => setTip(compute(e)),
      onMouseMove: (e) => setTip(compute(e)),
      onMouseLeave: () => setTip(null),
    },
  };
}

function PlanetTooltip({ planet, tip, borderColor = 'border-space-teal/50' }) {
  return tip ? createPortal(
    <div
      className={`fixed z-[9999] bg-[#0d0d1a] border ${borderColor} px-3 py-2 rounded-lg pointer-events-none shadow-xl`}
      style={{ left: tip.x, top: tip.y, width: TOOLTIP_W }}
    >
      <p className="text-white text-xs font-bold whitespace-nowrap mb-1">{planet.id}</p>
      <p className="text-space-text/70 text-[10px] font-mono whitespace-nowrap">{Number(planet.estimatedRadius).toFixed(2)} R⊕</p>
      <p className="text-space-text/70 text-[10px] font-mono whitespace-nowrap">{planet.orbitalPeriod}d orbit</p>
    </div>,
    document.body
  ) : null;
}

function PlanetDot({ planet, offsetX, offsetY }) {
  const { tip, handlers } = usePlanetTip();
  return (
    <>
      <div
        className="w-4 h-4 rounded-full bg-space-teal absolute shadow-[0_0_12px_rgba(6,182,212,0.9)] border-2 border-[#0d0d1a] hover:scale-150 hover:bg-white transition-all cursor-pointer z-20"
        style={{ top: `calc(50% + ${offsetY}%)`, left: `calc(50% + ${offsetX}%)`, transform: 'translate(-50%, -50%)' }}
        {...handlers}
      />
      <PlanetTooltip planet={planet} tip={tip} borderColor="border-space-teal/50" />
    </>
  );
}

function PlanetSizeDot({ planet, size }) {
  const { tip, handlers } = usePlanetTip();
  return (
    <div className="flex flex-col items-center gap-3 shrink-0">
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-gradient-to-br from-space-purple to-space-violet shadow-[0_0_20px_rgba(124,58,237,0.4),inset_-5px_-5px_15px_rgba(0,0,0,0.5)] hover:scale-110 transition-transform cursor-pointer"
        {...handlers}
      />
      <PlanetTooltip planet={planet} tip={tip} borderColor="border-space-purple/50" />
      <span className="text-xs text-white uppercase tracking-widest font-bold">{Number(planet.estimatedRadius).toFixed(2)} R⊕</span>
    </div>
  );
}

function DetailChartCard({ title, tooltip, children }) {
  return (
    <div className="bg-space-surface/30 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 md:p-8 flex flex-col h-[400px] shadow-lg hover:border-space-purple/30 hover:shadow-[0_0_30px_rgba(124,58,237,0.15)] transition-all duration-500">
      <h3 className="text-space-text/70 text-[0.65rem] font-bold uppercase tracking-widest mb-6 flex-shrink-0 border-b border-white/5 pb-4 text-center md:text-left">
        {tooltip ? <InfoTooltip text={tooltip}>{title}</InfoTooltip> : title}
      </h3>
      <div className="flex-1 w-full h-full relative">
        {children}
      </div>
    </div>
  );
}
