import React, { useEffect, useRef } from 'react';

const BASE_LINES = [
  { id: 'a', baseY: 118, flowSpeed: 0.85, waveFreq: 0.0032, amp: 24, strokeOpacity: 0.15 },
  { id: 'b', baseY: 196, flowSpeed: 0.70, waveFreq: 0.0028, amp: 30, strokeOpacity: 0.13 },
  { id: 'c', baseY: 274, flowSpeed: 0.95, waveFreq: 0.0036, amp: 22, strokeOpacity: 0.10 },
  { id: 'd', baseY: 780, flowSpeed: 0.80, waveFreq: 0.0030, amp: 28, strokeOpacity: 0.15 },
  { id: 'e', baseY: 706, flowSpeed: 0.90, waveFreq: 0.0035, amp: 32, strokeOpacity: 0.13 },
  { id: 'f', baseY: 628, flowSpeed: 0.65, waveFreq: 0.0026, amp: 24, strokeOpacity: 0.10 }
];

const NUM_KNOTS = 14;
const KNOT_X = Array.from({ length: NUM_KNOTS }, (_, i) => -120 + (i / (NUM_KNOTS - 1)) * 1680);
//
function buildCubicPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function SetupNetworkWires({ reducedMotion = false }) {
  const svgRef = useRef(null);
  const pathRefs = useRef([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const lines = BASE_LINES.map((def, lineIdx) => {
      return {
        ...def,
        ripples: [],
        lastRippleTime: 0,
        knots: KNOT_X.map((x) => ({
          x,
          baseY: def.baseY,
          currentY: def.baseY
        }))
      };
    });

    lines.forEach((line, idx) => {
      const pathEl = pathRefs.current[idx];
      if (!pathEl) return;
      const pts = line.knots.map((k) => ({
        x: k.x,
        y: k.baseY + Math.sin(k.x * line.waveFreq) * (line.amp * 0.5)
      }));
      pathEl.setAttribute('d', buildCubicPath(pts));
    });

    if (reducedMotion) return undefined;

    let animId = null;
    let mouseX = -9999;
    let mouseY = -9999;
    let prevMouseX = -9999;
    let prevMouseY = -9999;
    let mouseVy = 0;
    let lastTime = 0;

    const onPointerMove = (e) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nextX = ((e.clientX - rect.left) / rect.width) * 1440;
      const nextY = ((e.clientY - rect.top) / rect.height) * 900;

      if (prevMouseY !== -9999) {
        mouseVy = nextY - prevMouseY;
      }
      prevMouseX = mouseX;
      prevMouseY = mouseY;
      mouseX = nextX;
      mouseY = nextY;
    };

    const onPointerLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
      prevMouseX = -9999;
      prevMouseY = -9999;
      mouseVy = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);

    let slowFrames = 0;
    let isLowPerf = false;

    const animate = (now) => {
      if (!lastTime) lastTime = now;
      const rawDelta = (now - lastTime) / 16.667;
      const delta = Math.min(rawDelta, 3.0);
      lastTime = now;

      if (rawDelta > 1.6) {
        slowFrames++;
        if (slowFrames > 6) isLowPerf = true;
      } else if (slowFrames > 0) {
        slowFrames--;
        if (slowFrames === 0) isLowPerf = false;
      }

      const tSec = now * 0.001;

      lines.forEach((line, idx) => {
        const pathEl = pathRefs.current[idx];
        if (!pathEl) return;

        if (!isLowPerf && mouseX > -100 && mouseX < 1540 && Math.abs(mouseY - line.baseY) < 95) {
          if (now - line.lastRippleTime > 180 && line.ripples.length < 4) {
            line.lastRippleTime = now;
            const push = Math.max(-16, Math.min(16, mouseVy * 0.8)) || (mouseY < line.baseY ? 10 : -10);
            line.ripples.push({
              x: mouseX,
              vx: line.flowSpeed * 1.6,
              amp: push,
              sigma: 140,
              decay: 0.982,
              life: 1.0
            });
          }
        }

        for (let r = line.ripples.length - 1; r >= 0; r--) {
          const rip = line.ripples[r];
          rip.x += rip.vx * delta * 2.2;
          rip.life *= Math.pow(rip.decay, delta);
          if (rip.life < 0.02 || rip.x > 1650) {
            line.ripples.splice(r, 1);
          }
        }

        const maxDisplacement = line.amp * 1.45;

        const pts = line.knots.map((k) => {
          const wave1 = Math.sin(k.x * line.waveFreq - tSec * line.flowSpeed * 1.4) * (line.amp * 0.75);
          const wave2 = Math.cos(k.x * line.waveFreq * 0.55 - tSec * line.flowSpeed * 0.85) * (line.amp * 0.35);
          let targetY = line.baseY + wave1 + wave2;

          for (const rip of line.ripples) {
            const dx = k.x - rip.x;
            const gaussian = Math.exp(-(dx * dx) / (2 * rip.sigma * rip.sigma));
            const rippleOscillation = Math.cos(dx * 0.035 - (1 - rip.life) * 4);
            targetY += rip.amp * rip.life * gaussian * rippleOscillation;
          }

          if (mouseX > -100) {
            const dx = k.x - mouseX;
            const dy = targetY - mouseY;
            const dist = Math.hypot(dx, dy);
            if (dist < 180) {
              const proximity = (1 - dist / 180);
              const safeDist = dist > 1 ? dist : 1;
              targetY += (dy / safeDist) * proximity * 24;
            }
          }

          const clampedTargetY = Math.max(
            line.baseY - maxDisplacement,
            Math.min(line.baseY + maxDisplacement, targetY)
          );

          k.currentY += (clampedTargetY - k.currentY) * 0.08 * delta;

          return { x: k.x, y: k.currentY };
        });

        pathEl.setAttribute('d', buildCubicPath(pts));
      });

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [reducedMotion]);

  return (
    <svg ref={svgRef} className="setup-network" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
      {BASE_LINES.map((line, idx) => (
        <path
          key={line.id}
          ref={(el) => { pathRefs.current[idx] = el; }}
          className={`setup-network-wire setup-network-wire-${line.id}`}
          pathLength="1"
          style={{ strokeOpacity: line.strokeOpacity }}
        />
      ))}
    </svg>
  );
}

// contributors: @paccman-0