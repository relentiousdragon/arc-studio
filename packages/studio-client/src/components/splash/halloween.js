const MAX_DPR = 2;
const TWO_PI = Math.PI * 2;
//
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
//
function drawTangledBat(ctx, size, flap, fillStyle, shadowColor) {
  ctx.save();
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = 6;
  ctx.fillStyle = fillStyle;

  const liftL = 0.35 + 0.35 * (0.5 - 0.5 * Math.cos(flap));
  const liftR = 0.50 + 0.30 * (0.5 - 0.5 * Math.sin(flap * 1.2));

  const tipYL = -size * (0.12 + 0.45 * liftL);
  const tipYR = -size * (0.16 + 0.40 * liftR);

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.14);
  ctx.quadraticCurveTo(-size * 0.44, -size * 0.1, -size * 0.95, tipYL);
  ctx.quadraticCurveTo(-size * 0.75, size * 0.1, -size * 0.55, size * 0.14);
  ctx.quadraticCurveTo(-size * 0.35, 0, -size * 0.16, size * 0.16);
  ctx.quadraticCurveTo(-size * 0.08, size * 0.10, 0, size * 0.20);
  ctx.quadraticCurveTo(size * 0.08, size * 0.10, size * 0.16, size * 0.16);
  ctx.quadraticCurveTo(size * 0.35, 0, size * 0.55, size * 0.14);
  ctx.quadraticCurveTo(size * 0.75, size * 0.1, size * 0.95, tipYR);
  ctx.quadraticCurveTo(size * 0.44, -size * 0.1, 0, -size * 0.14);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.12, size * 0.22, 0, 0, TWO_PI);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-size * 0.10, -size * 0.16);
  ctx.lineTo(-size * 0.07, -size * 0.34);
  ctx.lineTo(-size * 0.02, -size * 0.20);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size * 0.10, -size * 0.16);
  ctx.lineTo(size * 0.07, -size * 0.34);
  ctx.lineTo(size * 0.02, -size * 0.20);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
//
function createInteractiveWeb(corner, w, h, baseRadius, radialCount, ringCount, seed) {
  let s = seed | 0;
  const seededRand = () => { s = (s * 16807 + 0) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };

  const cx = (corner === 0 || corner === 3) ? 0 : w;
  const cy = (corner === 0 || corner === 1) ? 0 : h;

  const angleStart = corner === 0 ? 0 : corner === 1 ? Math.PI * 0.5 : corner === 2 ? Math.PI : Math.PI * 1.5;
  const angleSpan = Math.PI * 0.5;

  const radials = [];
  const nodes = [];

  for (let i = 0; i < radialCount; i++) {
    const fraction = i / (radialCount - 1);
    const angleJitter = (i === 0 || i === radialCount - 1) ? 0 : (seededRand() - 0.5) * 0.08;
    const angle = angleStart + fraction * angleSpan + angleJitter;
    const spokeLen = baseRadius * (0.90 + seededRand() * 0.20);

    radials.push({ angle, len: spokeLen });

    const radialNodes = [];
    for (let r = 0; r < ringCount; r++) {
      const ringFrac = (r + 1) / (ringCount + 0.35);
      const dist = spokeLen * ringFrac * (0.95 + seededRand() * 0.10);
      const baseX = cx + Math.cos(angle) * dist;
      const baseY = cy + Math.sin(angle) * dist;

      radialNodes.push({
        baseX,
        baseY,
        x: baseX,
        y: baseY,
        vx: 0,
        vy: 0,
        radialIndex: i,
        ringIndex: r,
        dist,
        pinned: r === ringCount - 1
      });
    }
    nodes.push(radialNodes);
  }

  return {
    corner,
    cx,
    cy,
    baseRadius,
    radialCount,
    ringCount,
    radials,
    nodes,
    opacity: rand(0.70, 0.95)
  };
}
//
export function startHalloween(canvas) {
  if (!canvas) return () => {};

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const themeRoot = canvas.closest('[data-theme]') || document.documentElement;

  let prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;

  let isDark = true;
  let webColor = 'rgba(235, 242, 255, 0.13)';
  let webGlowColor = 'rgba(255, 255, 255, 0.40)';
  let batShadowColor = 'rgba(0, 0, 0, 0.65)';
  let batFill = 'rgba(16, 12, 14, 0.88)';

  function readTheme() {
    const attr = themeRoot?.getAttribute('data-theme') || document.documentElement.getAttribute('data-theme') || 'dark';
    isDark = attr !== 'light';
    if (isDark) {
      webColor = 'rgba(230, 240, 255, 0.14)';
      webGlowColor = 'rgba(255, 255, 255, 0.40)';
      batShadowColor = 'rgba(0, 0, 0, 0.65)';
      batFill = 'rgba(16, 12, 14, 0.90)';
    } else {
      webColor = 'rgba(45, 60, 80, 0.16)';
      webGlowColor = 'rgba(20, 35, 55, 0.42)';
      batShadowColor = 'rgba(30, 42, 58, 0.35)';
      batFill = 'rgba(40, 34, 38, 0.85)';
    }
  }

  readTheme();

  const themeObserver = new MutationObserver(readTheme);
  themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ['data-theme'] });
  if (themeRoot !== document.documentElement) {
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
//
  let width = 0;
  let height = 0;
  let animId = null;
  let lastTime = 0;
  let visible = !document.hidden;
  let stopped = false;

  const isSmallScreen = () => width < 640;
//
  let mouseX = -9999;
  let mouseY = -9999;
  let prevMouseX = -9999;
  let prevMouseY = -9999;
  let mouseVx = 0;
  let mouseVy = 0;
  let mouseActive = false;

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    if (prevMouseX !== -9999) {
      mouseVx = clamp(x - prevMouseX, -16, 16);
      mouseVy = clamp(y - prevMouseY, -16, 16);
    }
    prevMouseX = mouseX;
    prevMouseY = mouseY;
    mouseX = x;
    mouseY = y;
    mouseActive = true;
  }

  function onPointerLeave() {
    mouseX = -9999;
    mouseY = -9999;
    prevMouseX = -9999;
    prevMouseY = -9999;
    mouseVx = 0;
    mouseVy = 0;
    mouseActive = false;
  }
//
  let webs = [];
  let stuckBats = [];
  let webFadeIn = 0;

  function initWebsAndBats() {
    webs = [];
    stuckBats = [];
    const small = isSmallScreen();
    const minDim = Math.min(width, height);

    const webTopRight = createInteractiveWeb(1, width, height, minDim * (small ? 0.28 : 0.24), randInt(7, 8), randInt(5, 6), 101);
    webs.push(webTopRight);

    const webTopLeft = createInteractiveWeb(0, width, height, minDim * (small ? 0.20 : 0.17), randInt(5, 6), randInt(4, 5), 202);
    webs.push(webTopLeft);

    if (!small) {
      webs.push(createInteractiveWeb(3, width, height, minDim * 0.13, 5, 3, 303));
      webs.push(createInteractiveWeb(2, width, height, minDim * 0.14, 5, 4, 404));
    }

    if (webTopRight.nodes[3]?.[2]) {
      const nodeA = webTopRight.nodes[3][2];
      stuckBats.push({
        web: webTopRight,
        node: nodeA,
        x: nodeA.baseX,
        y: nodeA.baseY,
        size: small ? 14 : 17,
        flap: rand(0, TWO_PI),
        flapSpeed: rand(0.012, 0.022),
        struggleBurst: 0,
        struggleTimer: rand(100, 240),
        tilt: 0.18,
        alpha: 0
      });
    }

    if (!small && webTopLeft.nodes[2]?.[2]) {
      const nodeB = webTopLeft.nodes[2][2];
      stuckBats.push({
        web: webTopLeft,
        node: nodeB,
        x: nodeB.baseX,
        y: nodeB.baseY,
        size: 14,
        flap: rand(0, TWO_PI),
        flapSpeed: rand(0.010, 0.018),
        struggleBurst: 0,
        struggleTimer: rand(160, 320),
        tilt: -0.22,
        alpha: 0
      });
    }
  }
//
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = canvas.parentElement?.clientWidth || window.innerWidth;
    height = canvas.parentElement?.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    initWebsAndBats();
  }

  let slowFrames = 0;
  let isLowPerformance = false;
  let frameCounter = 0;
//
  function updateWebPhysics(delta) {
    if (isLowPerformance && frameCounter % 2 !== 0) return;

    const decay = Math.pow(0.92, delta);
    const mouseRadius = isLowPerformance ? 70 : 100;

    for (const web of webs) {
      for (const radialNodes of web.nodes) {
        for (const node of radialNodes) {
          if (node.pinned) continue;

          if (mouseActive) {
            const dx = node.x - mouseX;
            const dy = node.y - mouseY;
            const dist = Math.hypot(dx, dy);

            if (dist < mouseRadius) {
              const proximity = (1 - dist / mouseRadius);
              const safeDist = dist > 1 ? dist : 1;
              const force = isLowPerformance ? 0.6 : 0.9;
              node.vx += (dx / safeDist) * proximity * force + mouseVx * proximity * 0.10;
              node.vy += (dy / safeDist) * proximity * force + mouseVy * proximity * 0.10;
            }
          }

          const spring = 0.055;
          node.vx += (node.baseX - node.x) * spring;
          node.vy += (node.baseY - node.y) * spring;

          node.vx *= decay;
          node.vy *= decay;
          node.x += node.vx * delta;
          node.y += node.vy * delta;
        }
      }
    }
  }
//
  function renderSpiderwebs() {
    const alpha = clamp(webFadeIn, 0, 1);
    if (alpha <= 0) return;

    ctx.save();
    ctx.lineCap = 'round';

    for (const web of webs) {
      ctx.globalAlpha = web.opacity * alpha;
      ctx.strokeStyle = webColor;
      ctx.lineWidth = 0.65;

      for (let i = 0; i < web.radialCount; i++) {
        const radialNodes = web.nodes[i];
        if (!radialNodes || radialNodes.length === 0) continue;

        ctx.beginPath();
        ctx.moveTo(web.cx, web.cy);
        for (const node of radialNodes) {
          ctx.lineTo(node.x, node.y);
        }
        ctx.stroke();
      }

      for (let r = 0; r < web.ringCount; r++) {
        ctx.beginPath();
        for (let i = 0; i < web.radialCount - 1; i++) {
          const p1 = web.nodes[i][r];
          const p2 = web.nodes[i + 1][r];
          if (!p1 || !p2) continue;

          if (i === 0) ctx.moveTo(p1.x, p1.y);

          const midX = (p1.x + p2.x) * 0.5;
          const midY = (p1.y + p2.y) * 0.5;
          const cpX = midX - (midX - web.cx) * 0.08;
          const cpY = midY - (midY - web.cy) * 0.08;

          ctx.quadraticCurveTo(cpX, cpY, p2.x, p2.y);
        }
        ctx.stroke();
      }

      if (mouseActive) {
        ctx.fillStyle = webGlowColor;
        for (const radialNodes of web.nodes) {
          for (const node of radialNodes) {
            const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
            if (dist < 75) {
              const dewAlpha = (1 - dist / 75) * 0.75;
              ctx.globalAlpha = dewAlpha * alpha;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 1.1, 0, TWO_PI);
              ctx.fill();
            }
          }
        }
      }
    }

    ctx.restore();
  }
//
  function renderStuckBats(delta) {
    for (const bat of stuckBats) {
      bat.alpha = clamp(bat.alpha + 0.02 * delta, 0, 0.85);

      bat.x += (bat.node.x - bat.x) * 0.12 * delta;
      bat.y += (bat.node.y - bat.y) * 0.12 * delta;

      bat.struggleTimer -= delta;
      if (bat.struggleTimer <= 0) {
        bat.struggleBurst = rand(24, 55);
        bat.struggleTimer = rand(140, 300);
      }

      if (bat.struggleBurst > 0) {
        bat.struggleBurst -= delta;
        bat.flap += bat.flapSpeed * 2.8 * delta;
        bat.node.vx += (Math.random() - 0.5) * 0.15;
        bat.node.vy += (Math.random() - 0.5) * 0.15;
      } else {
        bat.flap += bat.flapSpeed * delta;
      }

      const subtleJitter = Math.sin(bat.flap * 2.5) * 0.2;

      ctx.save();
      ctx.translate(bat.x + subtleJitter, bat.y + subtleJitter);
      ctx.rotate(bat.tilt);
      ctx.globalAlpha = bat.alpha;
      drawTangledBat(ctx, bat.size, bat.flap, batFill, batShadowColor);
      ctx.restore();
    }
  }
//
  function renderStaticFrame() {
    ctx.clearRect(0, 0, width, height);
    webFadeIn = 1.0;
    renderSpiderwebs();

    if (webs.length > 0 && webs[0].nodes[3]?.[2]) {
      const node = webs[0].nodes[3][2];
      ctx.save();
      ctx.translate(node.baseX, node.baseY);
      ctx.rotate(0.18);
      ctx.globalAlpha = 0.80;
      drawTangledBat(ctx, 16, 0.4, batFill, batShadowColor);
      ctx.restore();
    }
  }
//
  function frame(now) {
    animId = null;
    if (stopped || !visible) return;

    if (!lastTime) lastTime = now;
    const rawDelta = (now - lastTime) / 16.667;
    const delta = Math.min(rawDelta, 3.5);
    lastTime = now;
    frameCounter++;

    if (rawDelta > 1.6) {
      slowFrames++;
      if (slowFrames > 6) isLowPerformance = true;
    } else if (slowFrames > 0) {
      slowFrames--;
      if (slowFrames === 0) isLowPerformance = false;
    }

    if (prefersReducedMotion) {
      renderStaticFrame();
      return;
    }

    ctx.clearRect(0, 0, width, height);

    webFadeIn = clamp(webFadeIn + 0.02 * delta, 0, 1);
    updateWebPhysics(delta);

    renderSpiderwebs();
    renderStuckBats(delta);

    animId = requestAnimationFrame(frame);
  }
  //
  function onVisibilityChange() {
    visible = !document.hidden;
    if (!visible) {
      if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
      return;
    }
    lastTime = 0;
    if (animId === null && !stopped) {
      if (prefersReducedMotion) renderStaticFrame();
      else animId = requestAnimationFrame(frame);
    }
  }

  function onMotionChange(e) {
    prefersReducedMotion = e.matches;
    if (prefersReducedMotion) {
      if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
      renderStaticFrame();
    } else {
      if (animId === null && !stopped) animId = requestAnimationFrame(frame);
    }
  }

  const motionMedia = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  motionMedia?.addEventListener?.('change', onMotionChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave);

  resize();
  if (prefersReducedMotion) {
    renderStaticFrame();
  } else {
    animId = requestAnimationFrame(frame);
  }
//
  return function stop() {
    if (stopped) return;
    stopped = true;
    if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
    themeObserver.disconnect();
    motionMedia?.removeEventListener?.('change', onMotionChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerleave', onPointerLeave);
    stuckBats = [];
    webs = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}

// contributors: @paccman-0