import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function StarCharts({ star }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full animate-fade-in">
      <DetailChartCard title="Light Curve Flux Timeline">
         <ResponsiveContainer width="100%" height="100%">
           <LineChart data={star.lightCurve.slice(0, 200)} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
             <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
             <YAxis domain={['auto', 'auto']} tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <Tooltip 
               contentStyle={{backgroundColor: '#0d0d1a', border: '1px solid #7c3aed', color: '#fff', borderRadius: '12px', boxShadow: '0 0 20px rgba(124,58,237,0.3)'}}
               labelFormatter={() => 'Observation Timestamp'}
               formatter={(val) => [val.toFixed(5), 'Normalized Flux']}
               cursor={{stroke: '#ffffff15', strokeWidth: 2}}
             />
             <Line type="monotone" dataKey="flux" stroke="#7c3aed" dot={false} strokeWidth={2} activeDot={{r: 6, fill: '#7c3aed', stroke: '#0d0d1a', strokeWidth: 2}} />
           </LineChart>
         </ResponsiveContainer>
      </DetailChartCard>

      <DetailChartCard title="BLS Periodogram Power Spectrum">
         <ResponsiveContainer width="100%" height="100%">
           <AreaChart data={star.blsPeriodogram} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
             <XAxis dataKey="period" tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
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
      
      <DetailChartCard title="Orbital Diagram Model">
         <div className="w-full h-full flex flex-col justify-center items-center relative overflow-hidden">
           <div className="w-[80%] h-[80%] rounded-full border border-space-purple/20 border-dashed absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[spin_60s_linear_infinite]"></div>
           <div className="w-[50%] h-[50%] rounded-full border border-space-teal/20 border-dashed absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[spin_40s_linear_infinite_reverse]"></div>
           
           <div className="w-16 h-16 rounded-full bg-yellow-100 shadow-[0_0_50px_rgba(254,240,138,0.8)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center border-4 border-[#0d0d1a] z-0">
              <span className="text-yellow-600/50 text-[10px] font-bold">STAR</span>
           </div>
           
           {star.planets.length > 0 ? star.planets.map((p, i) => (
             <div key={p.id} className="w-5 h-5 rounded-full bg-space-teal absolute shadow-[0_0_15px_rgba(6,182,212,0.8)] border-2 border-[#0d0d1a] group hover:scale-150 hover:bg-white transition-all cursor-pointer z-10" 
                  style={{ top: '50%', left: `calc(50% + ${80 + (i*45)}px)`, transform: 'translate(-50%, -50%)' }}
             >
                <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-space-surface/90 backdrop-blur-md border border-space-teal/30 px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity min-w-max pointer-events-none z-20 shadow-xl">
                   <p className="text-white text-xs font-bold whitespace-nowrap mb-1">{p.id}</p>
                   <p className="text-space-text/70 text-[10px] font-mono whitespace-nowrap">{p.orbitalPeriod}d orbit</p>
                </div>
             </div>
           )) : (
             <span className="text-space-text/40 font-mono relative mt-48 text-sm uppercase tracking-widest bg-space-surface/80 px-4 py-2 rounded-full border border-white/5">Stellar Target Only</span>
           )}
         </div>
      </DetailChartCard>
      
      <DetailChartCard title="Planet Size Reference vs Local System">
         <div className="w-full h-full flex items-end justify-center pb-8 gap-8 px-6 overflow-x-auto custom-scrollbar">
            <div className="flex flex-col items-center gap-3 shrink-0">
               <div className="w-10 h-10 rounded-full bg-blue-400/80 shadow-[inset_-4px_-4px_10px_rgba(0,0,0,0.5)]"></div>
               <span className="text-[10px] text-space-text/50 font-mono tracking-widest uppercase">Earth (1 R⊕)</span>
            </div>
            
            {star.planets.map(p => {
               const size = Math.max(16, Math.min(120, p.estimatedRadius * 10));
               return (
                 <div key={p.id} className="flex flex-col items-center gap-3 shrink-0 group">
                   <div style={{ width: size, height: size }} className="rounded-full bg-gradient-to-br from-space-purple to-space-violet shadow-[0_0_20px_rgba(124,58,237,0.4),inset_-5px_-5px_15px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform cursor-pointer"></div>
                   <span className="text-xs text-white uppercase tracking-widest font-bold group-hover:text-space-purple transition-colors">{p.estimatedRadius} R⊕</span>
                 </div>
               );
            })}

            <div className="flex flex-col items-center gap-3 shrink-0 ml-4 border-l border-white/10 pl-12">
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

function DetailChartCard({ title, children }) {
  return (
    <div className="bg-space-surface/30 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 md:p-8 flex flex-col h-[400px] shadow-lg hover:border-space-purple/30 hover:shadow-[0_0_30px_rgba(124,58,237,0.15)] transition-all duration-500">
      <h3 className="text-space-text/70 text-[0.65rem] font-bold uppercase tracking-widest mb-6 flex-shrink-0 border-b border-white/5 pb-4 text-center md:text-left">{title}</h3>
      <div className="flex-1 w-full h-full relative">
        {children}
      </div>
    </div>
  );
}
