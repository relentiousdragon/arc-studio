import React, { useEffect, useRef } from 'react';

const GRID_SPACING = 32;
const INFLUENCE_RADIUS = 98;
const MAX_DPR = 2;
//
export function AuthGridCanvas({ reducedMotion = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const themeRoot = canvas.closest('[data-theme]') || document.documentElement;

    let width = 0;
    let height = 0;
    let animId = null;
    let lastTime = 0;
    let isDark = true;
    let frameCount = 0;

    let baseDotColor = 'rgba(160, 175, 205, 0.24)';
    let activeDotColor = 'rgba(168, 85, 247, 0.95)';
    let activeGlowColor = 'rgba(168, 85, 247, 0.48)';

    let cardDotColor = 'rgba(150, 160, 175, 0.085)';
    let cardActiveColor = 'rgba(205, 215, 230, 0.26)';
    let cardActiveGlow = 'rgba(180, 195, 215, 0.12)';

    const readTheme = () => {
      const attr = themeRoot?.getAttribute('data-theme') || document.documentElement.getAttribute('data-theme') || 'dark';
      isDark = attr !== 'light';
      if (isDark) {
        baseDotColor = 'rgba(160, 175, 205, 0.24)';
        activeDotColor = 'rgba(168, 85, 247, 0.95)';
        activeGlowColor = 'rgba(168, 85, 247, 0.48)';
        cardDotColor = 'rgba(150, 160, 175, 0.085)';
        cardActiveColor = 'rgba(205, 215, 230, 0.26)';
        cardActiveGlow = 'rgba(180, 195, 215, 0.12)';
      } else {
        baseDotColor = 'rgba(80, 95, 120, 0.36)';
        activeDotColor = 'rgba(115, 80, 200, 0.92)';
        activeGlowColor = 'rgba(115, 80, 200, 0.40)';
        cardDotColor = 'rgba(90, 105, 125, 0.095)';
        cardActiveColor = 'rgba(75, 90, 110, 0.28)';
        cardActiveGlow = 'rgba(85, 100, 120, 0.12)';
      }
    };

    readTheme();
    const themeObserver = new MutationObserver(readTheme);
    themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ['data-theme'] });
    if (themeRoot !== document.documentElement) {
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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

    const isPhoneTouchDevice = () => {
      if (typeof window === 'undefined') return false;
      const noHover = window.matchMedia?.('(hover: none)').matches;
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
      const isCompact = window.innerWidth <= 840;
      return noHover || (coarsePointer && isCompact);
    };

    const renderStaticFrame = () => {
      updateCardRect();
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        const inCard = isPointInCard(dot.baseX, dot.baseY);
        if (inCard && isOverExcluded(dot.baseX, dot.baseY)) {
          continue;
        }
        ctx.beginPath();
        if (inCard) {
          ctx.arc(dot.baseX, dot.baseY, 0.9, 0, Math.PI * 2);
          ctx.fillStyle = cardDotColor;
        } else {
          ctx.arc(dot.baseX, dot.baseY, 1.0, 0, Math.PI * 2);
          ctx.fillStyle = baseDotColor;
        }
        ctx.fill();
      }
    };

    const buildGrid = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      updateCardRect();

      const cols = Math.ceil(width / GRID_SPACING) + 1;
      const rows = Math.ceil(height / GRID_SPACING) + 1;

      const offsetX = (width % GRID_SPACING) * 0.5;
      const offsetY = (height % GRID_SPACING) * 0.5;

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

      if (reducedMotion || isPhoneTouchDevice()) {
        renderStaticFrame();
      }
    };

    buildGrid();

    if (reducedMotion) {
      renderStaticFrame();
      return () => {
        themeObserver.disconnect();
      };
    }

    let mouseX = -9999;
    let mouseY = -9999;
    let mouseActive = false;

    const onPointerMove = (e) => {
      if (e.pointerType === 'touch' || isPhoneTouchDevice()) {
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
      if (isPhoneTouchDevice()) {
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

    if (isPhoneTouchDevice()) {
      renderStaticFrame();
      return () => {
        themeObserver.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerleave', onPointerLeave);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('focusin', onFocusIn);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('blur', onPointerLeave);
        window.removeEventListener('resize', onResize);
        dots = [];
      };
    }

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

      const twoPi = Math.PI * 2;

      for (const dot of dots) {
        let proximity = 0;
        if (mouseActive) {
          const dx = dot.baseX - mouseX;
          const dy = dot.baseY - mouseY;
          const dist = Math.hypot(dx, dy);

          if (dist < INFLUENCE_RADIUS) {
            proximity = 1 - dist / INFLUENCE_RADIUS;
          }
        }

        const inCard = isPointInCard(dot.baseX, dot.baseY);
        if (inCard && isOverExcluded(dot.baseX, dot.baseY)) {
          continue;
        }

        const maxLift = isLowPerf ? (inCard ? 4 : 7) : (inCard ? 6.5 : 11);
        dot.targetLift = -Math.pow(proximity, 1.6) * maxLift;
        dot.currentLift += (dot.targetLift - dot.currentLift) * 0.12 * delta;
        dot.glow += (proximity - dot.glow) * 0.14 * delta;

        const drawY = dot.baseY + dot.currentLift;
        const hasGlow = dot.glow > 0.04;

        ctx.beginPath();
        if (hasGlow) {
          if (inCard) {
            const size = 0.9 + dot.glow * 0.65;
            ctx.arc(dot.baseX, drawY, size, 0, twoPi);
            ctx.fillStyle = cardActiveColor;
            if (!isLowPerf) {
              ctx.shadowColor = cardActiveGlow;
              ctx.shadowBlur = dot.glow * 4.5;
            }
          } else {
            const size = 1.0 + dot.glow * 1.3;
            ctx.arc(dot.baseX, drawY, size, 0, twoPi);
            ctx.fillStyle = activeDotColor;
            if (!isLowPerf) {
              ctx.shadowColor = activeGlowColor;
              ctx.shadowBlur = dot.glow * 8;
            }
          }
          ctx.fill();
          if (!isLowPerf) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }
        } else {
          if (inCard) {
            ctx.arc(dot.baseX, drawY, 0.9, 0, twoPi);
            ctx.fillStyle = cardDotColor;
          } else {
            ctx.arc(dot.baseX, drawY, 1.0, 0, twoPi);
            ctx.fillStyle = baseDotColor;
          }
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(frame);
    };

    animId = requestAnimationFrame(frame);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onPointerLeave);
      window.removeEventListener('resize', onResize);
      dots = [];
    };
  }, [reducedMotion]);

  return (
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
        zIndex: 2
      }}
    />
  );
}


// contributors: @paccman-0, @relentiousdragon