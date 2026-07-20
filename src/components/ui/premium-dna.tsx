import { useEffect, useState } from "react";

export function PremiumDna() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) - 0.5;
      const y = (e.clientY / window.innerHeight) - 0.5;
      setMousePos({ x, y });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const width = 450;
  const height = 550;
  const centerX = width / 2;
  const amplitude = 95; // Large, wide, elegant loops
  const frequency = 0.032; // Spread out turns

  // Generate Backbone Points
  const points: { x1: number; y: number; x2: number; z1: number; z2: number }[] = [];
  const steps = 70;
  for (let i = 0; i <= steps; i++) {
    const y = 40 + (i / steps) * 470;
    const angle = y * frequency;
    
    // We add depth Z to do the Painter's sorting and handle front/back overlaps
    const x1 = centerX + amplitude * Math.sin(angle);
    const z1 = amplitude * Math.cos(angle);

    const x2 = centerX - amplitude * Math.sin(angle);
    const z2 = -amplitude * Math.cos(angle);

    points.push({ x1, y, x2, z1, z2 });
  }

  // Pick nodes for base-pair connecting rungs (every 3rd step)
  const rungs = points.filter((_, i) => i % 3 === 0);

  // Tiny glowing medical crosses
  const crosses = [
    { x: 90, y: 140, size: 8, driftClass: "drift-cross-1" },
    { x: 370, y: 220, size: 10, driftClass: "drift-cross-2" },
    { x: 110, y: 390, size: 8, driftClass: "drift-cross-3" },
    { x: 340, y: 440, size: 9, driftClass: "drift-cross-1" },
  ];

  // Small subtle glowing particles
  const particles = [
    { id: 1, cx: 70, cy: 190, r: 2.5, driftClass: "drift-slow-1" },
    { id: 2, cx: 380, cy: 110, r: 2, driftClass: "drift-slow-2" },
    { id: 3, cx: 120, cy: 290, r: 3, driftClass: "drift-slow-3" },
    { id: 4, cx: 360, cy: 330, r: 2, driftClass: "drift-slow-1" },
    { id: 5, cx: 80, cy: 450, r: 3, driftClass: "drift-slow-2" },
    { id: 6, cx: 390, cy: 490, r: 2.5, driftClass: "drift-slow-3" },
  ];

  const pX = (mousePos.x * 15).toFixed(2);
  const pY = (mousePos.y * 15).toFixed(2);

  return (
    <div
      className="relative flex items-center justify-center w-full max-w-[500px] aspect-[4/5] select-none pointer-events-none"
      style={{
        transform: `translate3d(${pX}px, ${pY}px, 0)`,
        transition: "transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)",
      }}
    >
      <style>{`
        .premium-dna-group {
          animation: floatSlow 20s ease-in-out infinite;
          transform-origin: center center;
        }
        .drift-slow-1 {
          animation: particleDrift1 18s ease-in-out infinite alternate;
        }
        .drift-slow-2 {
          animation: particleDrift2 20s ease-in-out infinite alternate;
        }
        .drift-slow-3 {
          animation: particleDrift3 22s ease-in-out infinite alternate;
        }
        .drift-cross-1 {
          animation: crossDrift1 15s ease-in-out infinite alternate;
        }
        .drift-cross-2 {
          animation: crossDrift2 17s ease-in-out infinite alternate;
        }
        .drift-cross-3 {
          animation: crossDrift3 19s ease-in-out infinite alternate;
        }
        .medical-cross {
          stroke: #14B8A6;
          stroke-width: 1.5;
          fill: none;
          opacity: 0.25;
        }
        @keyframes floatSlow {
          0%, 100% {
            transform: translateY(0px) rotate(-3deg);
          }
          50% {
            transform: translateY(-10px) rotate(-1.5deg);
          }
        }
        @keyframes particleDrift1 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(10px, -8px); }
        }
        @keyframes particleDrift2 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(-8px, 10px); }
        }
        @keyframes particleDrift3 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(6px, 6px); }
        }
        @keyframes crossDrift1 {
          0% { transform: translate(0px, 0px) rotate(0deg); }
          100% { transform: translate(5px, -5px) rotate(15deg); }
        }
        @keyframes crossDrift2 {
          0% { transform: translate(0px, 0px) rotate(0deg); }
          100% { transform: translate(-5px, 5px) rotate(-15deg); }
        }
        @keyframes crossDrift3 {
          0% { transform: translate(0px, 0px) rotate(0deg); }
          100% { transform: translate(4px, 4px) rotate(10deg); }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        className="w-full h-full"
      >
        <defs>
          {/* Gradient definitions with soft opacity */}
          <linearGradient id="backboneGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#14B8A6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="backboneGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#0EA5E9" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.45" />
          </linearGradient>
          
          {/* Mask to fade the left edge of the DNA helix near heading text */}
          <linearGradient id="leftFade" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#white" stopOpacity="0.08" />
            <stop offset="40%" stopColor="#white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#white" stopOpacity="0.85" />
          </linearGradient>
          <mask id="fadeMask">
            <rect width={width} height={height} fill="url(#leftFade)" />
          </mask>

          {/* Radial soft background glows (Accent colors at 15%) */}
          <radialGradient id="blueGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="greenGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="crossGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft Radial Background Ambient Glows */}
        <circle cx={centerX - 50} cy={height / 3} r="180" fill="url(#blueGlow)" />
        <circle cx={centerX + 60} cy={(height * 2) / 3} r="160" fill="url(#greenGlow)" />

        <g className="premium-dna-group" mask="url(#fadeMask)">
          {/* 1. Base-pair Connecting Rungs with Nodes on connections */}
          {rungs.map((r, idx) => {
            const zAvg = (r.z1 + r.z2) / 2;
            const depthFactor = (zAvg + amplitude) / (amplitude * 2); // 0 to 1
            const rungOpacity = 0.12 + depthFactor * 0.18;
            
            return (
              <g key={`rung-${idx}`} style={{ opacity: rungOpacity }}>
                {/* Rung line */}
                <line
                  x1={r.x1}
                  y1={r.y}
                  x2={r.x2}
                  y2={r.y}
                  stroke="#14B8A6"
                  strokeWidth={1.2}
                />
                
                {/* Tiny node on strand 1 connection */}
                <circle
                  cx={r.x1}
                  cy={r.y}
                  r={2.5}
                  fill="#0EA5E9"
                />

                {/* Tiny node on strand 2 connection */}
                <circle
                  cx={r.x2}
                  cy={r.y}
                  r={2.5}
                  fill="#22C55E"
                />
              </g>
            );
          })}

          {/* 2. Backbone Strands */}
          {/* We segment the backbones into individual lines to sort and render front/back curves perfectly */}
          {points.slice(0, -1).map((p, idx) => {
            const nextP = points[idx + 1];
            const zAvg1 = (p.z1 + nextP.z1) / 2;
            const zAvg2 = (p.z2 + nextP.z2) / 2;

            const depthPct1 = (zAvg1 + amplitude) / (amplitude * 2);
            const depthPct2 = (zAvg2 + amplitude) / (amplitude * 2);

            return (
              <g key={`backbone-${idx}`}>
                {/* Strand 1 segment */}
                <line
                  x1={p.x1}
                  y1={p.y}
                  x2={nextP.x1}
                  y2={nextP.y}
                  stroke="url(#backboneGrad1)"
                  strokeWidth={1.5 + depthPct1 * 1.5}
                  style={{ opacity: 0.2 + depthPct1 * 0.5 }}
                />

                {/* Strand 2 segment */}
                <line
                  x1={p.x2}
                  y1={p.y}
                  x2={nextP.x2}
                  y2={nextP.y}
                  stroke="url(#backboneGrad2)"
                  strokeWidth={1.5 + depthPct2 * 1.5}
                  style={{ opacity: 0.2 + depthPct2 * 0.5 }}
                />
              </g>
            );
          })}
        </g>

        {/* 3. Tiny Glowing Medical Crosses */}
        {crosses.map((c, idx) => (
          <g key={`cross-${idx}`} className={c.driftClass}>
            {/* Ambient soft glow behind cross */}
            <circle cx={c.x} cy={c.y} r={16} fill="url(#crossGlow)" opacity={0.3} />
            {/* Draw cross + */}
            <path
              d={`M ${c.x - c.size / 2} ${c.y} L ${c.x + c.size / 2} ${c.y} M ${c.x} ${c.y - c.size / 2} L ${c.x} ${c.y + c.size / 2}`}
              className="medical-cross"
            />
          </g>
        ))}

        {/* 4. Small Subtle Glowing Particles */}
        {particles.map((p) => (
          <g key={`part-${p.id}`} className={p.driftClass}>
            {/* Particle Glow */}
            <circle cx={p.cx} cy={p.cy} r={p.r * 2.5} fill="#14B8A6" opacity={0.06} />
            {/* Particle Core */}
            <circle cx={p.cx} cy={p.cy} r={p.r} fill="#14B8A6" opacity={0.25} />
          </g>
        ))}
      </svg>
    </div>
  );
}
