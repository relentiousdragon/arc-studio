const CATCH_SELECTOR =
  ".catch-snow-btn, .catch-snow-button, .catch-snow-element";

const MAX_SETTLED_FLAKES = 500;
//
function getFlakeCount() {
  const area = window.innerWidth * window.innerHeight;
  let count = Math.round(area / 10000);
  count = Math.max(12, Math.min(120, count));

  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  const saveData = Boolean(connection?.saveData);
  const lowMemory =
    typeof navigator.deviceMemory === "number" &&
    navigator.deviceMemory <= 2;
  const lowCPU =
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency <= 4;

  if (saveData || lowMemory || lowCPU) {
    count = Math.round(count * 0.55);
  }

  return Math.max(8, count);
}
export function startSnow(canvas) {
  if (!canvas) return () => {};

  const motionPreference = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  );

  if (motionPreference?.matches) return () => {};

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const root =
    canvas.closest(".auth-screen") || canvas.parentElement || document.body;

  const maskCanvas = document.createElement("canvas");
  const mctx = maskCanvas.getContext("2d", {
    willReadFrequently: true
  });

  if (!mctx) return () => {};

  const themeRoot = canvas.closest("[data-theme]");
  const readFlakeColor = () =>
    window
      .getComputedStyle(canvas)
      .getPropertyValue("--snow-color")
      .trim() || "rgba(255, 255, 255, 0.85)";
  let flakeColor = readFlakeColor();

  let maskData = null;
  let flakes = [];
  let settledSnow = [];
  let animationFrameId = null;
  let bindIntervalId = null;
  let isPageVisible = !document.hidden;
  let stopped = false;
  let battery = null;
  let lowBattery = false;
  let maxFlakes = getFlakeCount();

  const boundClicks = new Map();

  function updateFlakeLimit() {
    const baseCount = getFlakeCount();
    maxFlakes = lowBattery
      ? Math.max(8, Math.round(baseCount * 0.45))
      : baseCount;

    while (flakes.length > maxFlakes) {
      flakes.pop();
    }
  }

  function updateBatteryMode() {
    lowBattery = Boolean(
      battery && !battery.charging && battery.level <= 0.2
    );
    updateFlakeLimit();
  }

  if (typeof navigator.getBattery === "function") {
    navigator
      .getBattery()
      .then((result) => {
        if (stopped) return;
        battery = result;
        updateBatteryMode();
        battery.addEventListener("levelchange", updateBatteryMode);
        battery.addEventListener("chargingchange", updateBatteryMode);
      })
      .catch(() => {});
  }

  function addSnowClasses() {
    root
      .querySelectorAll(".auth-submit:not(.catch-snow-btn)")
      .forEach((el) => el.classList.add("catch-snow-btn"));

    root
      .querySelectorAll(".auth-card:not(.catch-snow-element)")
      .forEach((el) => el.classList.add("catch-snow-element"));
  }

  const observer = new MutationObserver(addSnowClasses);

  observer.observe(root, {
    childList: true,
    subtree: true
  });

  const themeObserver = themeRoot
    ? new MutationObserver(() => {
        flakeColor = readFlakeColor();
      })
    : null;

  themeObserver?.observe(themeRoot, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });

  addSnowClasses();

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);

    maskCanvas.width = window.innerWidth;
    maskCanvas.height = window.innerHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    updateFlakeLimit();
    generateCollisionMask();
  }

  function generateCollisionMask() {
    mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    root.querySelectorAll(CATCH_SELECTOR).forEach((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const borderRadius = parseFloat(style.borderRadius) || 0;

      mctx.save();
      mctx.fillStyle = "#ff0000";

      if (borderRadius > 0) {
        mctx.beginPath();
        mctx.roundRect(
          rect.left,
          rect.top,
          rect.width,
          rect.height,
          borderRadius
        );
        mctx.fill();
      } else if (el.classList.contains("catch-snow-text")) {
        mctx.font =
          `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        mctx.textAlign = "left";
        mctx.textBaseline = "top";

        if ("letterSpacing" in mctx) {
          mctx.letterSpacing = style.letterSpacing;
        }

        let mobileOffset = 8;
        let desktopOffset = 17;

        el.classList.forEach((className) => {
          if (className.startsWith("snow-offset-")) {
            const parts = className
              .replace("snow-offset-", "")
              .split("_");

            if (parts.length === 2) {
              mobileOffset = parseFloat(parts[0]);
              desktopOffset = parseFloat(parts[1]);
            }
          }
        });

        const yOffset =
          window.innerWidth <= 768 ? mobileOffset : desktopOffset;

        const range = document.createRange();
        const nodeIterator = document.createNodeIterator(
          el,
          NodeFilter.SHOW_TEXT
        );

        let textNode;

        while ((textNode = nodeIterator.nextNode())) {
          const words = textNode.nodeValue.split(/(\s+)/);
          let currentCharIndex = 0;

          words.forEach((word) => {
            if (word.trim().length > 0) {
              range.setStart(textNode, currentCharIndex);
              range.setEnd(
                textNode,
                currentCharIndex + word.length
              );

              for (const textRect of range.getClientRects()) {
                let renderText = word;

                if (style.textTransform === "uppercase") {
                  renderText = renderText.toUpperCase();
                } else if (style.textTransform === "lowercase") {
                  renderText = renderText.toLowerCase();
                }

                mctx.fillText(
                  renderText,
                  textRect.left,
                  textRect.top + yOffset
                );
              }
            }

            currentCharIndex += word.length;
          });
        }
      } else {
        mctx.fillRect(
          rect.left,
          rect.top,
          rect.width,
          rect.height
        );
      }

      mctx.restore();
    });

    maskData = mctx.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    ).data;
  }

  function checkMaskCollision(x, y) {
    if (!maskData) return false;

    const ix = Math.floor(x);
    const iy = Math.floor(y);

    if (
      ix < 0 ||
      ix >= maskCanvas.width ||
      iy < 0 ||
      iy >= maskCanvas.height
    ) {
      return false;
    }

    const index = (iy * maskCanvas.width + ix) * 4;
    return maskData[index] > 200;
  }

  function createFlake(x, y) {
    return {
      x: x !== undefined ? x : Math.random() * window.innerWidth,
      y: y !== undefined ? y : -10,
      r: Math.random() * 2 + 1,
      vy: Math.random() * 1.2 + 0.6,
      vx: Math.random() * 0.4 - 0.2
    };
  }

  for (let i = 0; i < maxFlakes; i++) {
    flakes.push(
      createFlake(
        Math.random() * window.innerWidth,
        Math.random() * window.innerHeight
      )
    );
  }

  function releaseAllSettledSnow() {
    if (settledSnow.length > 0) {
      const targets = Array.from(
        root.querySelectorAll(CATCH_SELECTOR)
      ).map((el) => el.getBoundingClientRect());

      settledSnow.forEach((snow) => {
        if (snow.y < window.innerHeight) {
          let startY = snow.y;

          for (const target of targets) {
            if (
              snow.x >= target.left &&
              snow.x <= target.right &&
              snow.y >= target.top - 5 &&
              snow.y <= target.top + 5
            ) {
              startY = target.top + 3;
              break;
            }
          }

          flakes.push({
            x: snow.x,
            y: startY,
            r: snow.r,
            vy: Math.random() * 0.8 + 1.0,
            vx: Math.random() * 0.8 - 0.4,
            isReleased: true
          });
        }
      });

      settledSnow = [];
      updateFlakeLimit();
    }

    generateCollisionMask();
  }

  function bindButtonClicks() {
    root.querySelectorAll(CATCH_SELECTOR).forEach((el) => {
      if (boundClicks.has(el)) return;

      const handler = () => releaseAllSettledSnow();

      boundClicks.set(el, handler);
      el.addEventListener("click", handler);
    });
  }

  root.addEventListener("scroll", releaseAllSettledSnow, {
    passive: true
  });

  bindButtonClicks();
  bindIntervalId = setInterval(bindButtonClicks, 300);

  function draw() {
    animationFrameId = null;

    if (stopped || !isPageVisible) return;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = flakeColor;

    settledSnow.forEach((snow) => {
      ctx.beginPath();
      ctx.arc(snow.x, snow.y, snow.r, 0, Math.PI * 2);
      ctx.fill();
    });

    const targets = Array.from(root.querySelectorAll(CATCH_SELECTOR)).map(
      (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          radius: parseFloat(style.borderRadius) || 0
        };
      }
    );

    ctx.beginPath();

    for (let i = flakes.length - 1; i >= 0; i--) {
      const flake = flakes[i];

      ctx.moveTo(flake.x, flake.y);
      ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);

      flake.y += flake.vy;
      flake.x += flake.vx;

      let landed = false;

      for (const target of targets) {
        if (
          flake.x > target.left &&
          flake.x < target.right &&
          flake.y >= target.top - 2 &&
          flake.y <= target.top + flake.vy + 1
        ) {
          if (target.radius > 0) {
            const relativeX = flake.x - target.left;
            const relativeY = flake.y - target.top;

            if (
              relativeX < target.radius &&
              relativeY < target.radius &&
              Math.hypot(
                target.radius - relativeX,
                target.radius - relativeY
              ) > target.radius
            ) {
              continue;
            }

            if (
              relativeX > target.width - target.radius &&
              relativeY < target.radius &&
              Math.hypot(
                relativeX - (target.width - target.radius),
                target.radius - relativeY
              ) > target.radius
            ) {
              continue;
            }
          }

          settledSnow.push({
            x: flake.x,
            y: target.top - 1,
            r: flake.r
          });

          landed = true;
          break;
        }
      }

      if (!landed) {
        const isCollidingNow = checkMaskCollision(flake.x, flake.y);
        const wasCollidingBefore = checkMaskCollision(
          flake.x,
          flake.y - flake.vy
        );

        if (isCollidingNow && !wasCollidingBefore) {
          settledSnow.push({
            x: flake.x,
            y: flake.y - 1,
            r: flake.r
          });
          landed = true;
        }
      }

      if (landed) {
        flakes.splice(i, 1);

        if (flakes.length < maxFlakes) {
          flakes.push(createFlake());
        }
      } else if (flake.y > window.innerHeight) {
        if (flake.isReleased) {
          flakes.splice(i, 1);
        } else {
          flakes[i] = createFlake();
        }
      }
    }

    ctx.fill();

    if (settledSnow.length > MAX_SETTLED_FLAKES) {
      settledSnow.shift();
    }

    animationFrameId = requestAnimationFrame(draw);
  }

  function onVisibilityChange() {
    isPageVisible = !document.hidden;

    if (!isPageVisible) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      return;
    }

    if (animationFrameId === null && !stopped) {
      animationFrameId = requestAnimationFrame(draw);
    }
  }

  function onMotionPreferenceChange(event) {
    if (event.matches) stop();
  }

  function stop() {
    if (stopped) return;
    stopped = true;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (bindIntervalId !== null) {
      clearInterval(bindIntervalId);
      bindIntervalId = null;
    }

    observer.disconnect();
    themeObserver?.disconnect();
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("scroll", releaseAllSettledSnow);
    root.removeEventListener("scroll", releaseAllSettledSnow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    motionPreference?.removeEventListener?.(
      "change",
      onMotionPreferenceChange
    );

    if (battery) {
      battery.removeEventListener("levelchange", updateBatteryMode);
      battery.removeEventListener("chargingchange", updateBatteryMode);
      battery = null;
    }

    boundClicks.forEach((handler, el) => {
      el.removeEventListener("click", handler);
    });
    boundClicks.clear();

    flakes = [];
    settledSnow = [];
    maskData = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  motionPreference?.addEventListener?.(
    "change",
    onMotionPreferenceChange
  );

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  setTimeout(() => {
    if (!stopped) generateCollisionMask();
  }, 400);

  animationFrameId = requestAnimationFrame(draw);

  return stop;
}

// Contributors: @kipBO, @relentiousdragon
