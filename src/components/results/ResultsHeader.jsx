import React from 'react';
import ExportButton from './ExportButton';

export default function ResultsHeader({ results }) {
  return (
    <div className="w-full mb-16">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
        <div>
          <h1 className="font-orbitron font-bold text-4xl md:text-5xl text-white mb-3 drop-shadow-[0_0_20px_rgba(124,58,237,0.5)]">
            Analysis Complete
          </h1>
          <p className="text-space-teal font-mono tracking-widest text-lg uppercase bg-space-teal/10 inline-block px-4 py-1 rounded-full border border-space-teal/20">
            {results.type === 'multi' ? `${results.totalStars} Targets Surveyed` : 'Single Target Analysis'}
          </p>
        </div>
        <ExportButton results={results} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Planets Detected" value={results.totalPlanets} />
        <StatCard label="Observation Span" value={`${results.totalObservationSpan} days`} />
        <StatCard label="Data Points Processed" value={results.totalDataPoints.toLocaleString()} />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-space-surface/60 backdrop-blur-md border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:-translate-y-1 duration-300">
      <span className="text-space-text/50 text-xs font-bold uppercase tracking-widest mb-3">{label}</span>
      <span className="font-orbitron text-2xl font-bold text-white tracking-wider">{value}</span>
    </div>
  );
}