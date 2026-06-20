/**
 * App.jsx — ResilienceHub
 *
 * State machine:
 *   'landing'   → Beacon Atlas marketing page (existing template)
 *   'upload'    → UploadZone (document input)
 *   'analyzing' → Processing state (Guardian + Simplifier running)
 *   'results'   → CrisisActionRoom (analysis output)
 *
 * The landing page stays mounted in all states (display:none when hidden)
 * so its scroll animations don't reset when returning from the product.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import beaconSource from '../src/Beacon Atlas ver 1.0.1.dc.html?raw';

import CrisisActionRoom from './components/CrisisActionRoom';
import AuthGate from './components/AuthGate';
import Dashboard from './components/Dashboard';

import { runGuardian } from './agents/guardian';
import { runSimplifier } from './agents/simplifier';
import { rehydrateDeep } from './agents/rehydrate';
import { supabase } from './lib/supabaseClient';
import { saveReport } from './lib/reports';

import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { merge as topoMerge, mesh as topoMesh } from 'topojson-client';
import worldData from './data/world-110m.json';

// ─── Beacon Atlas template helpers (unchanged from original) ───────────────

// The headline the .dc.html ships with as its default (see data-props in the file).
const HEADLINE = 'Understand any document. Act in time.';

function buildBeaconTemplate() {
  const style = beaconSource.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const root = beaconSource.match(
    /<div ref="\{\{ rootRef \}\}"([^>]*)>([\s\S]*)<\/div>\s*<\/x-dc>/
  );

  if (!root) {
    return {
      style,
      markup: '<div data-beacon-root>Beacon Atlas template could not be loaded.</div>',
    };
  }

  const [, attrs, inner] = root;
  const markup = `<div data-beacon-root${attrs}>${inner}</div>`
    .replaceAll('{{ headline }}', HEADLINE)
    .replaceAll('ref="{{ globeRef }}"', 'data-globe-canvas=""')
    .replaceAll('ref="{{ auroraRef }}"', 'data-aurora-canvas=""');

  return { style, markup };
}

function installHoverStyles(root) {
  return [...root.querySelectorAll('[style-hover]')].map((element) => {
    const baseStyle = element.getAttribute('style') || '';
    const hoverStyle = element.getAttribute('style-hover') || '';
    const activeStyle = `${baseStyle}${baseStyle.endsWith(';') ? '' : ';'}${hoverStyle}`;

    const show = () => element.setAttribute('style', activeStyle);
    const hide = () => element.setAttribute('style', baseStyle);

    element.addEventListener('mouseenter', show);
    element.addEventListener('mouseleave', hide);
    element.addEventListener('focus', show);
    element.addEventListener('blur', hide);

    return () => {
      element.removeEventListener('mouseenter', show);
      element.removeEventListener('mouseleave', hide);
      element.removeEventListener('focus', show);
      element.removeEventListener('blur', hide);
    };
  });
}

function revealBeaconContent(root) {
  root.querySelectorAll('[data-reveal]').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
  root.querySelectorAll('[data-tcard]').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
  root.querySelectorAll('[data-word]').forEach((el) => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
  ['[data-global-text]', '[data-global-stats]', '[data-clarity-panel]', '[data-clarity-tag]', '[data-tconn]'].forEach((selector) => {
    const el = root.querySelector(selector);
    if (el) {
      el.style.opacity = '1';
      el.style.transform = selector === '[data-clarity-tag]' ? 'translateX(-50%)' : 'none';
    }
  });
}

const hexRgba = (hex, alpha) => {
  let clean = (hex || '').trim().replace('#', '');
  if (clean.length === 3) clean = clean.split('').map((char) => char + char).join('');
  const value = parseInt(clean || '5b8cff', 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
};

// Animated WebGL aurora behind the hero (ported from the .dc.html DCLogic.initAurora).
function initAurora(root, reduce) {
  const canvas = root.querySelector('[data-aurora-canvas]');
  if (!canvas) return null;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
    || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  let running = true;
  let raf = 0;
  const start = performance.now();
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  const MAX = 8;
  const clicks = [];

  const vsrc = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
  const fsrc = "precision highp float;\nuniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;\nuniform vec2 uClicks[8]; uniform float uLife[8]; uniform int uN;\nfloat hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\nfloat noise(vec2 p){ vec2 i=floor(p),f=fract(p); float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }\nfloat fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.02; a*=.5; } return v; }\nvoid main(){\n  vec2 uv = gl_FragCoord.xy/uRes.xy;\n  float asp = uRes.x/uRes.y;\n  vec2 auv = vec2(uv.x*asp, uv.y);\n  vec2 am = vec2(uMouse.x*asp, uMouse.y);\n  float t = uTime*0.12;\n  vec2 p = auv*2.2;\n  p += (am - auv)*0.30*exp(-distance(auv,am)*1.4);\n  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2,1.3) - t*0.8));\n  vec2 r = vec2(fbm(p + 2.0*q + vec2(1.7,9.2) + t*0.6), fbm(p + 2.0*q + vec2(8.3,2.8) - t*0.5));\n  float f = clamp(fbm(p + 2.2*r),0.0,1.0);\n  vec3 deep = vec3(0.015,0.035,0.075);\n  vec3 mid  = vec3(0.04,0.20,0.46);\n  vec3 hi   = vec3(0.22,0.58,0.96);\n  vec3 col = mix(deep, mid, smoothstep(0.25,0.6,f));\n  col = mix(col, hi, smoothstep(0.5,0.92,f*f));\n  float dm = distance(auv, am);\n  col += hi*0.20*exp(-dm*2.0)*(0.6+0.4*f);\n  float vig = smoothstep(1.18,0.32,distance(uv,vec2(0.5)));\n  col *= mix(0.42,1.0,vig);\n  for(int i=0;i<8;i++){\n    if(i>=uN) break;\n    vec2 cp = vec2(uClicks[i].x*asp, uClicks[i].y);\n    float life = uLife[i];\n    float dd = distance(auv, cp);\n    float grow = 1.0-life;\n    float rad = mix(7.5, 2.3, grow);\n    float nz = fbm(auv*7.0 + uTime*0.45 + float(i)*4.0);\n    float amt = exp(-dd*rad)*(0.45+0.85*nz)*life*life;\n    vec3 redc = mix(vec3(1.0,0.12,0.22), vec3(1.0,0.6,0.25), nz*0.7);\n    col += redc*amt*1.7;\n  }\n  col = pow(col, vec3(0.92));\n  gl_FragColor = vec4(col,1.0);\n}";

  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('aurora shader', gl.getShaderInfoLog(shader));
    }
    return shader;
  };

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (name) => gl.getUniformLocation(program, name);
  const uRes = U('uRes');
  const uTime = U('uTime');
  const uMouse = U('uMouse');
  const uClicks = U('uClicks[0]') || U('uClicks');
  const uLife = U('uLife[0]') || U('uLife');
  const uN = U('uN');

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  const onMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      mouse.tx = (event.clientX - rect.left) / rect.width;
      mouse.ty = 1 - (event.clientY - rect.top) / rect.height;
    }
  };
  const onDown = (event) => {
    if (event.target?.closest?.('a,button,nav,[data-nav]')) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    clicks.push({ x, y, t0: performance.now() });
    if (clicks.length > MAX) clicks.shift();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });

  const LIFE = 2800;
  const positions = new Float32Array(MAX * 2);
  const lives = new Float32Array(MAX);

  const draw = () => {
    if (!running) return;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const now = performance.now();
    for (let i = clicks.length - 1; i >= 0; i -= 1) {
      if (now - clicks[i].t0 > LIFE) clicks.splice(i, 1);
    }
    const count = Math.min(MAX, clicks.length);
    for (let i = 0; i < count; i += 1) {
      positions[i * 2] = clicks[i].x;
      positions[i * 2 + 1] = clicks[i].y;
      lives[i] = 1 - (now - clicks[i].t0) / LIFE;
    }
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1i(uN, count);
    if (count > 0) {
      gl.uniform2fv(uClicks, positions.subarray(0, count * 2));
      gl.uniform1fv(uLife, lives.subarray(0, count));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (reduce) return;
    raf = requestAnimationFrame(draw);
  };
  draw();

  return {
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    },
  };
}

// Smooth scroll used by the nav links (ported from DCLogic.smoothScrollTo).
function makeSmoothScroller() {
  let scrollRaf = 0;
  return (destY) => {
    cancelAnimationFrame(scrollRaf);
    const startY = window.scrollY || window.pageYOffset;
    const dist = destY - startY;
    const duration = Math.min(900, Math.max(360, Math.abs(dist) * 0.5));
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, startY + dist * ease(t));
      if (t < 1) scrollRaf = requestAnimationFrame(step);
    };
    scrollRaf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(scrollRaf);
  };
}

function useBeaconAnimations(hostRef, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const host = hostRef.current;
    const root = host?.querySelector('[data-beacon-root]');
    if (!root) return undefined;
    const revealTimer = window.setTimeout(() => revealBeaconContent(root), 120);

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (start, end, amount) => start + (end - start) * amount;
    const hoverCleanups = installHoverStyles(root);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduce = Boolean(media?.matches);

    let pendingReveals = [...root.querySelectorAll('[data-reveal]')];
    let warned = false;
    const nav = root.querySelector('[data-nav]');
    const parallaxEls = [...root.querySelectorAll('[data-parallax]')];
    const scenes = [...root.querySelectorAll('[data-scene]')];
    const cache = {
      chips: [...root.querySelectorAll('[data-chip]')],
      clarityPanel: root.querySelector('[data-clarity-panel]'),
      clarityTag: root.querySelector('[data-clarity-tag]'),
      tdoc: root.querySelector('[data-tdoc]'),
      tconn: root.querySelector('[data-tconn]'),
      tcards: [...root.querySelectorAll('[data-tcard]')],
      pipeTrack: root.querySelector('[data-pipe-track]'),
      pipeProgress: root.querySelector('[data-pipe-progress]'),
      globalText: root.querySelector('[data-global-text]'),
      globalStats: root.querySelector('[data-global-stats]'),
      words: [...root.querySelectorAll('[data-word]')],
    };

    const sceneProblem = (progress) => {
      const eased = 1 - Math.pow(1 - clamp(progress / 0.8, 0, 1), 3);
      cache.chips.forEach((chip) => {
        const from = (chip.getAttribute('data-from') || '0,0,0').split(',').map(Number);
        const amount = 1 - eased;
        chip.style.transform = `translate(${from[0] * amount}px,${from[1] * amount}px) rotate(${from[2] * amount}deg) scale(${lerp(0.92, 1, eased)})`;
      });
      if (cache.clarityPanel) {
        cache.clarityPanel.style.opacity = clamp((eased - 0.4) / 0.5, 0, 1) * 0.9;
      }
      if (cache.clarityTag) {
        const tagProgress = clamp((eased - 0.6) / 0.4, 0, 1);
        cache.clarityTag.style.opacity = tagProgress;
        cache.clarityTag.style.transform = `translateX(-50%) translateY(${(1 - tagProgress) * 12}px)`;
      }
    };

    const sceneTransform = (progress) => {
      const slide = clamp(progress / 0.22, 0, 1);
      if (cache.tdoc) cache.tdoc.style.transform = `translateX(${lerp(120, 0, slide)}px)`;
      if (cache.tconn) cache.tconn.style.opacity = clamp((progress - 0.18) / 0.12, 0, 1);
      cache.tcards.forEach((card, index) => {
        const start = 0.3 + index * 0.125;
        const local = clamp((progress - start) / 0.14, 0, 1);
        const eased = 1 - Math.pow(1 - local, 3);
        card.style.opacity = eased;
        card.style.transform = `translateX(${(1 - eased) * 40}px)`;
      });
    };

    const scenePipelines = (progress) => {
      const track = cache.pipeTrack;
      if (!track) return;
      const maxOffset = track.scrollWidth - window.innerWidth + 40;
      const eased = clamp(progress, 0, 1);
      track.style.transform = `translateX(${-Math.max(0, maxOffset) * eased}px)`;
      if (cache.pipeProgress) cache.pipeProgress.style.width = `${14 + eased * 86}%`;
    };

    const sceneGlobal = (progress) => {
      if (cache.globalText) {
        const amount = clamp(progress / 0.35, 0, 1);
        cache.globalText.style.opacity = amount;
        cache.globalText.style.transform = `translateY(${(1 - amount) * 28}px)`;
      }
      if (cache.globalStats) {
        const amount = clamp((progress - 0.3) / 0.3, 0, 1);
        cache.globalStats.style.opacity = amount;
        cache.globalStats.style.transform = `translateY(${(1 - amount) * 20}px)`;
      }
    };

    const sceneMission = (progress) => {
      const words = cache.words;
      const count = words.length;
      words.forEach((word, index) => {
        const start = (index / count) * 0.62;
        const local = clamp((progress - start) / 0.16, 0, 1);
        word.style.opacity = (0.12 + 0.88 * local).toFixed(3);
        word.style.transform = `translateY(${(1 - local) * 10}px)`;
      });
    };

    const sceneHandlers = {
      problem: sceneProblem,
      transform: sceneTransform,
      pipelines: scenePipelines,
      global: sceneGlobal,
      mission: sceneMission,
    };

    // Realistic Earth globe (ported from "Globe Loader.html"): d3-geo
    // orthographic projection + topojson land/borders, a shaded sphere, a
    // graticule, and a tilted orbit ring with riding particles. Orbit colors
    // use the page accents so the ring reads against the dark hero.
    const initGlobe = () => {
      const canvas = root.querySelector('[data-globe-canvas]');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return null;

      const computed = getComputedStyle(root);
      const accentA = (computed.getPropertyValue('--a') || '#5b8cff').trim();
      const accentB = (computed.getPropertyValue('--b') || '#a06bff').trim();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const NAVY = '#16315c';

      let running = true;
      let raf = 0;
      let lambda = 0;
      let s = 1;                 // scale vs the loader's 240px design unit
      let cx = 0, cy = 0, R = 150;

      const projection = geoOrthographic().clipAngle(90);
      const path = geoPath(projection, ctx);
      const graticule = geoGraticule10();

      // World land + country borders (embedded data, no network).
      let land = null, borders = null;
      try {
        land = topoMerge(worldData, worldData.objects.countries.geometries);
        borders = topoMesh(worldData, worldData.objects.countries, (a, b) => a !== b);
      } catch (e) { /* still draw the shaded sphere + graticule */ }

      // Tilted 3D orbit rings; lengths are in the 240px design unit, scaled by s.
      const ELEV = 0.30;
      const sinE = Math.sin(ELEV), cosE = Math.cos(ELEV);
      const rings = [
        { rad: 206, phi: -0.34, w: 1.6, alpha: 0.55, color: accentA },
        { rad: 238, phi: -0.20, w: 1.1, alpha: 0.32, color: accentB },
      ];
      const particles = [];
      for (let i = 0; i < 22; i++) {
        const ring = i % 3 === 0 ? rings[1] : rings[0];
        particles.push({
          ring,
          t0: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 0.7,
          size: 1.6 + Math.random() * 3.0,
        });
      }

      const ringPoint = (ring, t) => {
        const X = Math.cos(t) * ring.rad * s;
        const Yp = Math.sin(t) * ring.rad * s;
        const sy = Yp * sinE;       // flatten into an ellipse
        const z = Yp * cosE;        // depth toward / away from viewer
        const cphi = Math.cos(ring.phi), sphi = Math.sin(ring.phi);
        const rx = X * cphi - sy * sphi;
        const ry = X * sphi + sy * cphi;
        return { x: cx + rx, y: cy - ry, z };
      };

      const drawRingPath = (ring, front) => {
        const STEP = 0.06;
        ctx.lineWidth = ring.w * s;
        ctx.lineCap = 'round';
        let drawing = false;
        for (let t = 0; t <= Math.PI * 2 + STEP; t += STEP) {
          const p = ringPoint(ring, t);
          if ((p.z >= 0) === front) {
            if (!drawing) { ctx.beginPath(); ctx.moveTo(p.x, p.y); drawing = true; }
            else ctx.lineTo(p.x, p.y);
          } else if (drawing) {
            ctx.strokeStyle = hexRgba(ring.color, front ? ring.alpha : ring.alpha * 0.5);
            ctx.stroke();
            drawing = false;
          }
        }
        if (drawing) {
          ctx.strokeStyle = hexRgba(ring.color, front ? ring.alpha : ring.alpha * 0.5);
          ctx.stroke();
        }
      };

      const drawParticles = (front, time) => {
        for (const p of particles) {
          const pt = ringPoint(p.ring, p.t0 + time * p.speed);
          if ((pt.z >= 0) !== front) continue;
          const depth = (pt.z / (p.ring.rad * s) + 1) / 2;   // 0 back .. 1 front
          const alpha = 0.20 + depth * 0.7;
          const sz = p.size * s * (0.55 + depth * 0.7);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, sz, 0, Math.PI * 2);
          ctx.fillStyle = hexRgba(p.ring.color, alpha);
          ctx.fill();
        }
      };

      const drawGlobe = () => {
        const g = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R * 1.05);
        g.addColorStop(0, '#eef0f5');
        g.addColorStop(1, '#cfd6e2');
        ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();

        ctx.beginPath(); path(graticule);
        ctx.strokeStyle = 'rgba(22,49,92,0.16)'; ctx.lineWidth = 1 * s; ctx.stroke();

        if (land) {
          ctx.beginPath(); path(land); ctx.fillStyle = NAVY; ctx.fill();
        }
        if (borders) {
          ctx.beginPath(); path(borders);
          ctx.strokeStyle = 'rgba(207,214,226,0.6)'; ctx.lineWidth = 0.6 * s; ctx.stroke();
        }

        ctx.beginPath(); path({ type: 'Sphere' });
        ctx.strokeStyle = NAVY; ctx.lineWidth = 2 * s; ctx.stroke();
      };

      const render = (time) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 1) back half of the orbit (partly hidden by the globe)
        for (const ring of rings) drawRingPath(ring, false);
        drawParticles(false, time);
        // 2) the opaque globe occludes the back orbit within its disc
        drawGlobe();
        // 3) front half of the orbit, over the globe
        for (const ring of rings) drawRingPath(ring, true);
        drawParticles(true, time);
      };

      const resize = () => {
        const size = canvas.clientWidth || 480;
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        cx = canvas.width / 2;
        cy = canvas.height / 2;
        s = (Math.min(canvas.width, canvas.height) / 2) / 240;
        R = 150 * s;
        projection.scale(R).translate([cx, cy]);
      };

      let startTs = null;
      const frame = (ts) => {
        if (!running) return;
        if (startTs === null) startTs = ts;
        const time = (ts - startTs) / 1000;
        lambda += 0.45;
        projection.rotate([lambda, -18, 0]);
        render(time);
        raf = requestAnimationFrame(frame);
      };

      resize();
      window.addEventListener('resize', resize);
      projection.rotate([lambda, -18, 0]);
      render(0);                 // immediate first paint
      raf = requestAnimationFrame(frame);
      return { stop: () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); } };
    };

    const globe = initGlobe();
    const aurora = initAurora(root, reduce);

    // Nav links jump to their target section with a smooth scroll.
    const smoothScrollTo = makeSmoothScroller();
    const jumpLinks = [...root.querySelectorAll('[data-jump]')];
    const onJump = (event) => {
      const target = root.querySelector(`#${event.currentTarget.getAttribute('data-jump')}`);
      if (!target) return;
      event.preventDefault();
      const navHeight = nav ? nav.getBoundingClientRect().height : 72;
      const destY = Math.max(0, window.scrollY + target.getBoundingClientRect().top - navHeight - 12);
      smoothScrollTo(destY);
    };
    jumpLinks.forEach((link) => link.addEventListener('click', onJump));

    const tick = () => {
      const viewportHeight = window.innerHeight;
      const scrollY = window.scrollY || window.pageYOffset;

      if (pendingReveals.length) {
        const trigger = viewportHeight * 0.88;
        pendingReveals = pendingReveals.filter((element) => {
          if (element.getBoundingClientRect().top < trigger) {
            element.style.transitionDelay = `${element.getAttribute('data-reveal-delay') || 0}ms`;
            element.style.opacity = '1';
            element.style.transform = 'none';
            return false;
          }
          return true;
        });
      }

      if (nav) {
        if (scrollY > 30) {
          nav.style.background = 'rgba(6,7,14,.72)';
          nav.style.backdropFilter = 'blur(14px)';
          nav.style.borderBottomColor = 'rgba(255,255,255,.07)';
        } else {
          nav.style.background = 'transparent';
          nav.style.backdropFilter = 'none';
          nav.style.borderBottomColor = 'transparent';
        }
      }

      if (!reduce) {
        parallaxEls.forEach((element) => {
          const speed = parseFloat(element.getAttribute('data-parallax'));
          const base = element.style.transform.includes('translateX(-50%)') ? 'translateX(-50%) ' : '';
          element.style.transform = `${base}translate3d(0,${-scrollY * speed}px,0)`;
        });
      }

      scenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        const total = rect.height - viewportHeight;
        const progress = clamp(total > 0 ? -rect.top / total : 0, 0, 1);
        sceneHandlers[scene.getAttribute('data-scene')]?.(progress);
      });
    };

    const safeTick = () => {
      try { tick(); }
      catch (error) {
        if (!warned) { console.warn('Beacon Atlas animation tick failed', error); warned = true; }
      }
    };

    const showStaticState = () => {
      revealBeaconContent(root);
    };

    if (reduce) {
      showStaticState();
      safeTick();
      return () => {
        window.clearTimeout(revealTimer);
        globe?.stop();
        aurora?.stop();
        jumpLinks.forEach((link) => link.removeEventListener('click', onJump));
        hoverCleanups.forEach((cleanup) => cleanup());
      };
    }

    const onScrollOrResize = () => safeTick();
    const settleTimers = [60, 200, 500, 1000].map((delay) => window.setTimeout(safeTick, delay));
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    safeTick();

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      window.clearTimeout(revealTimer);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      globe?.stop();
      aurora?.stop();
      jumpLinks.forEach((link) => link.removeEventListener('click', onJump));
      hoverCleanups.forEach((cleanup) => cleanup());
    };
  }, [hostRef, active]);
}

// ─── Analyzing state ────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Guardian running', sub: 'Scanning for PII and replacing with tokens' },
  { label: 'Sending tokenized text', sub: 'Your real values stay on this device' },
  { label: 'Simplifier agent', sub: 'Extracting actions and deadlines' },
  { label: 'Re-hydrating on device', sub: 'Swapping tokens back to your real values' },
];

function AnalyzingState({ step = 0 }) {
  return (
    <div
      className="product-shell"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 34,
        color: '#eef1f7',
        padding: 24,
      }}
    >
      <div style={{ position: 'relative', width: 116, height: 116 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,.14)',
            boxShadow: '0 0 70px rgba(91,140,255,.25)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 18,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#5b8cff',
            borderRightColor: '#a06bff',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ position:'absolute', inset:42, borderRadius:'50%', background:'linear-gradient(135deg,#5b8cff,#a06bff)', boxShadow:'0 0 24px rgba(91,140,255,.9)' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <span style={{ display:'block', marginBottom:12, color:'#5b8cff', fontFamily:"'IBM Plex Mono',monospace", fontSize:12, letterSpacing:'.18em', textTransform:'uppercase' }}>
          Secure pipeline in motion
        </span>
        <h1 style={{ margin: '0 0 8px', fontFamily:"'Archivo','D-DIN Bold',system-ui,sans-serif", fontSize: 'clamp(34px,5vw,58px)', lineHeight: .98, fontWeight: 900, textTransform:'uppercase', letterSpacing:'.01em' }}>
          Analyzing your document
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: '#98a2bb', lineHeight:1.6 }}>
          {STEPS[Math.min(step, STEPS.length - 1)].sub}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 520, padding:18, border:'1px solid rgba(255,255,255,.09)', borderRadius:22, background:'rgba(255,255,255,.035)', boxShadow:'0 24px 70px rgba(0,0,0,.22)' }}>
        {STEPS.map((s, i) => (
          <div
            key={s.label}
            style={{
              display: 'grid',
              gridTemplateColumns:'24px 1fr',
              alignItems: 'center',
              gap: 12,
              opacity: i <= step ? 1 : 0.25,
              transition: 'opacity .4s',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `2px solid ${i < step ? '#4ade80' : i === step ? '#5b8cff' : 'rgba(255,255,255,.15)'}`,
                background: i < step ? 'rgba(74,222,128,.15)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {i < step && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 3L9 1" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontSize: 14, color: i <= step ? '#eef1f7' : '#3a4255' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root component ─────────────────────────────────────────────────────────

function toAccount(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || (user.email ? user.email.split('@')[0] : 'You'),
  };
}

function readExtensionImport() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const text = params.get('extensionText');
  if (!text) return null;

  const source = params.get('extensionSource') || 'Chrome PDF import';
  params.delete('extensionText');
  params.delete('extensionSource');
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', nextUrl);

  return { text, source };
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [view, setView] = useState('landing');
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState('');
  const [extensionImport] = useState(readExtensionImport);

  const hostRef = useRef(null);
  const template = useMemo(buildBeaconTemplate, []);
  useBeaconAnimations(hostRef, view === 'landing');

  // ── Supabase auth session: hydrate on load + react to sign in/out ──────────
  useEffect(() => {
    if (extensionImport && !account) setView('login');
  }, [extensionImport, account]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user ?? null;
      if (user) {
        setAccount(toAccount(user));
        setView((v) => (v === 'landing' || v === 'login' || extensionImport ? 'dashboard' : v));
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAccount(toAccount(user));
      if (user) {
        setView((v) => (v === 'landing' || v === 'login' || extensionImport ? 'dashboard' : v));
      } else {
        setResult(null);
        setView('landing');
      }
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [extensionImport]);

  // Wire landing page "Try" buttons to account entry.
  useEffect(() => {
    if (view !== 'landing') return;
    const host = hostRef.current;
    if (!host) return;

    const timer = window.setTimeout(() => {
      const tryButtons = [...host.querySelectorAll('button')].filter((b) =>
        b.textContent.includes('Try') || b.textContent.includes('Get started')
      );
      const handler = () => setView(account ? 'dashboard' : 'login');
      tryButtons.forEach((b) => b.addEventListener('click', handler));
      return () => tryButtons.forEach((b) => b.removeEventListener('click', handler));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [view, account]);

  const handleLogout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setAccount(null);
    setResult(null);
    setView('landing');
  }, []);

  const handleAnalyze = useCallback(async (rawText, pipelineType = 'common', source = 'Uploaded document') => {
    setView('analyzing');
    setAnalyzeStep(0);
    setApiError('');
    setResult(null);

    try {
      // Step 0 — Guardian (client-side, synchronous)
      const { tokenized, mappingTable, stats } = runGuardian(rawText);
      setAnalyzeStep(1);

      // Small delay so the UI step is readable
      await new Promise((r) => setTimeout(r, 400));
      setAnalyzeStep(2);

      // Step 2 — Pipeline analysis (API call with TOKENIZED text)
      const analysis = await runSimplifier(tokenized, pipelineType);
      setAnalyzeStep(3);

      await new Promise((r) => setTimeout(r, 300));

      // Step 3 — Re-hydrate on device, render, and persist the structured plan.
      setResult({ analysis, mappingTable, guardianStats: stats, source, pipelineType });
      setView('results');

      // Best-effort save (real values, owner-scoped via RLS). Never blocks the UI.
      const rehydrated = rehydrateDeep(analysis, mappingTable);
      saveReport({ source, analysis: rehydrated }).catch((err) =>
        console.warn('[app] Could not save report:', err.message)
      );
    } catch (err) {
      setApiError(err.message ?? 'Something went wrong. Please try again.');
      setView('dashboard');
    }
  }, []);

  const handleReset = useCallback(() => {
    setView('dashboard');
    setResult(null);
    setApiError('');
  }, []);

  const handleBack = useCallback(() => {
    setView('landing');
    setResult(null);
    setApiError('');
    // Scroll landing page to top when returning
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenReport = useCallback((report) => {
    // Saved reports are already re-hydrated; no mapping table needed.
    setResult({ analysis: report.analysis, mappingTable: null, guardianStats: null, source: report.source });
    setView('results');
  }, []);

  return (
    <>
      {/* ── Landing page (always mounted, hidden when not active) ── */}
      <main
        className="beacon-app min-h-screen bg-[#06070e] text-[#eef1f7] font-ddin"
        style={{ display: view === 'landing' ? 'block' : 'none' }}
        aria-hidden={view !== 'landing'}
      >
        <style>{template.style}</style>
        <div ref={hostRef} dangerouslySetInnerHTML={{ __html: template.markup }} />
      </main>

      {/* ── Product overlay ── */}
      {view === 'login' && (
        <AuthGate onBack={handleBack} />
      )}

      {view === 'dashboard' && account && (
        <Dashboard
          account={account}
          onAnalyze={handleAnalyze}
          onBack={handleBack}
          onLogout={handleLogout}
          onOpenReport={handleOpenReport}
          initialError={apiError}
          initialText={extensionImport?.text || ''}
          initialSource={extensionImport?.source || ''}
        />
      )}

      {view === 'analyzing' && <AnalyzingState step={analyzeStep} />}

      {view === 'results' && result && (
        <CrisisActionRoom
          analysis={result.analysis}
          mappingTable={result.mappingTable}
          guardianStats={result.guardianStats}
          onReset={handleReset}
          onDashboard={handleReset}
        />
      )}
    </>
  );
}
