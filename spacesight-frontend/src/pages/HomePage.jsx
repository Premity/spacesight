import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

export default function HomePage() {
  const [hoveredStage, setHoveredStage] = useState(null);
  const timeoutRef = useRef(null);

  const handleMouseEnter = (id) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHoveredStage(id);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setHoveredStage(null);
    }, 150);
  };

  const steps = [
    { id: 1, label: 'Start', icon: '🚀', desc: 'User uploads .npz Kepler light curve data for analysis' },
    { id: 2, label: 'Loading', icon: '📡', desc: 'Raw flux and time arrays are read into memory and validated' },
    { id: 3, label: 'Preprocessing', icon: '⚙️', desc: 'Continuous light curve data is segmented into fixed-size observation windows' },
    { id: 4, label: 'Filtering', icon: '🧹', desc: 'Outliers, corrupted cadences, and instrumental noise are removed' },
    { id: 5, label: 'Normalization', icon: '📏', desc: 'Flux values are scaled to a uniform range for consistent model input' },
    { id: 6, label: 'CNN Inference', icon: '🧠', desc: 'Each window is scored for planetary transit probability by the trained 1D CNN' },
    { id: 7, label: 'BLS Analysis', icon: '🔎', desc: 'Box Least Squares algorithm determines orbital period and estimated planet radius' },
    { id: 8, label: 'Done', icon: '✨', desc: 'Planetary candidates are ranked by confidence and prepared for visualization' },
  ];

  const team = [
    {
      name: 'Adya Avinash',
      id: '1MS23CI006',
      role: 'Smarty-Pants',
      initials: 'AA',
    },
    {
      name: 'Diya Vipin',
      id: '1MS23CI034',
      role: '🔵🔵🔵',
      initials: 'DV',
    },
    {
      name: 'Mohammad Hamd Ashfaque',
      id: '1MS23CI068',
      role: 'GOAT',
      initials: 'MHA',
    },
  ];

  return (
    <div className="min-h-screen text-space-text flex flex-col font-inter relative z-10 w-full overflow-x-hidden pt-32">
      {/* Hero Section */}
      <section className="relative px-6 max-w-5xl mx-auto text-center flex flex-col items-center flex-1 flex-shrink-0 z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] bg-space-purple/20 blur-[120px] rounded-full z-[-1] pointer-events-none animate-pulse"></div>

        <span className="uppercase text-xs md:text-sm tracking-[0.3em] text-space-teal font-semibold mb-6 block drop-shadow-md">
          Merging AI and Physics for Planet Detection
        </span>

        <h1 className="font-orbitron text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-8 leading-tight drop-shadow-lg">
          Detecting <span className="bg-gradient-to-r from-space-purple to-space-violet bg-clip-text text-transparent">Worlds</span> Beyond Our Own
        </h1>

        <p className="text-lg md:text-xl text-space-text/80 max-w-3xl mb-12 leading-relaxed font-light">
          SpaceSight analyzes Kepler Space Telescope light curves using a 1D Convolutional Neural Network to detect the faint dimming signatures of planets passing in front of distant stars — separating real worlds from noise with physics-based validation and BLS orbital analysis.
        </p>

        <Link to="/analyze" className="px-8 py-4 rounded-full font-orbitron font-medium text-lg text-white bg-space-purple hover:bg-space-violet transition-all duration-300 shadow-[0_0_20px_rgba(124,58,237,0.6)] hover:shadow-[0_0_35px_rgba(168,85,247,0.8)] hover:scale-105 inline-block">
          Start Analysis &rarr;
        </Link>
      </section>

      {/* How It Works / Pipeline */}
      <section className="py-32 px-6 max-w-[1400px] w-full mx-auto flex-shrink-0 z-10 relative">
        <div className="text-center mb-24">
          <h2 className="font-orbitron text-3xl md:text-4xl font-bold mb-6">The Pipeline</h2>
          <div className="w-24 h-1 bg-gradient-to-r from-space-purple to-space-teal mx-auto rounded-full"></div>
        </div>

        <div className="relative mb-20">
          {/* Connecting line */}
          <div className="absolute top-1/3 left-[5%] w-[90%] h-0.5 border-t-2 border-dashed border-space-text/10 hidden lg:block z-0 transform -translate-y-1/2"></div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:flex lg:flex-row justify-between relative z-10 gap-x-2 gap-y-12 w-full">
            {steps.map((step, index) => {
              const isHovered = hoveredStage === step.id;

              return (
                <div
                  key={step.id}
                  className="stepper-item flex flex-col items-center flex-1 cursor-pointer"
                  style={{ animationDelay: `${index * 120}ms` }}
                  onMouseEnter={() => handleMouseEnter(step.id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg border-2 z-10 transition-all duration-300 ${isHovered ? 'scale-110 border-space-purple text-white shadow-[0_0_25px_rgba(168,85,247,0.8)] bg-space-purple/20' : 'border-space-purple text-white shadow-[0_0_15px_rgba(124,58,237,0.4)] bg-space-purple/10'}`}>
                    {step.icon}
                  </div>
                  <span className={`mt-6 text-[0.65rem] md:text-sm font-semibold uppercase tracking-widest text-center transition-all duration-300 ${isHovered ? 'text-white drop-shadow-lg' : 'text-space-purple drop-shadow-md'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="max-w-2xl mx-auto bg-space-surface/80 border border-white/10 rounded-2xl p-8 backdrop-blur-md shadow-[0_0_20px_rgba(124,58,237,0.15)] relative overflow-hidden transition-all duration-500 h-[160px] flex items-center justify-center text-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-space-purple to-space-teal opacity-70"></div>

          <div className="w-full relative h-full flex flex-col items-center justify-center">
            <div className={`absolute text-space-text/50 italic text-lg lg:text-xl description-text ${hoveredStage === null ? 'visible-text' : 'hidden-text'}`}>
              Hover over a stage to learn more.
            </div>
            {steps.map(step => (
              <div key={step.id} className={`absolute w-full font-light text-space-text/90 text-lg lg:text-xl description-text ${hoveredStage === step.id ? 'visible-text' : 'hidden-text'}`}>
                {step.desc}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-32 px-6 max-w-6xl mx-auto w-full flex-shrink-0 z-10 relative">
        <div className="text-center mb-20">
          <h2 className="font-orbitron text-3xl md:text-4xl font-bold mb-6">The Team</h2>
          <div className="w-24 h-1 bg-gradient-to-r from-space-teal to-space-purple mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {team.map((member) => (
            <div key={member.id} className="group bg-space-surface/40 border border-white/10 rounded-3xl p-10 flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 hover:border-space-purple/50 hover:bg-space-surface/80 hover:shadow-[0_15px_40px_rgba(124,58,237,0.15)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-space-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              {/* Avatar image will be added later */}
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-space-purple to-space-teal flex items-center justify-center mb-8 shadow-lg transform group-hover:scale-105 group-hover:rotate-3 transition-all duration-500">
                <span className="font-orbitron text-3xl font-bold text-white tracking-widest">{member.initials}</span>
              </div>

              <h3 className="font-orbitron text-xl md:text-2xl font-semibold mb-2 text-white relative z-10">{member.name}</h3>
              <p className="text-space-text/50 text-sm font-mono tracking-wider relative z-10">{member.id}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
