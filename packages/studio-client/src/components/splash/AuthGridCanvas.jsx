import React, { useEffect, useRef } from 'react';

const GRID_SPACING = 32;
const INFLUENCE_RADIUS = 98;
const CURSOR_INFLUENCE_RADIUS = INFLUENCE_RADIUS * 0.95;
const AMBIENT_INFLUENCE_RADIUS = INFLUENCE_RADIUS * 1.05;
const PHONE_AMBIENT_RADIUS_SCALE = 0.55;
const MAX_DPR = 2;
//
function withAlpha(color, alpha, context) {
  context.fillStyle = color;
  const normalized = context.fillStyle;
  const hex = /^#([\da-f]{6})$/i.exec(normalized);
  const rgb = hex
    ? [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16))
    : /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(normalized)?.slice(1, 4).map(Number);
  return rgb ? `rgba(${rgb.join(', ')}, ${alpha})` : `rgba(112, 185, 232, ${alpha})`;
}

export function AuthGridCanvas({ reducedMotion = false }) {
  const canvasRef = useRef(null);
  const cardCanvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cardCanvas = cardCanvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const cardCtx = cardCanvas?.getContext('2d') || null;

    const themeRoot = canvas.closest('[data-theme]') || document.documentElement;

    let width = 0;
    let height = 0;
    let animId = null;
    let lastTime = 0;
    let isDark = true;
    let frameCount = 0;

    let baseDotColor = 'rgba(163, 178, 208, 0.34)';
    let activeDotColor = 'rgba(112, 185, 232, 0.95)';
    let activeGlowColor = 'rgba(112, 185, 232, 0.48)';
    let cursorDotColor = 'rgba(78, 83, 91, 0.96)';
    let cursorGlowColor = 'rgba(78, 83, 91, 0.48)';
    let cardDotColor = 'rgba(150, 160, 175, 0.14)';
    let cardActiveColor = 'rgba(205, 215, 230, 0.26)';
    let cardActiveGlow = 'rgba(180, 195, 215, 0.12)';

    const readTheme = () => {
      const attr = themeRoot?.getAttribute('data-theme') || document.documentElement.getAttribute('data-theme') || 'dark';
      isDark = attr !== 'light';
      const accent = getComputedStyle(themeRoot).getPropertyValue('--accent').trim() || '#70b9e8';
      activeDotColor = withAlpha(accent, 0.95, ctx);
      activeGlowColor = withAlpha(accent, 0.48, ctx);
      if (isDark) {
        baseDotColor = 'rgba(163, 178, 208, 0.34)';
        cursorDotColor = 'rgba(78, 83, 91, 0.96)';
        cursorGlowColor = 'rgba(78, 83, 91, 0.48)';
        cardDotColor = 'rgba(150, 160, 175, 0.14)';
        cardActiveColor = 'rgba(205, 215, 230, 0.26)';
        cardActiveGlow = 'rgba(180, 195, 215, 0.12)';
      } else {
        baseDotColor = 'rgba(74, 88, 112, 0.46)';
        cursorDotColor = 'rgba(104, 111, 121, 0.92)';
        cursorGlowColor = 'rgba(104, 111, 121, 0.34)';
        cardDotColor = 'rgba(90, 105, 125, 0.16)';
        cardActiveColor = 'rgba(75, 90, 110, 0.28)';
        cardActiveGlow = 'rgba(85, 100, 120, 0.12)';
      }
    };

    readTheme();
    const themeObserver = new MutationObserver(readTheme);
    themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ['data-theme', 'data-release-channel'] });
    if (themeRoot !== document.documentElement) {
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-release-channel'] });
    }

    let cardRect = null;
    let excludedRects = [];
    const cardRadius = 12;

    const updateCardRect = () => {
      const cardEl = document.querySelector('.auth-card, .desktop-server-error');
      if (!cardEl) {
        cardRect = null;
        excludedRects = [];
        return;
      }
      const cRect = cardEl.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height) {
        cardRect = null;
        excludedRects = [];
        return;
      }
      const scaleX = width / canvasRect.width;
      const scaleY = height / canvasRect.height;
      cardRect = {
        left: (cRect.left - canvasRect.left) * scaleX,
        top: (cRect.top - canvasRect.top) * scaleY,
        right: (cRect.right - canvasRect.left) * scaleX,
        bottom: (cRect.bottom - canvasRect.top) * scaleY
      };

      const excludedEls = cardEl.querySelectorAll(
        'input, textarea, select, button, label, .auth-input-wrap, .auth-remembered-user-card, .auth-submit, .auth-back, .auth-reveal, .auth-edit-username, .auth-retry, .workspace-switcher, .splash-project-templates, [role="button"], [role="tab"]'
      );

      const PADDING = 6;
      excludedRects = [];
      for (let i = 0; i < excludedEls.length; i++) {
        const r = excludedEls[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          excludedRects.push({
            left: (r.left - canvasRect.left) * scaleX - PADDING,
            top: (r.top - canvasRect.top) * scaleY - PADDING,
            right: (r.right - canvasRect.left) * scaleX + PADDING,
            bottom: (r.bottom - canvasRect.top) * scaleY + PADDING
          });
        }
      }
    };

    const isPointInCard = (x, y) => {
      if (!cardRect) return false;
      const r = cardRadius;
      if (x < cardRect.left || x > cardRect.right || y < cardRect.top || y > cardRect.bottom) {
        return false;
      }
      if (x < cardRect.left + r && y < cardRect.top + r) {
        return Math.hypot(x - (cardRect.left + r), y - (cardRect.top + r)) <= r;
      }
      if (x > cardRect.right - r && y < cardRect.top + r) {
        return Math.hypot(x - (cardRect.right - r), y - (cardRect.top + r)) <= r;
      }
      if (x < cardRect.left + r && y > cardRect.bottom - r) {
        return Math.hypot(x - (cardRect.left + r), y - (cardRect.bottom - r)) <= r;
      }
      if (x > cardRect.right - r && y > cardRect.bottom - r) {
        return Math.hypot(x - (cardRect.right - r), y - (cardRect.bottom - r)) <= r;
      }
      return true;
    };

    const isOverExcluded = (x, y) => {
      for (let i = 0; i < excludedRects.length; i++) {
        const r = excludedRects[i];
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return true;
        }
      }
      return false;
    };

    let dots = [];
    let hotspotCount = 4;
    let ambientMotion = null;
    const ambientPaths = [
      (time, phase) => [Math.cos(time + phase), Math.sin(time + phase)],
      (time, phase) => [Math.sin(time + phase), Math.sin((time + phase) * 2) * 0.5],
      (time, phase, index) => {
        const diagonalPosition = Math.sin(time + phase);
        return [
          diagonalPosition,
          diagonalPosition * (index < hotspotCount / 2 ? 1 : -1)
        ];
      },
      (time, phase) => [
        Math.sin(time + phase),
        Math.sin(time + phase) * Math.cos(time + phase) * 1.5
      ]
    ];
    const evaluateAmbientPath = (motion, elapsed) => {
      const duration = motion.nextSwitchAt - motion.pathStartedAt;
      const clampedElapsed = Math.min(elapsed, duration);
      const progress = clampedElapsed / duration;
      const boostedElapsed = clampedElapsed
        + (motion.speedBoost * duration / Math.PI) * (1 - Math.cos(Math.PI * progress));
      const pathElapsed = boostedElapsed + Math.max(0, elapsed - duration);
      const path = ambientPaths[motion.pathIndex];
      const time = pathElapsed * 0.001265;
      return Array.from({ length: hotspotCount }, (_, index) => {
        const phase = motion.phaseOffset + index * (Math.PI * 2 / hotspotCount);
        const [x, y] = path(time, phase, index);
        return {
          x: width * (0.28 + x * 0.22),
          y: height * (0.5 + y * 0.38)
        };
      });
    };

    const getAmbientPointers = (time = 0) => {
      if (hotspotCount === 0 || (isPhoneTouchDevice() && reducedMotion)) return [];
      if (!ambientMotion) {
        ambientMotion = {
          pathIndex: Math.floor(Math.random() * ambientPaths.length),
          pathStartedAt: time,
          phaseOffset: Math.random() * Math.PI * 2,
          nextSwitchAt: time + 2000 + Math.random() * 2000,
          speedBoost: 0.05 + Math.random() * 0.10,
          transitionFrom: null,
          transitionStartedAt: 0
        };
      }

      const getCurrentPositions = (atTime) => {
        const positions = evaluateAmbientPath(ambientMotion, atTime - ambientMotion.pathStartedAt);
        if (!ambientMotion.transitionFrom) return positions;
        const progress = Math.min(1, (atTime - ambientMotion.transitionStartedAt) / 700);
        const eased = progress * progress * (3 - 2 * progress);
        return positions.map((position, index) => ({
          x: ambientMotion.transitionFrom[index].x
            + (position.x - ambientMotion.transitionFrom[index].x) * eased,
          y: ambientMotion.transitionFrom[index].y
            + (position.y - ambientMotion.transitionFrom[index].y) * eased
        }));
      };

      if (time >= ambientMotion.nextSwitchAt) {
        const currentPositions = getCurrentPositions(time);
        let nextPath = Math.floor(Math.random() * (ambientPaths.length - 1));
        if (nextPath >= ambientMotion.pathIndex) nextPath++;
        ambientMotion = {
          pathIndex: nextPath,
          pathStartedAt: time,
          phaseOffset: Math.random() * Math.PI * 2,
          nextSwitchAt: time + 2000 + Math.random() * 2000,
          speedBoost: 0.05 + Math.random() * 0.10,
          transitionFrom: currentPositions,
          transitionStartedAt: time
        };
      }

      const positions = getCurrentPositions(time);
      if (ambientMotion.transitionFrom && time - ambientMotion.transitionStartedAt >= 700) {
        ambientMotion.transitionFrom = null;
      }
      return positions;
    };

    const isPhoneTouchDevice = () => {
      if (typeof window === 'undefined') return false;
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
      return Boolean(coarsePointer && Math.min(window.innerWidth, window.innerHeight) <= 840);
    };

    const isPhonePortrait = () => isPhoneTouchDevice() && window.innerHeight > window.innerWidth;
    const shouldAnimate = () => !reducedMotion && !isPhonePortrait();
    const getAmbientRadius = () => isPhoneTouchDevice()
      ? AMBIENT_INFLUENCE_RADIUS * PHONE_AMBIENT_RADIUS_SCALE
      : AMBIENT_INFLUENCE_RADIUS;

    const updateHotspotCount = () => {
      if (isPhonePortrait()) {
        hotspotCount = 0;
        return;
      }
      const declaredScale = Number(canvas.closest('.app-root')?.dataset.uiScale) / 100;
      const uiScale = Number.isFinite(declaredScale) && declaredScale > 0 ? declaredScale : 1;
      const availableArea = (width * height) / (uiScale * uiScale);
      hotspotCount = availableArea < 800000 ? 4 : availableArea < 1500000 ? 6 : 8;
    };

    const renderStaticFrame = () => {
      updateCardRect();
      ctx.clearRect(0, 0, width, height);
      cardCtx?.clearRect(0, 0, width, height);
      const ambientPointers = getAmbientPointers();
      const ambientRadius = getAmbientRadius();
      for (const dot of dots) {
        const inCard = isPointInCard(dot.baseX, dot.baseY);
        if (inCard && isOverExcluded(dot.baseX, dot.baseY)) {
          continue;
        }
        const target = inCard ? (cardCtx || ctx) : ctx;
        let proximity = 0;
        if (!inCard) {
          for (const pointer of ambientPointers) {
            const distance = Math.hypot(dot.baseX - pointer.x, dot.baseY - pointer.y);
            if (distance < ambientRadius) {
              proximity = Math.max(proximity, 1 - distance / ambientRadius);
            }
          }
        }
        target.beginPath();
        if (inCard) {
          target.arc(dot.baseX, dot.baseY, 0.9, 0, Math.PI * 2);
          target.fillStyle = cardDotColor;
        } else {
          target.arc(dot.baseX, dot.baseY, 1 + proximity * 1.3, 0, Math.PI * 2);
          target.fillStyle = proximity > 0.04 ? activeDotColor : baseDotColor;
          if (proximity > 0.04) {
            target.shadowColor = activeGlowColor;
            target.shadowBlur = proximity * 8;
          }
        }
        target.fill();
        target.shadowColor = 'transparent';
        target.shadowBlur = 0;
      }
    };

    const buildGrid = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cardCanvas) {
        cardCanvas.width = Math.round(width * dpr);
        cardCanvas.height = Math.round(height * dpr);
        cardCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      updateCardRect();

      const cols = Math.ceil(width / GRID_SPACING) + 1;
      const rows = Math.ceil(height / GRID_SPACING) + 1;

      const offsetX = (width % GRID_SPACING) * 0.5;
      const offsetY = (height % GRID_SPACING) * 0.5;

      updateHotspotCount();
      ambientMotion = null;
      dots = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = offsetX + c * GRID_SPACING;
          const by = offsetY + r * GRID_SPACING;
          dots.push({
            baseX: bx,
            baseY: by,
            currentLift: 0,
            targetLift: 0,
            glow: 0
          });
        }
      }

      if (!shouldAnimate()) {
        renderStaticFrame();
      }
    };

    buildGrid();

    let mouseX = -9999;
    let mouseY = -9999;
    let mouseActive = false;

    const onPointerMove = (e) => {
      if (e.pointerType === 'touch' || isPhoneTouchDevice() || reducedMotion) {
        if (mouseActive) {
          mouseActive = false;
          mouseX = -9999;
          mouseY = -9999;
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      mouseX = ((e.clientX - rect.left) / rect.width) * width;
      mouseY = ((e.clientY - rect.top) / rect.height) * height;
      mouseActive = true;
    };

    const onPointerLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
      mouseActive = false;
    };

    const isInputField = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable || Boolean(el.closest?.('input, textarea, .auth-input-wrap'));
    };

    const onPointerDown = (e) => {
      if (e.pointerType === 'touch' || isPhoneTouchDevice()) {
        mouseActive = false;
        mouseX = -9999;
        mouseY = -9999;
        return;
      }
      if (isInputField(e.target)) {
        mouseActive = false;
        mouseX = -9999;
        mouseY = -9999;
      }
    };

    const onFocusIn = (e) => {
      if (isInputField(e.target)) {
        mouseActive = false;
        mouseX = -9999;
        mouseY = -9999;
      }
    };

    const onKeyDown = () => {
      if (isInputField(document.activeElement)) {
        mouseActive = false;
        mouseX = -9999;
        mouseY = -9999;
      }
    };

    const onResize = () => {
      buildGrid();
      if (!shouldAnimate()) {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
        renderStaticFrame();
      } else if (!animId) {
        lastTime = 0;
        animId = requestAnimationFrame(frame);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKeyDown, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    const scaleObserver = new MutationObserver(() => {
      ambientMotion = null;
      onResize();
    });
    const appRoot = canvas.closest('.app-root');
    if (appRoot) scaleObserver.observe(appRoot, { attributes: true, attributeFilter: ['data-ui-scale'] });

    let slowFrames = 0;
    let isLowPerf = false;

    const frame = (now) => {
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

      frameCount++;
      if (frameCount % 3 === 0 || !cardRect) {
        updateCardRect();
      }

      ctx.clearRect(0, 0, width, height);
      cardCtx?.clearRect(0, 0, width, height);

      const twoPi = Math.PI * 2;
      const ambientPointers = getAmbientPointers(now);
      const ambientRadius = getAmbientRadius();

      for (const dot of dots) {
        let cursorProximity = 0;
        if (mouseActive) {
          const dx = dot.baseX - mouseX;
          const dy = dot.baseY - mouseY;
          const dist = Math.hypot(dx, dy);
          const cursorRadius = mouseX < width * 0.55
            ? CURSOR_INFLUENCE_RADIUS * 0.85
            : CURSOR_INFLUENCE_RADIUS;

          if (dist < cursorRadius) {
            cursorProximity = 1 - dist / cursorRadius;
          }
        }
        let ambientProximity = 0;
        const inCard = isPointInCard(dot.baseX, dot.baseY);
        if (!inCard) {
          for (const pointer of ambientPointers) {
            const dx = dot.baseX - pointer.x;
            const dy = dot.baseY - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < ambientRadius) {
              ambientProximity = Math.max(ambientProximity, 1 - dist / ambientRadius);
            }
          }
        }
        const proximity = Math.max(cursorProximity, ambientProximity);

        if (inCard && isOverExcluded(dot.baseX, dot.baseY)) {
          continue;
        }

        const maxLift = isLowPerf ? (inCard ? 4 : 7) : (inCard ? 6.5 : 11);
        dot.targetLift = -Math.pow(proximity, 1.6) * maxLift;
        const response = proximity > 0.04 ? 0.22 : 0.12;
        dot.currentLift += (dot.targetLift - dot.currentLift) * response * delta;
        const glowTarget = proximity;
        dot.glow += (glowTarget - dot.glow) * 0.14 * delta;

        const drawX = dot.baseX;
        const drawY = dot.baseY + dot.currentLift;
        const hasGlow = dot.glow > 0.04;
        const target = inCard ? (cardCtx || ctx) : ctx;

        target.beginPath();
        if (hasGlow) {
          if (inCard) {
            const size = 0.9 + dot.glow * 0.65;
            target.arc(dot.baseX, drawY, size, 0, twoPi);
            target.fillStyle = cardActiveColor;
            if (!isLowPerf) {
              target.shadowColor = cardActiveGlow;
              target.shadowBlur = dot.glow * 4.5;
            }
          } else {
            const size = 1 + dot.glow * 1.3;
            target.arc(drawX, drawY, size, 0, twoPi);
            const cursorDriven = cursorProximity > 0.04;
            target.fillStyle = cursorDriven ? cursorDotColor : activeDotColor;
            if (!isLowPerf) {
              target.shadowColor = cursorDriven ? cursorGlowColor : activeGlowColor;
              target.shadowBlur = dot.glow * 8;
            }
          }
          target.fill();
          if (!isLowPerf) {
            target.shadowColor = 'transparent';
            target.shadowBlur = 0;
          }
        } else {
          if (inCard) {
            target.arc(dot.baseX, drawY, 0.9, 0, twoPi);
            target.fillStyle = cardDotColor;
          } else {
            target.arc(drawX, drawY, 1, 0, twoPi);
            target.fillStyle = baseDotColor;
          }
          target.fill();
        }
      }

      animId = requestAnimationFrame(frame);
    };

    if (shouldAnimate()) animId = requestAnimationFrame(frame);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      themeObserver.disconnect();
      scaleObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onPointerLeave);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      dots = [];
    };
  }, [reducedMotion]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="auth-grid-canvas"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />
      <canvas
        ref={cardCanvasRef}
        className="auth-grid-canvas auth-grid-card-canvas"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
    </>
  );
}


// contributors: @paccman-0, @relentiousdragon