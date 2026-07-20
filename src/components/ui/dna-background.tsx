import { useEffect, useRef, useState } from "react";

interface DnaBackgroundProps {
  color?: string; // fallback base color
}

export function DnaBackground({ color }: DnaBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    // Initialize 3D particles floating in the background
    const numParticles = 40;
    const particles: { xPct: number; yPct: number; z: number; speed: number; r: number }[] = [];
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        xPct: Math.random(),
        yPct: 0.2 + Math.random() * 0.6,
        z: -60 + Math.random() * 120, // depth from -60 to 60
        speed: 0.02 + Math.random() * 0.05,
        r: 1.5 + Math.random() * 3,
      });
    }

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const centerY = height / 2 + mousePos.y * 40;
      const helixWidth = width * 1.1; // extend slightly past edges
      const startX = -width * 0.05;
      
      const amplitude = Math.min(height * 0.28, 65);
      const numTurns = width < 640 ? 3.5 : width < 1024 ? 5.5 : 7.5;
      const phase = time * 0.0012; // animation speed

      // We will generate segments, rungs, and nodes, then sort them by Z (Painter's algorithm)
      const renderQueue: any[] = [];

      // 1. Generate DNA backbone points and segments
      const steps = width < 640 ? 80 : 160;
      const s1Points: { x: number; y: number; z: number }[] = [];
      const s2Points: { x: number; y: number; z: number }[] = [];

      for (let i = 0; i <= steps; i++) {
        const pct = i / steps;
        const x = startX + pct * helixWidth;
        const angle = pct * numTurns * 2 * Math.PI + phase;

        // Helix rotation in 3D: y = sin(angle), z = cos(angle)
        const y1 = centerY + amplitude * Math.sin(angle);
        const z1 = amplitude * Math.cos(angle);

        const y2 = centerY - amplitude * Math.sin(angle);
        const z2 = -amplitude * Math.cos(angle);

        s1Points.push({ x, y: y1, z: z1 });
        s2Points.push({ x, y: y2, z: z2 });
      }

      // Add Strand 1 Segments to render queue
      for (let i = 0; i < steps; i++) {
        const p1 = s1Points[i];
        const p2 = s1Points[i + 1];
        const zAvg = (p1.z + p2.z) / 2;
        renderQueue.push({
          type: "segment",
          strand: 1,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          z: zAvg,
        });
      }

      // Add Strand 2 Segments to render queue
      for (let i = 0; i < steps; i++) {
        const p1 = s2Points[i];
        const p2 = s2Points[i + 1];
        const zAvg = (p1.z + p2.z) / 2;
        renderQueue.push({
          type: "segment",
          strand: 2,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          z: zAvg,
        });
      }

      // 2. Generate Base-Pair Rungs (every few steps)
      const rungStep = width < 640 ? 5 : 6;
      for (let i = 0; i <= steps; i += rungStep) {
        const p1 = s1Points[i];
        const p2 = s2Points[i];
        if (!p1 || !p2) continue;
        const zAvg = (p1.z + p2.z) / 2;
        renderQueue.push({
          type: "rung",
          x: p1.x,
          y1: p1.y,
          y2: p2.y,
          z: zAvg,
        });
      }

      // 3. Generate Biomarker Nodes at wave peaks
      const nodeStep = width < 640 ? 15 : 24;
      for (let i = 10; i < steps; i += nodeStep) {
        const p1 = s1Points[i];
        const p2 = s2Points[i];
        if (!p1 || !p2) continue;
        
        // Choose one strand side to host the biomarker
        const host = i % 2 === 0 ? p1 : p2;
        const nodeColor = i % 3 === 0 ? "#14B8A6" : i % 3 === 1 ? "#22C55E" : "#0F766E";

        renderQueue.push({
          type: "node",
          x: host.x,
          y: host.y,
          color: nodeColor,
          z: host.z,
        });

        // Add a fine network line from the biomarker to a nearby particle
        const nearestPart = particles[Math.floor((i / steps) * particles.length)];
        if (nearestPart) {
          const partX = nearestPart.xPct * width;
          const partY = nearestPart.yPct * height + Math.sin(time * 0.001 + nearestPart.z) * 10;
          renderQueue.push({
            type: "netline",
            x1: host.x,
            y1: host.y,
            x2: partX,
            y2: partY,
            z: (host.z + nearestPart.z) / 2 - 10,
          });
        }
      }

      // 4. Add Particles to render queue
      particles.forEach((p) => {
        // Drift particle slowly
        const x = p.xPct * width + mousePos.x * 25;
        const y = p.yPct * height + Math.sin(time * 0.0005 * p.speed + p.z) * 20 + mousePos.y * 25;
        renderQueue.push({
          type: "particle",
          x,
          y,
          r: p.r,
          z: p.z,
        });
      });

      // 5. SORT BY Z-INDEX (Painter's Algorithm)
      renderQueue.sort((a, b) => a.z - b.z);

      // 6. DRAW ALL ELEMENTS IN DEPTH ORDER
      renderQueue.forEach((el) => {
        // Calculate depth scale factors (back elements are smaller/dimmer)
        const depthPct = (el.z + amplitude) / (amplitude * 2); // 0 (back) to 1 (front)
        const opacity = 0.06 + depthPct * 0.38;
        
        // Fade out near left/right screen edges
        const screenFade = Math.min(el.x / (width * 0.15), (width - el.x) / (width * 0.15), 1);
        const finalOpacity = Math.max(0, opacity * screenFade);

        if (finalOpacity <= 0) return;

        ctx.globalAlpha = finalOpacity;

        if (el.type === "segment") {
          ctx.beginPath();
          ctx.moveTo(el.x1, el.y1);
          ctx.lineTo(el.x2, el.y2);
          ctx.lineWidth = el.strand === 1 ? 2.5 + depthPct * 1.5 : 2.0 + depthPct * 1.5;
          ctx.strokeStyle = el.strand === 1 ? "#14B8A6" : "#22C55E";
          ctx.lineCap = "round";
          ctx.stroke();
        } else if (el.type === "rung") {
          ctx.beginPath();
          ctx.moveTo(el.x, el.y1);
          ctx.lineTo(el.x, el.y2);
          ctx.lineWidth = 1.0 + depthPct * 0.8;
          ctx.strokeStyle = "rgba(20, 184, 166, 0.4)";
          ctx.setLineDash([2, 3]);
          ctx.stroke();
          ctx.setLineDash([]); // reset
        } else if (el.type === "node") {
          const r = 5.5 + depthPct * 4;
          
          // Outer Glow
          const glow = ctx.createRadialGradient(el.x, el.y, r * 0.2, el.x, el.y, r * 2.2);
          glow.addColorStop(0, el.color);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(el.x, el.y, r * 2.2, 0, 2 * Math.PI);
          ctx.fill();

          // Core Node
          ctx.beginPath();
          ctx.arc(el.x, el.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = el.color;
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 1.2;
          ctx.fill();
          ctx.stroke();
        } else if (el.type === "netline") {
          ctx.beginPath();
          ctx.moveTo(el.x1, el.y1);
          ctx.lineTo(el.x2, el.y2);
          ctx.lineWidth = 0.6;
          ctx.strokeStyle = "rgba(20, 184, 166, 0.25)";
          ctx.stroke();
        } else if (el.type === "particle") {
          ctx.beginPath();
          ctx.arc(el.x, el.y, el.r * (0.8 + depthPct * 0.6), 0, 2 * Math.PI);
          ctx.fillStyle = "#14B8A6";
          ctx.fill();
        }
      });

      ctx.globalAlpha = 1.0; // reset
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [mousePos]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block bg-transparent"
    />
  );
}
