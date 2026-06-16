// 画像拡大用ライトボックスを生成する共通ヘルパー。
// dialog セマンティクス・閉じるボタン・フォーカス管理（開いた要素へ復帰）を備える。
function createLightbox(label) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', label);
  lb.setAttribute('tabindex', '-1');
  const img = document.createElement('img');
  img.alt = '';
  lb.appendChild(img);
  document.body.appendChild(lb);

  let lastFocused = null;
  function open(src, alt) {
    lastFocused = document.activeElement;
    img.src = src;
    img.alt = alt || '';
    lb.classList.add('open');
    document.documentElement.classList.add('lb-open'); // 背景スクロール禁止
    // visibility 切替直後はフォーカス不可なため次フレームで移す
    requestAnimationFrame(() => lb.focus());
  }
  function close() {
    if (!lb.classList.contains('open')) return;
    lb.classList.remove('open');
    document.documentElement.classList.remove('lb-open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }
  lb.addEventListener('click', close);
  // Tab はダイアログ内に閉じ込める
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); lb.focus(); }
  });
  // Escape はフォーカス位置に関わらず閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lb.classList.contains('open')) close();
  });
  return { open, close };
}

// Lightbox: グラフ（折れ線）の拡大。クリックでもキーボード（Enter / Space）でも開ける。
(function () {
  const figure = document.querySelector('.chart-figure');
  if (!figure) return;
  const chartImg = figure.querySelector('img');
  const box = createLightbox('アクセス推移グラフの拡大表示');
  // figure をボタン化してキーボード操作可能にする
  figure.setAttribute('role', 'button');
  figure.setAttribute('tabindex', '0');
  figure.setAttribute('aria-label', (chartImg.alt || 'グラフ') + '（拡大表示）');
  function activate() {
    // スマホは新しいタブで画像を直接表示
    if (window.matchMedia('(max-width: 768px)').matches) {
      window.open(chartImg.src, '_blank', 'noopener');
      return;
    }
    box.open(chartImg.src, chartImg.alt);
  }
  figure.addEventListener('click', activate);
  figure.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });
  // このスライダーは縦スクロール量で横位置が決まる設計。グラフは横移動するパネル内に
  // あるため、Tab でフォーカスが入ったらそのパネルが映る縦位置へ移動し、フォーカス中の
  // グラフを画面内に表示する。mandatory snap に引き戻されないよう一時的に snap を切る。
  figure.addEventListener('focus', () => {
    const groupSec = figure.closest('.group-section');
    const panel = figure.closest('.hpanel');
    if (!groupSec || !panel) return;
    const idx = [...groupSec.querySelectorAll('.hpanel')].indexOf(panel);
    if (idx < 0) return;
    const html = document.documentElement;
    const prev = html.style.scrollSnapType;
    html.style.scrollSnapType = 'none';
    // ブラウザ既定のフォーカス時スクロールが先に走るため、こちらは次フレームに
    // 遅延させて後勝ちさせる（mandatory snap も切ったまま着地させる）。
    requestAnimationFrame(() => {
      window.scrollTo({ top: groupSec.offsetTop + idx * window.innerHeight, behavior: 'instant' });
      requestAnimationFrame(() => { html.style.scrollSnapType = prev; });
    });
  });
})();

// Lightbox: .lb-trigger リンク（PC/SP で画像を出し分け）
(function () {
  const triggers = document.querySelectorAll('.lb-trigger');
  if (!triggers.length) return;
  const box = createLightbox('画像の拡大表示');
  triggers.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const src = window.matchMedia('(max-width: 768px)').matches
        ? btn.dataset.srcSp : btn.dataset.srcPc;
      box.open(src, btn.dataset.alt);
    });
  });
})();

// Reveal on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// Horizontal slide group — driven by NATIVE vertical scroll through a tall,
// pinned section. Works with wheel, trackpad, scrollbar, touch and keyboard
// because it never intercepts/cancels scrolling.
(function () {
  const section = document.querySelector('.group-section');
  const track = document.getElementById('hgroup1');
  if (!section || !track) return;
  const panels = track.querySelectorAll('.hpanel');
  const dots = document.querySelectorAll('#hgroup1-dots i');
  const nav = document.querySelector('.hgroup-nav');
  const btnPrev = nav.querySelector('[data-dir="-1"]');
  const btnNext = nav.querySelector('[data-dir="1"]');
  const last = panels.length - 1;

  // One panel per viewport of vertical scroll (the extra height past the last
  // panel is a "dwell" so the last panel doesn't jump straight to the next section).
  function panelX() {
    const scrolled = -section.getBoundingClientRect().top;
    return Math.min(Math.max(scrolled / window.innerHeight, 0), last);
  }

  function currentIndex() {
    return Math.round(panelX());
  }

  function render() {
    const x = panelX();
    track.style.transform = 'translateX(' + (-x * 100) + '%)';
    const nearest = Math.round(x);
    dots.forEach((d, i) => d.classList.toggle('active', i === nearest));
    btnPrev.disabled = nearest <= 0;
    btnNext.disabled = nearest >= last;
  }

  let raf;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }, { passive: true });
  window.addEventListener('resize', render, { passive: true });

  // Jump to a panel. Disable snap momentarily so the programmatic scroll lands
  // exactly (mandatory snap otherwise fights/redirects scrollTo).
  // Smoothly animate the page scroll (and therefore the horizontal slide) to a
  // panel — matches the feel of wheel scrolling. behavior:'smooth' is unreliable
  // here, so animate manually with rAF; snap is paused during the animation.
  let goRaf, goSafety;
  function goTo(i) {
    const idx = Math.min(Math.max(i, 0), last);
    const target = section.offsetTop + idx * window.innerHeight;
    const start = window.scrollY;
    const dist = target - start;
    if (Math.abs(dist) < 1) return;
    const html = document.documentElement;
    html.style.scrollSnapType = 'none';
    const dur = 450;
    let t0 = null;
    cancelAnimationFrame(goRaf);
    clearTimeout(goSafety);
    function done() {
      window.scrollTo({ top: target, behavior: 'instant' });
      render();
      html.style.scrollSnapType = '';
    }
    function step(ts) {
      if (t0 === null) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      window.scrollTo({ top: Math.round(start + dist * e), behavior: 'instant' });
      render();
      if (p < 1) goRaf = requestAnimationFrame(step);
      else done();
    }
    goRaf = requestAnimationFrame(step);
    // Safety: if rAF is paused (e.g. tab hidden), still settle on target.
    goSafety = setTimeout(done, dur + 250);
  }

  nav.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => goTo(currentIndex() + Number(b.dataset.dir)))
  );

  // Arrow keys when the section is pinned in view.
  window.addEventListener('keydown', (e) => {
    const r = section.getBoundingClientRect();
    if (r.top > 1 || r.bottom < window.innerHeight) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex() + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex() - 1); }
  });

  render();
})();

// Progress bar
const progress = document.getElementById('progress');
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const scrolled = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
  progress.style.width = scrolled + '%';
}, { passive: true });

// Right-side section dot navigation
(function () {
  const nav = document.getElementById('sectionNav');
  const sections = Array.from(document.querySelectorAll('section'));

  const links = sections.map((sec, i) => {
    if (!sec.id) sec.id = 'sec-' + i;
    const heading = sec.querySelector('h1, h2');
    let label = heading ? heading.textContent.trim().replace(/\s+/g, '') : '';
    if (sec.classList.contains('hero')) label = 'トップ';
    const a = document.createElement('a');
    a.href = '#' + sec.id;
    a.dataset.label = label;
    function go(e) {
      e.preventDefault();
      const html = document.documentElement;
      const prev = html.style.scrollSnapType;
      html.style.scrollSnapType = 'none';
      window.scrollTo({ top: sec.offsetTop, behavior: 'instant' });
      // 次フレームで戻す（同フレーム内だと mandatory snap が起動してしまう）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { html.style.scrollSnapType = prev; });
      });
    }
    a.addEventListener('click', go);
    // タッチ機器ではタップが click まで遅延することがあるため touchstart でも発火
    a.addEventListener('touchstart', go, { passive: false });
    nav.appendChild(a);
    return a;
  });

  // Scroll-position based active/dark detection — reliable with sticky stacking
  // (IntersectionObserver is unreliable here because many pinned sections overlap).
  let tops = [];
  function measure() {
    let acc = 0;
    tops = sections.map((s) => { const t = acc; acc += s.offsetHeight; return t; });
  }

  function update() {
    const yTop = window.scrollY + 1;
    let cur = 0;
    for (let i = 0; i < tops.length; i++) { if (tops[i] <= yTop) cur = i; }
    links.forEach((l, i) => l.classList.toggle('active', i === cur));
    const sec = sections[cur];
    const dark = sec.classList.contains('hero') || sec.classList.contains('end');
    nav.classList.toggle('on-dark', dark);
  }

  measure();
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', () => { measure(); update(); }, { passive: true });
})();

// ── スマホのピンチ操作中はスクロールスナップを一時無効化 ──
// ピンチで中途半端な位置に snap が走るのを防ぐ。指が全て離れた後、
// 少し遅延してから元の snap モードに戻す（その時点で最寄りに正しく吸着）。
(function () {
  const html = document.documentElement;
  let pinching = false;
  let savedSnapInline = null;
  let restoreTimer = null;

  function enterPinch() {
    if (pinching) return;
    pinching = true;
    clearTimeout(restoreTimer);
    savedSnapInline = html.style.scrollSnapType;
    html.style.scrollSnapType = 'none';
  }
  function scheduleExitPinch() {
    if (!pinching) return;
    pinching = false;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      html.style.scrollSnapType = savedSnapInline || '';
      savedSnapInline = null;
    }, 450);
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length >= 2) enterPinch();
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length >= 2) enterPinch();
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) scheduleExitPinch();
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    scheduleExitPinch();
  }, { passive: true });

  // visualViewport の zoom 変化でもピンチ判定（フォールバック）
  if (window.visualViewport) {
    let lastScale = window.visualViewport.scale;
    window.visualViewport.addEventListener('resize', () => {
      const s = window.visualViewport.scale;
      if (Math.abs(s - lastScale) > 0.02) {
        enterPinch();
        scheduleExitPinch();
      }
      lastScale = s;
    });
  }
})();
