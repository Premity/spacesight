import React, { useState, useMemo } from 'react';

export default function PlanetCandidatesTable({ results, onRowClick }) {
  const [sortConfig, setSortConfig] = useState({ key: 'confidence', direction: 'desc' });

  const allCandidates = useMemo(() => {
    const list = [];
    results.stars.forEach(star => {
      star.planets.forEach(planet => {
        list.push({ ...planet, starName: star.name });
      });
    });
    return list;
  }, [results]);

  const sortedCandidates = useMemo(() => {
    let sortableItems = [...allCandidates];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'confidence') {
          const confMap = { High: 3, Medium: 2, Low: 1 };
          aValue = confMap[aValue] || 0;
          bValue = confMap[bValue] || 0;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [allCandidates, sortConfig]);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getConfidenceBadge = (conf) => {
    switch (conf?.toLowerCase()) {
      case 'high': return <span className="text-green-400 bg-green-400/10 border border-green-400/30 px-3 py-1 rounded-full text-xs font-bold uppercase">High</span>;
      case 'medium': return <span className="text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-3 py-1 rounded-full text-xs font-bold uppercase">Medium</span>;
      case 'low': return <span className="text-red-400 bg-red-400/10 border border-red-400/30 px-3 py-1 rounded-full text-xs font-bold uppercase">Low</span>;
      default: return <span className="text-white bg-white/10 px-3 py-1 border border-white/30 rounded-full text-xs font-bold uppercase">Unknown</span>;
    }
  };

  if (allCandidates.length === 0) return <div className="text-space-text/50 italic py-8">No planet candidates available in tracking payload.</div>;

  return (
    <div className="w-full bg-space-surface/40 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden shadow-xl mb-6">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
          <thead>
            <tr className="bg-space-purple/20 border-b border-space-purple/30 text-space-text/80 text-sm font-semibold tracking-wider uppercase">
              <th className="p-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('starName')}>Target Star {sortConfig.key === 'starName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
              <th className="p-5">Planet ID</th>
              <th className="p-5">Orbital Period</th>
              <th className="p-5">Transit Depth</th>
              <th className="p-5">Est. Radius</th>
              <th className="p-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('confidence')}>Confidence {sortConfig.key === 'confidence' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm">
            {sortedCandidates.map((candidate, idx) => (
              <tr 
                key={idx} 
                onClick={() => onRowClick(candidate.starName)}
                className="border-b border-white/5 hover:bg-space-purple/10 cursor-pointer transition-colors group"
              >
                <td className="p-5 font-orbitron group-hover:text-white transition-colors">{candidate.starName}</td>
                <td className="p-5 text-white">{candidate.id}</td>
                <td className="p-5">{candidate.orbitalPeriod} d</td>
                <td className="p-5">{candidate.transitDepth}%</td>
                <td className="p-5">{candidate.estimatedRadius} R⊕</td>
                <td className="p-5">{getConfidenceBadge(candidate.confidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
