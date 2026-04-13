import React, { useMemo } from 'react';

const generateStars = (count) => {
  let stars = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 2000);
    const y = Math.floor(Math.random() * 2000);
    const opacity = Math.random() * 0.5 + 0.5;
    stars.push(`${x}px ${y}px rgba(255, 255, 255, ${opacity})`);
  }
  return stars.join(', ');
};

export default function StarField() {
  const layer1 = useMemo(() => generateStars(700), []);
  const layer2 = useMemo(() => generateStars(200), []);
  const layer3 = useMemo(() => generateStars(100), []);

  return (
    <>
      <style>{`
        #stars1 { width: 1px; height: 1px; background: transparent; animation: animStar 150s linear infinite; box-shadow: ${layer1}; }
        #stars1:after { content: " "; position: absolute; top: 2000px; width: 1px; height: 1px; background: transparent; box-shadow: ${layer1}; }
        
        #stars2 { width: 2px; height: 2px; background: transparent; animation: animStar 100s linear infinite; box-shadow: ${layer2}; }
        #stars2:after { content: " "; position: absolute; top: 2000px; width: 2px; height: 2px; background: transparent; box-shadow: ${layer2}; }
        
        #stars3 { width: 3px; height: 3px; background: transparent; animation: animStar 50s linear infinite; box-shadow: ${layer3}; }
        #stars3:after { content: " "; position: absolute; top: 2000px; width: 3px; height: 3px; background: transparent; box-shadow: ${layer3}; }
        
        @keyframes animStar {
          from { transform: translateY(0px); }
          to { transform: translateY(-2000px); }
        }
      `}</style>
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none w-full h-full bg-space-bg">
        <div id="stars1"></div>
        <div id="stars2"></div>
        <div id="stars3"></div>
      </div>
    </>
  );
}
