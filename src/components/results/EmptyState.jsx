import React from 'react';
import { Link } from 'react-router-dom';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6 relative z-10 text-space-text font-inter">
      <div className="w-24 h-24 mb-6 rounded-full bg-space-surface/50 border border-space-purple/20 flex items-center justify-center shadow-[0_0_30px_rgba(124,58,237,0.15)]">
         <svg className="w-12 h-12 text-space-text/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
         </svg>
      </div>
      <h2 className="font-orbitron text-2xl md:text-3xl font-bold mb-4 drop-shadow-md text-white">No analysis data found</h2>
      <p className="text-space-text/60 mb-10 text-lg max-w-md font-light">
        Please run an analysis first to view the planet detection results and visualizations.
      </p>
      <Link to="/analyze" className="px-8 py-3 rounded-full font-orbitron font-medium text-white bg-space-purple hover:bg-space-violet transition-all duration-300 shadow-[0_0_20px_rgba(124,58,237,0.5)] hover:shadow-[0_0_30px_rgba(168,85,247,0.7)] flex items-center gap-2">
        Go to Analysis &rarr;
      </Link>
    </div>
  );
}
