import React from 'react';
import { useLocation } from 'react-router-dom';

export default function Footer() {
  const location = useLocation();

  if (location.pathname === '/results') return null;

  return (
    <footer className="py-8 text-center text-space-text/50 text-xs tracking-wider border-t border-white/5 mt-auto bg-space-bg/50 backdrop-blur-sm z-10 relative">
      SpaceSight &copy; 2025 &mdash; Capstone Project, MS Ramaiah Institute of Technology
    </footer>
  );
}
