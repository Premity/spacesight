import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function AggregateCharts({ results }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!isMounted) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-64 bg-space-surface/40 animate-pulse rounded-2xl border border-white/5"></div>
        <div className="h-64 bg-space-surface/40 animate-pulse rounded-2xl border border-white/5"></div>
        <div className="h-64 bg-space-surface/40 animate-pulse rounded-2xl border border-white/5"></div>
      </div>
    );
  }

  const allPlanets = results.stars.flatMap(s => s.planets.map(p => ({ ...p, starName: s.name })));
  
  const confCounts = allPlanets.reduce((acc, p) => {
    acc[p.confidence] = (acc[p.confidence] || 0) + 1;
    return acc;
  }, {});
  const confData = [
    {name: 'High', count: confCounts['High']||0}, 
    {name: 'Medium', count: confCounts['Medium']||0}, 
    {name: 'Low', count: confCounts['Low']||0}
  ];

  const starCounts = results.stars.map(s => ({ name: s.name, count: s.planets.length })).sort((a,b) => b.count - a.count);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      <ChartCard title="Estimated Radius (Earths)">
         <ResponsiveContainer width="100%" height="100%">
           <BarChart data={allPlanets} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
             <XAxis dataKey="id" tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <YAxis tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <Tooltip 
                contentStyle={{backgroundColor: '#0d0d1a', borderColor: '#7c3aed', color: '#fff', borderRadius: '8px'}} 
                itemStyle={{color: '#e2e8f0'}}
                cursor={{fill: '#ffffff05'}}
             />
             <Bar dataKey="estimatedRadius" name="Radius (Earths)" fill="#7c3aed" radius={[4,4,0,0]} />
           </BarChart>
         </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Confidence Distribution">
         <ResponsiveContainer width="100%" height="100%">
           <BarChart data={confData} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
             <XAxis dataKey="name" tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <YAxis allowDecimals={false} tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <Tooltip 
                contentStyle={{backgroundColor: '#0d0d1a', borderColor: '#06b6d4', color: '#fff', borderRadius: '8px'}} 
                itemStyle={{color: '#e2e8f0'}}
                cursor={{fill: '#ffffff05'}}
             />
             <Bar dataKey="count" name="Detections" fill="#06b6d4" radius={[4,4,0,0]} />
           </BarChart>
         </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Planets Per Target">
         <ResponsiveContainer width="100%" height="100%">
           <BarChart data={starCounts} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
             <XAxis dataKey="name" tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <YAxis allowDecimals={false} tick={{fill: '#ffffff50', fontSize: 10}} tickLine={false} axisLine={false} />
             <Tooltip 
                contentStyle={{backgroundColor: '#0d0d1a', borderColor: '#a855f7', color: '#fff', borderRadius: '8px'}} 
                itemStyle={{color: '#e2e8f0'}}
                cursor={{fill: '#ffffff05'}}
             />
             <Bar dataKey="count" name="Planets" fill="#a855f7" radius={[4,4,0,0]}>
                {starCounts.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.count > 0 ? '#a855f7' : '#ffffff20'} />
                ))}
             </Bar>
           </BarChart>
         </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-space-surface/40 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 flex flex-col h-[320px] shadow-lg hover:border-space-purple/20 hover:shadow-[0_0_30px_rgba(124,58,237,0.1)] transition-all duration-300">
      <h3 className="text-space-text/70 text-[0.65rem] font-bold uppercase tracking-widest mb-4 text-center">{title}</h3>
      <div className="flex-1 w-full h-full relative">
        {children}
      </div>
    </div>
  );
}
