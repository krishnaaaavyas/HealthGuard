import { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string;
  splitType?: "chars" | "words" | "lines" | "words, chars";
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  threshold?: number;
  rootMargin?: string;
  textAlign?: "left" | "center" | "right" | "justify" | "inherit";
  tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";
  onLetterAnimationComplete?: () => void;
}

export default function SplitText({
  text,
  className = "",
  delay = 30,
  duration = 0.8,
  ease = "power3.out",
  splitType = "words",
  from = { opacity: 0, y: 20 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = "-50px",
  textAlign = "center",
  tag = "p",
  onLetterAnimationComplete,
}: SplitTextProps) {
  const ref = useRef<HTMLElement>(null);
  const animationCompletedRef = useRef(false);
  const onCompleteRef = useRef(onLetterAnimationComplete);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    onCompleteRef.current = onLetterAnimationComplete;
  }, [onLetterAnimationComplete]);

  useEffect(() => {
    if (document.fonts.status === "loaded") {
      setFontsLoaded(true);
    } else {
      document.fonts.ready.then(() => {
        setFontsLoaded(true);
      });
    }
  }, []);

  // Check if text contains Indic / complex scripts (Devanagari, Gujarati, Bengali, etc.)
  const isComplexScript = /[\u0900-\u0DFF\u0E00-\u0E7F]/.test(text);

  useGSAP(
    () => {
      if (!ref.current || !text || !fontsLoaded) return;
      if (animationCompletedRef.current) return;
      const el = ref.current;

      const startPct = (1 - threshold) * 100;
      const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin);
      const marginValue = marginMatch ? parseFloat(marginMatch[1]) : 0;
      const marginUnit = marginMatch ? marginMatch[2] || "px" : "px";
      const sign =
        marginValue === 0
          ? ""
          : marginValue < 0
            ? `-=${Math.abs(marginValue)}${marginUnit}`
            : `+=${marginValue}${marginUnit}`;
      const start = `top ${startPct}%${sign}`;

      let targets: Element[] = [];
      if (!isComplexScript && splitType.includes("words")) {
        targets = Array.from(el.querySelectorAll(".split-word"));
      } else {
        targets = [el];
      }

      if (targets.length === 0) {
        targets = [el];
      }

      const tween = gsap.fromTo(
        targets,
        { ...from },
        {
          ...to,
          duration,
          ease,
          stagger: isComplexScript ? 0 : delay / 1000,
          scrollTrigger: {
            trigger: el,
            start,
            once: true,
            fastScrollEnd: true,
          },
          onComplete: () => {
            animationCompletedRef.current = true;
            onCompleteRef.current?.();
          },
          willChange: "transform, opacity",
          force3D: true,
        }
      );

      return () => {
        ScrollTrigger.getAll().forEach((st) => {
          if (st.trigger === el) st.kill();
        });
        tween.kill();
      };
    },
    {
      dependencies: [
        text,
        delay,
        duration,
        ease,
        splitType,
        JSON.stringify(from),
        JSON.stringify(to),
        threshold,
        rootMargin,
        fontsLoaded,
        isComplexScript,
      ],
      scope: ref,
    }
  );

  const Tag = tag || "p";

  const style: React.CSSProperties = {
    textAlign,
    display: tag === "span" ? "inline-block" : "block",
    willChange: "transform, opacity",
  };

  if (isComplexScript) {
    return (
      <Tag ref={ref as React.RefObject<any>} style={style} className={className}>
        {text}
      </Tag>
    );
  }

  const renderContent = () => {
    return text.split(" ").map((word, wIdx, arr) => (
      <span key={wIdx} className="split-word inline-block" style={{ willChange: "transform, opacity" }}>
        {word}
        {wIdx < arr.length - 1 ? "\u00A0" : ""}
      </span>
    ));
  };

  return (
    <Tag ref={ref as React.RefObject<any>} style={style} className={`split-parent ${className}`}>
      {renderContent()}
    </Tag>
  );
}
