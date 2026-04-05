import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-space-bg/70 backdrop-blur-md border-b border-white/5 px-6 py-4 flex justify-between items-center transition-all duration-300">
      <Link to="/" className="flex items-center gap-2 text-white hover:text-space-purple transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-space-purple">
           <path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"/>
           <path d="m13.56 11.747 4.332-.924"/>
           <path d="m16 21-3.105-6.21"/>
           <path d="M16.485 5.338a2 2 0 0 1 2.965.844l2.007 4.015a2 2 0 0 1-.984 2.7l-4.332.924-4.76 1.015a1 1 0 0 1-1.17-.667l-2.008-4.014a1 1 0 0 1 .586-1.25z"/>
           <path d="m6.54 13.239 2.61 5.22"/>
        </svg>
        <span className="font-orbitron font-bold text-xl tracking-wider">SpaceSight</span>
      </Link>
      <div className="flex items-center gap-8">
        <Link to="/analyze" className="px-6 py-2 rounded-full font-orbitron font-medium text-sm text-white bg-space-purple hover:bg-space-violet transition-all duration-300 shadow-[0_0_15px_rgba(124,58,237,0.5)] hover:shadow-[0_0_25px_rgba(168,85,247,0.7)] flex items-center gap-2">
          Launch Analysis
        </Link>
      </div>
    </nav>
  );
}
