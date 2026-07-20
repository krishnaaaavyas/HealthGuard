import { useEffect, useState } from "react";

export function DnaVisualization() {
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
  const amplitude = 70;
  const frequency = 0.035; // Controls the pitch of double-helix loops

  // Generate Backbone Points
  const points: { x1: number; y: number; x2: number }[] = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const y = 40 + (i / steps) * 470;
    const angle = y * frequency;
    const x1 = centerX + amplitude * Math.sin(angle);
    const x2 = centerX - amplitude * Math.sin(angle);
    points.push({ x1, y, x2 });
  }

  const strand1Path = "M " + points.map((p) => `${p.x1.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
  const strand2Path = "M " + points.map((p) => `${p.x2.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");

  // Pick nodes for base-pair connecting rungs (every 4th step)
  const rungs = points.filter((_, i) => i % 5 === 0);

  // Define some prominent biomarker nodes on the DNA strands
  const biomarkers = [
    { x: centerX + amplitude * Math.sin(100 * frequency), y: 100, color: "#14B8A6", label: "Biomarker A" },
    { x: centerX - amplitude * Math.sin(170 * frequency), y: 170, color: "#22C55E", label: "Genetics" },
    { x: centerX + amplitude * Math.sin(260 * frequency), y: 260, color: "#0F766E", label: "Metabolic" },
    { x: centerX - amplitude * Math.sin(340 * frequency), y: 340, color: "#14B8A6", label: "AI Analysis" },
    { x: centerX + amplitude * Math.sin(420 * frequency), y: 420, color: "#22C55E", label: "Prevention" },
  ];

  // Define floating particles scattered around the canvas
  const particles = [
    { id: 1, cx: 80, cy: 120, r: 4, driftClass: "drift-slow-1", targetIdx: 0 },
    { id: 2, cx: 360, cy: 160, r: 3, driftClass: "drift-slow-2", targetIdx: 1 },
    { id: 3, cx: 90, cy: 280, r: 5, driftClass: "drift-slow-3", targetIdx: 2 },
    { id: 4, cx: 380, cy: 300, r: 3, driftClass: "drift-slow-1", targetIdx: 2 },
    { id: 5, cx: 100, cy: 400, r: 4, driftClass: "drift-slow-2", targetIdx: 3 },
    { id: 6, cx: 350, cy: 460, r: 5, driftClass: "drift-slow-3", targetIdx: 4 },
  ];

  // Parallax transform calculation
  const pX = (mousePos.x * 24).toFixed(2);
  const pY = (mousePos.y * 24).toFixed(2);

  return (
    <div
      className="relative flex items-center justify-center w-full max-w-[450px] aspect-[45/55] select-none pointer-events-none"
      style={{
        transform: `translate3d(${pX}px, ${pY}px, 0)`,
        transition: "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
      }}
    >
      <style>{`
        .dna-float-container {
          animation: dnaFloat 22s ease-in-out infinite;
          transform-origin: center center;
        }
        .biomarker-pulse {
          animation: bpPulse 3s ease-in-out infinite alternate;
          transform-origin: center;
        }
        .biomarker-pulse-delay-1 {
          animation: bpPulse 3.5s ease-in-out infinite alternate;
          animation-delay: 0.5s;
          transform-origin: center;
        }
        .biomarker-pulse-delay-2 {
          animation: bpPulse 4s ease-in-out infinite alternate;
          animation-delay: 1.2s;
          transform-origin: center;
        }
        .drift-slow-1 {
          animation: drift1 16s ease-in-out infinite alternate;
        }
        .drift-slow-2 {
          animation: drift2 18s ease-in-out infinite alternate;
        }
        .drift-slow-3 {
          animation: drift3 20s ease-in-out infinite alternate;
        }
        .network-line {
          stroke-dasharray: 4, 4;
          animation: dashMove 20s linear infinite;
        }
        @keyframes dnaFloat {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-15px) rotate(1.5deg);
          }
        }
        @keyframes bpPulse {
          0% {
            transform: scale(0.95);
            opacity: 0.85;
          }
          100% {
            transform: scale(1.15);
            opacity: 1;
          }
        }
        @keyframes drift1 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(12px, -10px); }
        }
        @keyframes drift2 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(-10px, 12px); }
        }
        @keyframes drift3 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(8px, 8px); }
        }
        @keyframes dashMove {
          to {
            stroke-dashoffset: -40;
          }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        className="w-full h-full opacity-80"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="dnaGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#22C55E" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0F766E" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="dnaGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0F766E" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#14B8A6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.45" />
          </linearGradient>
          <radialGradient id="radialBgGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.14" />
            <stop offset="50%" stopColor="#0F766E" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background Ambient Radial Glow */}
        <circle cx={centerX} cy={height / 2} r="240" fill="url(#radialBgGlow)" />

        <g className="dna-float-container">
          {/* Fine base-pair connecting rungs */}
          {rungs.map((r, idx) => {
            const delay = (idx % 3) * 0.4;
            return (
              <line
                key={idx}
                x1={r.x1}
                y1={r.y}
                x2={r.x2}
                y2={r.y}
                stroke="url(#dnaGrad1)"
                strokeWidth={1.2}
                opacity={0.3}
                style={{ animationDelay: `${delay}s` }}
              />
            );
          })}

          {/* DNA Backbone Strands */}
          <path
            d={strand1Path}
            fill="none"
            stroke="url(#dnaGrad1)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <path
            d={strand2Path}
            fill="none"
            stroke="url(#dnaGrad2)"
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Fine connecting AI network lines (Biomarkers to Floating Particles) */}
          {particles.map((p) => {
            const bio = biomarkers[p.targetIdx];
            if (!bio) return null;
            return (
              <line
                key={`net-${p.id}`}
                x1={p.cx}
                y1={p.cy}
                x2={bio.x}
                y2={bio.y}
                stroke="#14B8A6"
                strokeWidth={0.8}
                opacity={0.2}
                className={`network-line ${p.driftClass}`}
              />
            );
          })}

          {/* Floating Particles */}
          {particles.map((p) => (
            <g key={`part-${p.id}`} className={p.driftClass}>
              {/* Particle Glow */}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={p.r * 2.5}
                fill="#14B8A6"
                opacity={0.08}
              />
              {/* Particle Core */}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill="#14B8A6"
                opacity={0.35}
              />
            </g>
          ))}

          {/* Biomarker Nodes with glowing effects */}
          {biomarkers.map((b, idx) => {
            const pulseClass =
              idx % 3 === 0
                ? "biomarker-pulse"
                : idx % 3 === 1
                  ? "biomarker-pulse-delay-1"
                  : "biomarker-pulse-delay-2";
            return (
              <g key={`bio-${idx}`} className={pulseClass} style={{ transformOrigin: `${b.x}px ${b.y}px` }}>
                {/* Glow ring */}
                <circle
                  cx={b.x}
                  cy={b.y}
                  r={14}
                  fill="url(#nodeGlow)"
                  className="animate-pulse"
                />
                {/* Inner core boundary */}
                <circle
                  cx={b.x}
                  cy={b.y}
                  r={6}
                  fill="none"
                  stroke={b.color}
                  strokeWidth={1.5}
                  opacity={0.6}
                />
                {/* Center dot */}
                <circle
                  cx={b.x}
                  cy={b.y}
                  r={3.5}
                  fill={b.color}
                  opacity={0.9}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
