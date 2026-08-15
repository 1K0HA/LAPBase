  // ===== МОСТ НАТИВНЫХ ФУНКЦИЙ ANDROID =====
  function nativeVibrate(type = 'click') {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.HapticFeedback) {
      try {
        if (type === 'heavy') tg.HapticFeedback.impactOccurred('medium');
        else tg.HapticFeedback.selectionChanged();
        return;
      } catch (_) {}
    }

    if (window.AndroidBridge && typeof window.AndroidBridge.vibrate === 'function') {
      window.AndroidBridge.vibrate(type);
    } else if (navigator.vibrate) {
      navigator.vibrate(type === 'heavy' ? 30 : 15);
    }
  }

  function nativeOpenUrl(url) {
    nativeVibrate('click');

    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      try {
        if (/^https:\/\/t\.me\//i.test(url) && typeof tg.openTelegramLink === 'function') {
          tg.openTelegramLink(url);
          return;
        }
        if (typeof tg.openLink === 'function') {
          tg.openLink(url);
          return;
        }
      } catch (_) {}
    }

    if (window.AndroidBridge && typeof window.AndroidBridge.openExternalUrl === 'function') {
      window.AndroidBridge.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  }


  // ===== APPEARANCE / THEME =====
  // Modes: auto = choose built-in Day/Night from Telegram colorScheme (OS fallback outside Telegram), light, dark.
  const APP_THEME_STORAGE_KEY = 'appThemeMode';
  const APP_THEME_MODES = new Set(['auto', 'light', 'dark']);
  let currentThemeMode = (() => {
    const saved = localStorage.getItem(APP_THEME_STORAGE_KEY);
    return APP_THEME_MODES.has(saved) ? saved : 'auto';
  })();
  let currentThemePalette = null;

  function getTelegramColorScheme() {
    const tg = window.Telegram && window.Telegram.WebApp;
    const scheme = tg && String(tg.colorScheme || '').toLowerCase();
    return scheme === 'light' || scheme === 'dark' ? scheme : null;
  }

  function getEnvironmentColorScheme() {
    const telegramScheme = getTelegramColorScheme();
    if (telegramScheme) return telegramScheme;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    } catch (_) {}
    return 'dark';
  }

  function getEffectiveAppTheme(mode = currentThemeMode) {
    return mode === 'light' || mode === 'dark' ? mode : getEnvironmentColorScheme();
  }

  function getBuiltInThemePalette(theme) {
    if (theme === 'light') {
      return {
        bg: '#f2f2f7',
        secondary: '#ffffff',
        section: '#ffffff',
        header: '#f2f2f7',
        bottom: '#f2f2f7',
        text: '#000000',
        hint: '#8e8e93',
        subtitle: '#8e8e93',
        sectionHeader: '#6d6d72',
        separator: '#c6c6c8',
        destructive: '#ff3b30'
      };
    }
    return {
      bg: '#000000',
      secondary: '#1c1c1e',
      section: '#1c1c1e',
      header: '#000000',
      bottom: '#1c1c1e',
      text: '#ffffff',
      hint: '#8e8e93',
      subtitle: '#8e8e93',
      sectionHeader: '#8e8e93',
      separator: '#38383a',
      destructive: '#ff453a'
    };
  }

  function getEffectiveThemePalette(mode = currentThemeMode, effectiveTheme = getEffectiveAppTheme(mode)) {
    // Auto never creates or mirrors a separate Telegram palette. It only reads
    // Telegram.WebApp.colorScheme to choose one of LAPBase's two canonical
    // themes. Therefore Auto-Light is pixel-identical to manual Day, and
    // Auto-Dark is pixel-identical to manual Night.
    return getBuiltInThemePalette(effectiveTheme);
  }

  function applyThemeCssVars(palette) {
    currentThemePalette = palette;
    const root = document.documentElement;
    const vars = {
      '--theme-bg': palette.bg,
      '--theme-secondary': palette.secondary,
      '--theme-section': palette.section,
      '--theme-text': palette.text,
      '--theme-hint': palette.hint,
      '--theme-subtitle': palette.subtitle,
      '--theme-separator': palette.separator,
      '--theme-destructive': palette.destructive
    };
    Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
  }

  function updateThemeControls() {
    const effectiveTheme = getEffectiveAppThemeThemeSafe();
    document.querySelectorAll('.theme-btn').forEach(btn => {
      const active = btn.dataset.themeMode === currentThemeMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const hint = document.getElementById('themeSettingHint');
    // i18n/currentLang are declared later in this file. The first theme apply
    // runs before those lexical bindings are initialized, so guard the lookup.
    let themeCopy = null;
    try {
      if (i18n && currentLang && i18n[currentLang]) themeCopy = i18n[currentLang];
    } catch (_) {}
    if (hint && themeCopy) {
      if (currentThemeMode === 'auto') {
        hint.textContent = effectiveTheme === 'light'
          ? themeCopy.themeAutoLightHint
          : themeCopy.themeAutoDarkHint;
      } else {
        hint.textContent = currentThemeMode === 'light'
          ? themeCopy.themeLightHint
          : themeCopy.themeDarkHint;
      }
    }
  }

  // Safe helper avoids any dependency on i18n initialization during early startup.
  function getEffectiveAppThemeThemeSafe() {
    return getEffectiveAppTheme(currentThemeMode);
  }

  function updateThemeMeta(effectiveTheme, palette = currentThemePalette) {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', (palette && palette.bg) || (effectiveTheme === 'light' ? '#f2f2f7' : '#000000'));
    const root = document.documentElement;
    root.style.colorScheme = effectiveTheme;
  }

  function applyAppTheme(mode = currentThemeMode, options = {}) {
    const { persist = true, vibrate = false, syncChrome = true } = options;
    if (!APP_THEME_MODES.has(mode)) mode = 'auto';
    currentThemeMode = mode;
    if (persist) localStorage.setItem(APP_THEME_STORAGE_KEY, mode);

    const effectiveTheme = getEffectiveAppTheme(mode);
    const palette = getEffectiveThemePalette(mode, effectiveTheme);
    const root = document.documentElement;
    root.dataset.themeMode = mode;
    root.dataset.theme = effectiveTheme;
    root.classList.toggle('theme-light', effectiveTheme === 'light');
    root.classList.toggle('theme-dark', effectiveTheme === 'dark');
    applyThemeCssVars(palette);
    updateThemeMeta(effectiveTheme, palette);
    updateThemeControls();

    if (vibrate) nativeVibrate('click');
    if (syncChrome && typeof window.__lapSyncTelegramChrome === 'function') {
      window.__lapSyncTelegramChrome();
    }
    requestAnimationFrame(() => {
      if (typeof updateIndicator === 'function') updateIndicator();
      window.scheduleAdaptiveGlassContrast?.();
    });
    return effectiveTheme;
  }

  function syncAppThemeFromEnvironment() {
    // Manual selections stay fixed. Auto follows Telegram colorScheme only and
    // applies the exact same built-in Day/Night palette as manual selection.
    if (currentThemeMode === 'auto') {
      applyAppTheme('auto', { persist: false, vibrate: false, syncChrome: false });
    } else {
      // Refresh the manual palette too, in case the page resumed from background.
      applyAppTheme(currentThemeMode, { persist: false, vibrate: false, syncChrome: false });
    }
    if (typeof window.__lapSyncTelegramChrome === 'function') window.__lapSyncTelegramChrome();
  }

  window.setAppTheme = function(mode) {
    applyAppTheme(mode, { persist: true, vibrate: true, syncChrome: true });
  };
  window.syncAppThemeFromEnvironment = syncAppThemeFromEnvironment;

  // Apply the saved preference immediately. The Telegram bridge is loaded in
  // <head>, so Auto can use WebApp.colorScheme before first paint.
  applyAppTheme(currentThemeMode, { persist: false, vibrate: false, syncChrome: false });

  try {
    const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (media) {
      const onNativeThemeChange = () => {
        if (!getTelegramColorScheme()) syncAppThemeFromEnvironment();
      };
      if (typeof media.addEventListener === 'function') media.addEventListener('change', onNativeThemeChange);
      else if (typeof media.addListener === 'function') media.addListener(onNativeThemeChange);
    }
  } catch (_) {}


  // ===== TELEGRAM MINI APP =====
  (function initTelegramMiniApp() {
    const tg = window.Telegram && window.Telegram.WebApp;
    const root = document.documentElement;

    const numberOrZero = value => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(0, number) : 0;
    };

    function syncTelegramSafeArea() {
      const supportsSafeArea = Boolean(
        tg && typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('8.0')
      );

      const jsSafeVars = [
        '--lap-js-safe-top','--lap-js-safe-bottom','--lap-js-safe-left','--lap-js-safe-right',
        '--lap-js-system-safe-top','--lap-js-system-safe-bottom','--lap-js-system-safe-left','--lap-js-system-safe-right',
        '--lap-js-content-safe-top','--lap-js-content-safe-bottom','--lap-js-content-safe-left','--lap-js-content-safe-right'
      ];

      if (!supportsSafeArea) {
        jsSafeVars.forEach(name => root.style.removeProperty(name));
        root.classList.toggle('tg-fullscreen', Boolean(tg && tg.isFullscreen));
        return;
      }

      const safe = tg.safeAreaInset || {};
      const content = tg.contentSafeAreaInset || {};
      const safeTop = numberOrZero(safe.top);
      const safeBottom = numberOrZero(safe.bottom);
      const safeLeft = numberOrZero(safe.left);
      const safeRight = numberOrZero(safe.right);
      const contentTop = numberOrZero(content.top);
      const contentBottom = numberOrZero(content.bottom);
      const contentLeft = numberOrZero(content.left);
      const contentRight = numberOrZero(content.right);

      const setPx = (name, value) => root.style.setProperty(name, `${Math.round(value)}px`);

      // Keep Telegram's two coordinate systems separate. The header consumes
      // both in fullscreen, while the legacy --lap-js-safe-* values keep the
      // rest of the application backward compatible.
      setPx('--lap-js-system-safe-top', safeTop);
      setPx('--lap-js-system-safe-bottom', safeBottom);
      setPx('--lap-js-system-safe-left', safeLeft);
      setPx('--lap-js-system-safe-right', safeRight);
      setPx('--lap-js-content-safe-top', contentTop);
      setPx('--lap-js-content-safe-bottom', contentBottom);
      setPx('--lap-js-content-safe-left', contentLeft);
      setPx('--lap-js-content-safe-right', contentRight);

      setPx('--lap-js-safe-top', Math.max(contentTop, safeTop));
      setPx('--lap-js-safe-bottom', Math.max(contentBottom, safeBottom));
      setPx('--lap-js-safe-left', Math.max(contentLeft, safeLeft));
      setPx('--lap-js-safe-right', Math.max(contentRight, safeRight));
      root.classList.toggle('tg-fullscreen', Boolean(tg.isFullscreen));
    }

    function detectTelegramPerformanceClass() {
      const match = navigator.userAgent.match(/Telegram-Android\/[^\s]+\s*\([^)]*;\s*(LOW|AVERAGE|HIGH)\)/i);
      const level = match ? match[1].toLowerCase() : 'unknown';
      root.dataset.tgPerformance = level;
      root.classList.toggle('tg-performance-low', level === 'low');
      root.classList.toggle('tg-performance-average', level === 'average');
      root.classList.toggle('tg-performance-high', level === 'high');
    }

    function syncTelegramThemeVars() {
      const effectiveTheme = getEffectiveAppTheme(currentThemeMode);
      const palette = getEffectiveThemePalette(currentThemeMode, effectiveTheme);
      applyThemeCssVars(palette);
      updateThemeMeta(effectiveTheme, palette);
    }

    function syncTelegramChrome() {
      if (!tg) return;
      syncTelegramThemeVars();

      const effectiveTheme = root.dataset.theme || getEffectiveAppTheme();
      const palette = currentThemePalette || getEffectiveThemePalette(currentThemeMode, effectiveTheme);
      const bg = palette.bg;
      const header = palette.header || bg;
      const bottom = palette.bottom || palette.secondary || bg;

      try { tg.setHeaderColor(header); } catch (_) {}
      try { tg.setBackgroundColor(bg); } catch (_) {}
      try {
        if (typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('7.10') && typeof tg.setBottomBarColor === 'function') {
          tg.setBottomBarColor(bottom);
        }
      } catch (_) {}
    }

    let layoutRaf = 0;
    function scheduleTelegramLayoutRefresh() {
      if (layoutRaf) return;
      layoutRaf = requestAnimationFrame(() => {
        layoutRaf = 0;
        syncTelegramSafeArea();
        if (typeof updateIndicator === 'function') updateIndicator();
        if (typeof positionGuideFloatingControls === 'function') positionGuideFloatingControls();
        if (typeof scheduleGuideReadingProgress === 'function') scheduleGuideReadingProgress();
        window.scheduleAdaptiveGlassContrast?.();
      });
    }

    let fullscreenSettleTimer = 0;
    function scheduleFullscreenLayoutRefresh() {
      scheduleTelegramLayoutRefresh();
      // Some Telegram clients publish fullscreenChanged before the final safe
      // area values are visible to JS. Re-read them once the native transition
      // has settled instead of relying on hard-coded top padding.
      clearTimeout(fullscreenSettleTimer);
      fullscreenSettleTimer = window.setTimeout(scheduleTelegramLayoutRefresh, 90);
    }

    function setAppActive(active) {
      root.classList.toggle('tg-inactive', !active);
      if (active) scheduleTelegramLayoutRefresh();
    }

    window.__lapSyncTelegramChrome = syncTelegramChrome;

    detectTelegramPerformanceClass();

    if (!tg) {
      syncTelegramSafeArea();
      window.addEventListener('resize', scheduleTelegramLayoutRefresh, { passive: true });
      window.visualViewport?.addEventListener('resize', scheduleTelegramLayoutRefresh, { passive: true });
      return;
    }

    root.classList.add('telegram-miniapp');

    try { tg.ready(); } catch (_) {}
    try { tg.expand(); } catch (_) {}
    syncTelegramChrome();
    syncTelegramSafeArea();
    setAppActive(tg.isActive !== false);

    try {
      if (typeof tg.isVersionAtLeast === 'function' &&
          tg.isVersionAtLeast('8.0') &&
          typeof tg.requestFullscreen === 'function' &&
          !tg.isFullscreen) {
        tg.requestFullscreen();
      }
    } catch (_) {}

    try { tg.onEvent('themeChanged', () => { syncTelegramThemeVars(); syncAppThemeFromEnvironment(); }); } catch (_) {}
    try { tg.onEvent('safeAreaChanged', scheduleTelegramLayoutRefresh); } catch (_) {}
    try { tg.onEvent('contentSafeAreaChanged', scheduleTelegramLayoutRefresh); } catch (_) {}
    try { tg.onEvent('fullscreenChanged', scheduleFullscreenLayoutRefresh); } catch (_) {}
    try { tg.onEvent('fullscreenFailed', scheduleFullscreenLayoutRefresh); } catch (_) {}
    try {
      tg.onEvent('viewportChanged', event => {
        // Expensive geometry updates only need the final stable state.
        if (!event || event.isStateStable !== false) scheduleTelegramLayoutRefresh();
      });
    } catch (_) {}
    try { tg.onEvent('activated', () => setAppActive(true)); } catch (_) {}
    try { tg.onEvent('deactivated', () => setAppActive(false)); } catch (_) {}

    document.addEventListener('visibilitychange', () => setAppActive(!document.hidden), { passive: true });
    window.addEventListener('resize', scheduleTelegramLayoutRefresh, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleTelegramLayoutRefresh, { passive: true });
  })();


  // ===== ACCENT COLOR =====
  const accentPresets = {
    orange: { main: '#ff922b', bright: '#ffad5c', deep: '#ff7417' },
    blue:   { main: '#4d9cff', bright: '#7db8ff', deep: '#2478e8' },
    green:  { main: '#34c759', bright: '#67db82', deep: '#1fa243' },
    purple: { main: '#a970ff', bright: '#c39cff', deep: '#7c42dc' },
    pink:   { main: '#ff5f9e', bright: '#ff8fba', deep: '#dc3678' },
    cyan:   { main: '#34cdd7', bright: '#70e1e8', deep: '#1499a2' }
  };

  function setAccentColor(name, vibrate = true) {
    const preset = accentPresets[name] || accentPresets.orange;
    if (vibrate) nativeVibrate('click');
    document.documentElement.style.setProperty('--text-accent', preset.main);
    document.documentElement.style.setProperty('--accent', preset.main);
    document.documentElement.style.setProperty('--accent-bright', preset.bright);
    document.documentElement.style.setProperty('--accent-deep', preset.deep);
    document.documentElement.style.setProperty('--lap-accent', preset.main);
    document.documentElement.style.setProperty('--lap-accent-bright', preset.bright);
    document.documentElement.style.setProperty('--lap-accent-deep', preset.deep);
    document.documentElement.style.setProperty('--lap-accent-2', preset.bright);
    document.documentElement.style.setProperty('--accent-soft', `color-mix(in srgb, ${preset.main} 14%, transparent)`);
    document.documentElement.style.setProperty('--accent-glow', `color-mix(in srgb, ${preset.main} 28%, transparent)`);
    document.documentElement.style.setProperty('--lap-accent-soft', `color-mix(in srgb, ${preset.main} 13%, transparent)`);
    document.documentElement.style.setProperty('--lap-accent-line', `color-mix(in srgb, ${preset.main} 24%, transparent)`);
    document.documentElement.dataset.accent = name;
    localStorage.setItem('appAccentColor', name);
    document.querySelectorAll('.accent-color-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.accent === name);
      btn.setAttribute('aria-pressed', btn.dataset.accent === name ? 'true' : 'false');
    });
    window.scheduleAdaptiveGlassContrast?.();
  }

  window.setAccentColor = setAccentColor;


  // ===== ADAPTIVE GLASS CONTRAST =====
  // Neutral controls can switch between black/white for readability while
  // selected and primary actions always keep the configured accent color.
  // Sampling is throttled because elementsFromPoint() can be expensive during
  // fast scrolling in Android WebView.
  let adaptiveContrastRaf = 0;
  let adaptiveContrastTimer = 0;

  function parseRenderedColor(value) {
    if (!value || value === 'transparent') return null;
    const text = String(value).trim().toLowerCase();

    let m = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
    if (m) return { r:+m[1], g:+m[2], b:+m[3], a:m[4] == null ? 1 : +m[4] };

    m = text.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
    if (m) return { r:+m[1]*255, g:+m[2]*255, b:+m[3]*255, a:m[4] == null ? 1 : +m[4] };

    m = text.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) {
      const hex=m[1];
      return { r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16), a:m[2] ? parseInt(m[2],16)/255 : 1 };
    }
    return null;
  }

  function compositeColor(fg, bg) {
    if (!fg) return bg;
    if (!bg) bg={r:255,g:255,b:255,a:1};
    const a=Math.max(0,Math.min(1,fg.a == null ? 1 : fg.a));
    return { r:fg.r*a + bg.r*(1-a), g:fg.g*a + bg.g*(1-a), b:fg.b*a + bg.b*(1-a), a:1 };
  }

  function themeBackdropColor() {
    const fallback=(document.documentElement.dataset.theme === 'dark') ? '#000000' : '#f2f2f7';
    return parseRenderedColor((currentThemePalette && currentThemePalette.bg) || fallback) || {r:0,g:0,b:0,a:1};
  }

  function resolveBackdropAtPoint(x, y, glassSurface) {
    const rootBg=themeBackdropColor();

    // LOW-class Telegram Android devices skip hit-testing entirely. The
    // semantic app theme still guarantees readable neutral controls.
    if (document.documentElement.classList.contains('tg-performance-low')) return rootBg;

    const stack=document.elementsFromPoint(x,y);
    for (const node of stack) {
      if (!(node instanceof Element)) continue;
      if (glassSurface && (node === glassSurface || glassSurface.contains(node))) continue;
      if (node.matches('.floating-nav-container')) continue;

      const bg=parseRenderedColor(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > .04) return compositeColor(bg, rootBg);
    }
    return rootBg;
  }

  function contrastColorForBackdrop(bg) {
    const brightness=(bg.r*0.299 + bg.g*0.587 + bg.b*0.114)/255;
    return brightness < 0.54 ? '#ffffff' : '#111111';
  }

  function setAdaptiveNeutral(target, glassSurface=target) {
    if (!target || !target.isConnected) return;
    const rect=target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const x=Math.min(innerWidth-1, Math.max(0, rect.left + rect.width/2));
    const y=Math.min(innerHeight-1, Math.max(0, rect.top + rect.height/2));
    const neutral=contrastColorForBackdrop(resolveBackdropAtPoint(x,y,glassSurface));
    if (target.style.getPropertyValue('--adaptive-neutral') !== neutral) {
      target.style.setProperty('--adaptive-neutral', neutral);
    }
  }

  function syncAdaptiveGlassContrast() {
    adaptiveContrastRaf=0;
    if (document.hidden || document.documentElement.classList.contains('tg-inactive')) return;

    const nav=document.getElementById('floatingNav');
    if (nav) nav.querySelectorAll('.nav-btn:not(.active)').forEach(btn => setAdaptiveNeutral(btn, nav));

    const dock=document.getElementById('guideFloatingControls');
    if (dock && !dock.hidden) {
      dock.querySelectorAll('.guides-action-btn:not(.guides-refresh-btn)').forEach(btn => setAdaptiveNeutral(btn, dock));
    }

    const popup=document.querySelector('#supportPopup.active .popup-card');
    if (popup) popup.querySelectorAll('.popup-close,.popup-text').forEach(el => setAdaptiveNeutral(el, popup));
  }

  function scheduleAdaptiveGlassContrast({ immediate=false } = {}) {
    if (document.hidden || document.documentElement.classList.contains('tg-inactive')) return;
    if (immediate) {
      clearTimeout(adaptiveContrastTimer);
      if (!adaptiveContrastRaf) adaptiveContrastRaf=requestAnimationFrame(syncAdaptiveGlassContrast);
      return;
    }
    clearTimeout(adaptiveContrastTimer);
    adaptiveContrastTimer=window.setTimeout(() => {
      if (!adaptiveContrastRaf) adaptiveContrastRaf=requestAnimationFrame(syncAdaptiveGlassContrast);
    }, 72);
  }

  window.syncAdaptiveGlassContrast=syncAdaptiveGlassContrast;
  window.scheduleAdaptiveGlassContrast=scheduleAdaptiveGlassContrast;
  document.addEventListener('scroll', () => scheduleAdaptiveGlassContrast(), {capture:true, passive:true});
  window.addEventListener('resize', () => scheduleAdaptiveGlassContrast({immediate:true}), {passive:true});
  window.visualViewport?.addEventListener('resize', () => scheduleAdaptiveGlassContrast({immediate:true}), {passive:true});
  requestAnimationFrame(syncAdaptiveGlassContrast);


  const i18n = {
    ru: {
      navFeed: "Лента",
      navGuides: "Гайды",
      navCalc: "Кальк.",
      navTime: "Время",
      navSettings: "Настройки",

      feedTitle: "Лента",
      feedPatchText: "Всем привет, рад что вы скачали и установили это приложение! Оно будет обновляться и пополняться новыми функциями которые вы можете предлагать написав нам в ТГ-канал.<br><br>Приятного пользования!",
      patchLatestLabel: "Новое обновление",
      patch102Title: "LAPBaseAPP — лог 20 важнейших нововведений и правок",
      patch102Date: "15 августа 2026",
      patch102Body: `<strong>01. Полностью переработан визуальный стиль приложения</strong><br>Интерфейс приведён к единой системе Layered Depth / Liquid Glass.<br>Убраны случайные визуальные стили, лишние эффекты и несогласованные карточки.<br><br><strong>02. Внедрена единая HIG-система интерфейса</strong><br>Отступы, радиусы, размеры контролов, типографика, цвета и состояния переведены на общие дизайн-токены.<br><br><strong>03. Улучшена работа внутри Telegram Mini App</strong><br>Добавлена корректная работа с Safe Area, Content Safe Area, fullscreen-состоянием, Telegram theme events и WebView.<br><br><strong>04. Проведена большая оптимизация Telegram Mini App</strong><br>Убраны лишние observers, повторные layout-проходы, ненужные принудительные reflow и другие дорогостоящие операции.<br><br><strong>05. Добавлена адаптация производительности под Android</strong><br>Приложение может облегчать blur, тени и анимации на устройствах с более низким performance class.<br><br><strong>06. Разделено масштабирование текста и интерфейса</strong><br>Размер текста больше не изменяет геометрию элементов.<br>Размер интерфейса изменяет карточки, поля, отступы и радиусы, но не размер текста.<br><br><strong>07. Добавлено 5 размеров текста</strong><br>12 / 14 / 16 / 18 / 20 px.<br>Базовым размером приложения установлен 16 px.<br><br><strong>08. Добавлено 4 размера интерфейса</strong><br>Маленький / Обычный / Средний / Крупный.<br>Все основные UI-компоненты поддерживают эту систему.<br><br><strong>09. Полностью переработана вкладка «Гайды»</strong><br>Контейнер растянут до нижней части экрана, нижнее меню располагается поверх него, а контент корректно учитывает безопасные отступы.<br><br><strong>10. Улучшены карточки гайдов</strong><br>Изображение перенесено над текстом, установлен формат 16:9, увеличены превью и улучшена мобильная компоновка.<br><br><strong>11. Исправлена загрузка списка гайдов</strong><br>Устранена ошибка пагинации, из-за которой старые статьи могли преждевременно исчезать из списка.<br><br><strong>12. Добавлен Reading Progress для статей</strong><br>В верхней части статьи отображается тонкий индикатор прогресса чтения.<br>Он учитывает реальную высоту статьи и перекрытие нижней навигацией.<br><br><strong>13. Переработано оглавление статей</strong><br>TOC стал компактнее, получил активное состояние текущего раздела, аккуратные отступы и адаптацию под мобильный экран.<br><br><strong>14. Переработаны карточки зданий калькулятора</strong><br>Все карточки имеют одинаковые размеры независимо от названия здания.<br>Длинные названия ограничиваются двумя строками, а управление уровнями унифицировано.<br><br><strong>15. Добавлен новый блок «Скидки и бонусы»</strong><br>Реализованы:<br>— бонус скорости строительства;<br>— бесплатное завершение;<br>— снижение стоимости строительства.<br><br><strong>16. Добавлен блок «Имеющиеся ресурсы и ускорения»</strong><br>Пользователь может указать:<br>— зерно;<br>— древесину;<br>— траву;<br>— ускорения строительства;<br>— общие ускорения.<br><br><strong>17. Полностью переработана математика калькулятора</strong><br>Расчёт каждого уровня выполняется отдельно:<br>базовое время → Speed Boost → Free Construction → требуемые ускорения.<br><br>Для ресурсов:<br>базовая стоимость → скидка → суммирование → имеющиеся ресурсы → нехватка.<br><br><strong>18. Добавлена правильная система расходования ускорений</strong><br>Сначала используются Building Speedups, после них General Speedups.<br>Остатки и нехватка рассчитываются отдельно.<br><br><strong>19. Математика калькулятора вынесена из UI</strong><br>Создан отдельный calculator-math.js.<br>Формулы Speed Boost, Free Construction, Resource Discount, Existing Resources и Speedups больше не размазаны по DOM-обработчикам.<br><br><strong>20. Проведена большая чистка и оптимизация проекта</strong><br>— данные зданий индексируются один раз;<br>— расчёты диапазонов кэшируются;<br>— калькулятор инициализируется лениво;<br>— статьи получают session-cache;<br>— старые запросы отменяются через AbortController;<br>— удалён мёртвый CSS/JS;<br>— сокращён накопленный README;<br>— устранены дублирующиеся обработчики;<br>— убраны устаревшие compatibility-переменные;<br>— сохранена обратная совместимость калькулятора при нулевых бонусах.`,
      patch101Title: "Что нового в LAPBase",
      patch101Item1: "Полностью обновили дизайн приложения — теперь он в стиле Liquid Glass с прозрачными слоями и глубиной.",
      patch101Item2: "Добавили светлую, тёмную и автоматическую тему. В режиме «Авто» LAPBase повторяет тему Telegram.",
      patch101Item3: "Добавили 5 размеров текста: 12, 14, 16, 18 и 20 px. Стандартный размер — 16 px.",
      patch101Item4: "Гайды теперь открываются прямо внутри LAPBase, без отдельного окна Teletype.",
      patch101Item5: "В списке гайдов появились большие обложки, названия, короткие описания и даты публикации.",
      patch101Item6: "Когда листаешь список вниз, старые статьи подгружаются автоматически.",
      patch101Item7: "В статьях работают оглавление, ссылки и кнопки «Назад», «Обновить» и «Наверх».",
      patch101Item8: "Картинки в статьях показываются в правильных пропорциях. Их можно открыть на весь экран и увеличить пальцами.",
      patch101Item9: "Если в статье есть русский и английский текст, LAPBase показывает нужную версию по выбранному языку.",
      patch101Item10: "Исправили отображение длинного текста, списков, таблиц и блоков кода внутри статей.",
      patch101Item11: "Обновили калькулятор: карточки зданий, выбор уровней и итоговые ресурсы стали удобнее на телефоне.",
      patch101Item12: "Добавили выбор акцентного цвета — выбранный цвет используется во всём приложении.",
      patch101Item13: "Улучшили полноэкранный режим Telegram и отступы, чтобы интерфейс не мешал кнопкам Mini App.",
      patch101Item14: "Обновили иконки и привели кнопки, панели и карточки к одному стилю.",
      patch101Item15: "Перенесли кнопку поддержки в шапку и добавили виброотклик Telegram там, где он поддерживается.",
      patch101Item16: "Исправили много мелких проблем со скроллом, отступами, размерами и отображением на разных экранах.",
      patchShowMore: "Показать всё",
      patchShowLess: "Свернуть",

      guidesTitle: "Гайды",
      guideBackBtn: "Назад",
      guideTopBtn: "Наверх",
      refreshBtn: "Обновить",
      guidesUrl: "https://teletype.in/@1k0na_inf/+lastasylumplague",

      calcTitle: "Калькулятор ресурсов",
      defLevelsTitle: "Уровни по умолчанию",
      fromLvlLabel: "С уровня:",
      toLvlLabel: "До уровня:",
      applyBtn: "Применить",
      deselectAllBtn: "Снять все",
      selectAllBtn: "Выбрать все",
      discountsTitle: "Скидки и бонусы",
      bonusesTitle: "Скидки и бонусы",
      resDiscountLabel: "Снижение стоимости строительства",
      constructionResourceDiscountLabel: "Снижение стоимости строительства",
      constructionResourceDiscountHelp: "Уменьшает требуемые ресурсы для каждого улучшения.",
      speedupLabel: "Бонус скорости строительства",
      constructionSpeedBoostLabel: "Бонус скорости строительства",
      constructionSpeedBoostHelp: "Увеличивает скорость строительства. 100% бонуса = строительство в 2 раза быстрее.",
      freeConstructionLabel: "Бесплатное завершение",
      freeConstructionHelp: "Количество последних секунд каждого строительства, которые можно завершить бесплатно.",
      existingResourcesTitle: "Имеющиеся ресурсы и ускорения",
      optionalLabel: "необязательно",
      generalSpeedupsLabel: "Общие ускорения",
      generalSpeedupsHelp: "Универсальные ускорения, которые можно использовать для строительства.",
      buildingSpeedupsLabel: "Ускорения строительства",
      buildingSpeedupsHelp: "Специализированные ускорения строительства. Используются раньше общих.",
      selectBuildingsTitle: "Выбор зданий",
      swipeBuildingsHint: "Свайпни вбок →",
      totalCostTitle: "Всего требуется",
      fullNumbersToggle: "Полные цифры",
      resGrain: "Зерно",
      resWood: "Древесина",
      resGrass: "Трава",
      resPower: "Мощь",
      buildTimeLabel: "Время строительства",
      adjustedBuildTimeLabel: "Время после бонуса скорости",
      missingResourcesTitle: "С учётом имеющихся ресурсов",
      existingShortLabel: "Есть",
      missingShortLabel: "Не хватает",
      speedupSummaryTitle: "Время и ускорения",
      freeCoveredTimeLabel: "Покрыто бесплатным завершением",
      speedupRequiredTimeLabel: "Нужно покрыть ускорениями",
      buildingSpeedupsAvailableLabel: "Ускорения строительства",
      generalSpeedupsAvailableLabel: "Общие ускорения",
      missingSpeedupTimeLabel: "Не хватает ускорений",
      calcDataErrorTitle: "Не удалось рассчитать выбранные уровни",
      calcDataErrorDetail: "Нет данных для уровня",
      lvlEqualsHint: "Уровни равны или начальный выше конечного",
      daysUnit: "дн.",
      hoursUnit: "ч.",
      minsUnit: "мин.",
      secondsUnitShort: "сек",
      minutesUnitShort: "мин",

      timeTitle: "Конвертер времени",
      showConverter: "Показать конвертер",
      hideConverter: "Скрыть конвертер",
      utcHeader: "Конвертер UTC",
      sourceOffsetLabel: "Исходное смещение (ваш часовой пояс)",
      timeInputLabel: "Время (ЧЧ:ММ:СС)",
      gameOffsetLabel: "Часовой пояс игры",
      gameTimeResultLabel: "Время в игре (сервер)",
      converterHint: "Время пересчитывается автоматически каждую секунду. При клике на поле ввода автообновление приостанавливается для удобства ручного ввода.",
      invalidTimeMsg: "Некорректное время",

      settingsTitle: "Настройки",
      langGroupTitle: "Язык / Language",
      appLangLabel: "Язык приложения",
      displayGroupTitle: "Отображение",
      textSizeLabel: "Размер текста",
      uiSizeLabel: "Размер интерфейса",
      themeLabel: "Тема",
      themeAuto: "Авто",
      themeLight: "День",
      themeDark: "Ночь",
      themeGroupAria: "Выбор темы оформления",
      themeAutoHint: "Авто следует теме Telegram",
      themeAutoLightHint: "Авто · Telegram: светлая",
      themeAutoDarkHint: "Авто · Telegram: тёмная",
      themeLightHint: "Светлая тема выбрана вручную",
      themeDarkHint: "Тёмная тема выбрана вручную",
      accentColorLabel: "Акцентный цвет",
      accentGroupTitle: "Цвет интерфейса",
      accentOrange: "Оранжевый",
      accentBlue: "Синий",
      accentGreen: "Зелёный",
      accentPurple: "Фиолетовый",
      accentPink: "Розовый",
      accentCyan: "Бирюзовый",
      guidesActionsAria: "Управление гайдами",
      guideNavigationGroupAria: "Навигация по гайду",
      accentGroupAria: "Выбор акцентного цвета",
      buildingSelectAria: "Выбрать здание",
      buildingSelectedStatus: "Выбрано для расчёта",
      buildingLevelsTitle: "Уровни улучшения",
      buildingUpgradeCost: "Стоимость улучшения",
      guidesFrameTitle: "Гайды LAPBase",
      guideLoading: "Загружаем гайд…",
      guideErrorTitle: "Не удалось загрузить гайд",
      guideErrorText: "Проверьте Worker и попробуйте ещё раз.",
      guideRetryBtn: "Повторить",
      guideEnglishMissing: "У этой статьи пока нет отдельной английской версии. Показан доступный оригинал.",
      guideImageViewerAria: "Просмотр изображения",
      guideImageOpenOriginal: "Оригинал",
      guideImageClose: "Закрыть",
      supportAria: "Поддержать разработку",
      socialGroupTitle: "Социальные сети",
      tgChannelLabel: "Telegram-канал",
      contactDevLabel: "Написать разработчику",

      supportPopupText: "На развитие приложения",
      supportDevBtn: "Поддержать разработку",

      textSizeNames: ["12 px", "14 px", "16 px", "18 px", "20 px"],
      interfaceSizeNames: ["Маленький", "Обычный", "Средний", "Крупный"],
      sizeSmall: "Маленький",
      sizeNormal: "Обычный",
      sizeMedium: "Средний",
      sizeLarge: "Крупный",
      uiSizeOptionsAria: "Варианты размера интерфейса"
    },
    en: {
      navFeed: "Feed",
      navGuides: "Guides",
      navCalc: "Calc",
      navTime: "Time",
      navSettings: "Settings",

      feedTitle: "Feed",
      feedPatchText: "Hello everyone, glad you downloaded and installed this app! It will be updated and expanded with new features that you can suggest by writing to our Telegram channel.<br><br>Enjoy using it!",
      patchLatestLabel: "New update",
      patch102Title: "LAPBaseAPP — 20 key improvements and fixes",
      patch102Date: "August 15, 2026",
      patch102Body: `<strong>01. Completely reworked the app’s visual style</strong><br>The interface now follows a unified Layered Depth / Liquid Glass system.<br>Inconsistent visual styles, unnecessary effects and mismatched cards were removed.<br><br><strong>02. Introduced a unified HIG-based interface system</strong><br>Spacing, radii, control sizes, typography, colors and states now use shared design tokens.<br><br><strong>03. Improved Telegram Mini App integration</strong><br>Added correct handling for Safe Area, Content Safe Area, fullscreen state, Telegram theme events and WebView behavior.<br><br><strong>04. Performed a major Telegram Mini App optimization</strong><br>Removed unnecessary observers, repeated layout passes, forced reflows and other expensive operations.<br><br><strong>05. Added Android performance adaptation</strong><br>The app can reduce blur, shadows and animations on devices with a lower performance class.<br><br><strong>06. Separated text scaling from interface scaling</strong><br>Text size no longer changes element geometry.<br>Interface size changes cards, fields, spacing and radii without changing text size.<br><br><strong>07. Added 5 text sizes</strong><br>12 / 14 / 16 / 18 / 20 px.<br>The default app text size is now 16 px.<br><br><strong>08. Added 4 interface sizes</strong><br>Small / Normal / Medium / Large.<br>All primary UI components support this system.<br><br><strong>09. Completely reworked the Guides tab</strong><br>The container extends to the bottom of the screen, the bottom navigation overlays it, and content correctly respects safe spacing.<br><br><strong>10. Improved guide cards</strong><br>Images were moved above the text, the 16:9 format was added, previews were enlarged and the mobile layout was improved.<br><br><strong>11. Fixed guide list loading</strong><br>Fixed a pagination issue that could make older articles disappear from the list too early.<br><br><strong>12. Added Reading Progress for articles</strong><br>A thin reading progress indicator is shown at the top of an article.<br>It uses the article’s real height and accounts for the bottom navigation overlay.<br><br><strong>13. Reworked article table of contents</strong><br>The TOC is more compact, highlights the active section, and has improved spacing and mobile adaptation.<br><br><strong>14. Reworked calculator building cards</strong><br>All cards use consistent dimensions regardless of building name.<br>Long names are limited to two lines and level controls are standardized.<br><br><strong>15. Added a new “Discounts & Bonuses” block</strong><br>Implemented:<br>— construction speed bonus;<br>— free completion;<br>— construction resource cost reduction.<br><br><strong>16. Added an “Existing Resources & Speedups” block</strong><br>Users can enter:<br>— grain;<br>— wood;<br>— grass;<br>— building speedups;<br>— general speedups.<br><br><strong>17. Completely reworked calculator math</strong><br>Each level is calculated separately:<br>base time → Speed Boost → Free Construction → required speedups.<br><br>For resources:<br>base cost → discount → total → existing resources → shortage.<br><br><strong>18. Added the correct speedup spending order</strong><br>Building Speedups are used first, followed by General Speedups.<br>Remaining amounts and shortages are calculated separately.<br><br><strong>19. Moved calculator math out of the UI</strong><br>Created a separate calculator-math.js file.<br>Speed Boost, Free Construction, Resource Discount, Existing Resources and Speedups formulas are no longer scattered across DOM handlers.<br><br><strong>20. Performed a major project cleanup and optimization</strong><br>— building data is indexed once;<br>— range calculations are cached;<br>— the calculator is initialized lazily;<br>— articles use a session cache;<br>— stale requests are cancelled with AbortController;<br>— dead CSS/JS was removed;<br>— the accumulated README was shortened;<br>— duplicate handlers were removed;<br>— obsolete compatibility variables were removed;<br>— backward-compatible calculator results are preserved when bonuses are zero.`,
      patch101Title: "What's new in LAPBase",
      patch101Item1: "We completely refreshed the app design. It now uses a Liquid Glass style with transparent layers and more depth.",
      patch101Item2: "Added Light, Dark and Auto themes. In Auto mode, LAPBase follows the Telegram theme.",
      patch101Item3: "Added 5 text sizes: 12, 14, 16, 18 and 20 px. The default size is 16 px.",
      patch101Item4: "Guides now open directly inside LAPBase instead of a separate Teletype page.",
      patch101Item5: "Guide cards now show large covers, titles, short descriptions and publication dates.",
      patch101Item6: "Older articles load automatically when you scroll to the bottom of the guide list.",
      patch101Item7: "Articles now support a table of contents, links and Back, Refresh and Top controls.",
      patch101Item8: "Article images keep their correct proportions. You can open them fullscreen and zoom with two fingers.",
      patch101Item9: "If an article has Russian and English versions, LAPBase shows the version that matches the selected language.",
      patch101Item10: "Fixed long text, lists, tables and code blocks inside articles.",
      patch101Item11: "Updated the calculator: building cards, level selection and resource totals are easier to use on phones.",
      patch101Item12: "Added accent color selection. The selected color is used across the app.",
      patch101Item13: "Improved Telegram fullscreen mode and safe spacing so the interface stays clear of Mini App controls.",
      patch101Item14: "Updated the icons and made buttons, panels and cards use one consistent style.",
      patch101Item15: "Moved the support button into the header and added Telegram haptic feedback where supported.",
      patch101Item16: "Fixed many smaller issues with scrolling, spacing, sizing and different screen sizes.",
      patchShowMore: "Show all",
      patchShowLess: "Collapse",

      guidesTitle: "Guides",
      guideBackBtn: "Back",
      guideTopBtn: "Top",
      refreshBtn: "Refresh",
      guidesUrl: "https://teletype.in/@1k0na_inf/+lastasylumplague",

      calcTitle: "Resource Calculator",
      defLevelsTitle: "Default Levels",
      fromLvlLabel: "From level:",
      toLvlLabel: "To level:",
      applyBtn: "Apply",
      deselectAllBtn: "Deselect All",
      selectAllBtn: "Select All",
      discountsTitle: "Discounts & Bonuses",
      bonusesTitle: "Discounts & Bonuses",
      resDiscountLabel: "Construction resource discount",
      constructionResourceDiscountLabel: "Construction resource discount",
      constructionResourceDiscountHelp: "Reduces the resources required for each upgrade.",
      speedupLabel: "Construction speed boost",
      constructionSpeedBoostLabel: "Construction speed boost",
      constructionSpeedBoostHelp: "Increases construction speed. A 100% bonus makes construction twice as fast.",
      freeConstructionLabel: "Free completion",
      freeConstructionHelp: "The final seconds of each individual construction that can be completed for free.",
      existingResourcesTitle: "Existing resources & speedups",
      optionalLabel: "optional",
      generalSpeedupsLabel: "General speedups",
      generalSpeedupsHelp: "Universal speedups that can be used for construction.",
      buildingSpeedupsLabel: "Building speedups",
      buildingSpeedupsHelp: "Construction-specific speedups. They are used before general speedups.",
      selectBuildingsTitle: "Select Buildings",
      swipeBuildingsHint: "Swipe sideways →",
      totalCostTitle: "Total required",
      fullNumbersToggle: "Full digits",
      resGrain: "Grain",
      resWood: "Wood",
      resGrass: "Herb",
      resPower: "Power",
      buildTimeLabel: "Construction time",
      adjustedBuildTimeLabel: "Time after speed bonus",
      missingResourcesTitle: "With existing resources",
      existingShortLabel: "Owned",
      missingShortLabel: "Missing",
      speedupSummaryTitle: "Time & speedups",
      freeCoveredTimeLabel: "Covered by free completion",
      speedupRequiredTimeLabel: "Needs speedups",
      buildingSpeedupsAvailableLabel: "Building speedups",
      generalSpeedupsAvailableLabel: "General speedups",
      missingSpeedupTimeLabel: "Missing speedup time",
      calcDataErrorTitle: "Could not calculate the selected levels",
      calcDataErrorDetail: "Missing data for level",
      lvlEqualsHint: "Levels are equal or start level is higher",
      daysUnit: "d.",
      hoursUnit: "h.",
      minsUnit: "m.",
      secondsUnitShort: "sec",
      minutesUnitShort: "min",

      timeTitle: "Time Converter",
      showConverter: "Show Converter",
      hideConverter: "Hide Converter",
      utcHeader: "UTC Converter",
      sourceOffsetLabel: "Source Offset (Your Time Zone)",
      timeInputLabel: "Time (HH:MM:SS)",
      gameOffsetLabel: "Game Time Zone",
      gameTimeResultLabel: "In-Game Time (Server)",
      converterHint: "Time updates automatically every second. Clicking the input field pauses auto-update for manual editing convenience.",
      invalidTimeMsg: "Invalid time",

      settingsTitle: "Settings",
      langGroupTitle: "Language / Язык",
      appLangLabel: "App Language",
      displayGroupTitle: "Display",
      textSizeLabel: "Text Size",
      uiSizeLabel: "Interface Size",
      themeLabel: "Theme",
      themeAuto: "Auto",
      themeLight: "Day",
      themeDark: "Night",
      themeGroupAria: "Choose appearance theme",
      themeAutoHint: "Auto follows Telegram theme",
      themeAutoLightHint: "Auto · Telegram: light",
      themeAutoDarkHint: "Auto · Telegram: dark",
      themeLightHint: "Light theme selected manually",
      themeDarkHint: "Dark theme selected manually",
      accentColorLabel: "Accent color",
      accentGroupTitle: "Interface color",
      accentOrange: "Orange",
      accentBlue: "Blue",
      accentGreen: "Green",
      accentPurple: "Purple",
      accentPink: "Pink",
      accentCyan: "Cyan",
      guidesActionsAria: "Guide controls",
      guideNavigationGroupAria: "Guide navigation",
      accentGroupAria: "Choose accent color",
      buildingSelectAria: "Select building",
      buildingSelectedStatus: "Included in calculation",
      buildingLevelsTitle: "Upgrade levels",
      buildingUpgradeCost: "Upgrade cost",
      guidesFrameTitle: "LAPBase Knowledge Base",
      guideLoading: "Loading guide…",
      guideErrorTitle: "Could not load the guide",
      guideErrorText: "Check the Worker and try again.",
      guideRetryBtn: "Retry",
      guideEnglishMissing: "This article does not have a separate English version yet. The available original is shown.",
      guideImageViewerAria: "Image viewer",
      guideImageOpenOriginal: "Original",
      guideImageClose: "Close",
      supportAria: "Support development",
      socialGroupTitle: "Social Links",
      tgChannelLabel: "Telegram Channel",
      contactDevLabel: "Contact Developer",

      supportPopupText: "For app development",
      supportDevBtn: "Support Development",

      textSizeNames: ["12 px", "14 px", "16 px", "18 px", "20 px"],
      interfaceSizeNames: ["Small", "Normal", "Medium", "Large"],
      sizeSmall: "Small",
      sizeNormal: "Normal",
      sizeMedium: "Medium",
      sizeLarge: "Large",
      uiSizeOptionsAria: "Interface size options"
    }
  };

  function detectNativeLanguage() {
    const saved = localStorage.getItem('appLang');
    if (saved && i18n[saved]) return saved;

    const tgLang = window.Telegram && window.Telegram.WebApp &&
      window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user &&
      window.Telegram.WebApp.initDataUnsafe.user.language_code;
    const browserLang = (navigator.languages && navigator.languages[0]) || navigator.language || 'ru';
    const source = String(tgLang || browserLang || 'ru').toLowerCase();
    return source.startsWith('ru') ? 'ru' : 'en';
  }

  let currentLang = detectNativeLanguage();

  function setAppLanguage(lang, vibrate = true) {
    if (!i18n[lang]) return;
    if (vibrate) nativeVibrate('click');
    currentLang = lang;
    localStorage.setItem('appLang', lang);
    document.documentElement.lang = lang;

    document.getElementById('langBtnRu').classList.toggle('active', lang === 'ru');
    document.getElementById('langBtnEn').classList.toggle('active', lang === 'en');

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (i18n[lang][key]) {
        el.innerHTML = i18n[lang][key];
      }
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (i18n[lang][key]) el.setAttribute('aria-label', i18n[lang][key]);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (i18n[lang][key]) el.setAttribute('title', i18n[lang][key]);
    });

    [
      ['patch-v102', 'patch102Toggle'],
      ['patch-v101', 'patch101Toggle']
    ].forEach(([cardId, buttonId]) => {
      const patchCard = document.getElementById(cardId);
      const patchToggleText = document.querySelector(`#${buttonId} .patch-expand-text`);
      if (patchToggleText) {
        patchToggleText.textContent = patchCard && patchCard.classList.contains('expanded')
          ? i18n[lang].patchShowLess
          : i18n[lang].patchShowMore;
      }
    });

    if (typeof window.renderCurrentGuideLanguage === 'function') {
      window.renderCurrentGuideLanguage();
    }

    const textSizeLabel = document.getElementById('textSizeValueLabel');
    if (textSizeLabel && typeof currentTextSizeIndex !== 'undefined') {
      textSizeLabel.textContent = i18n[lang].textSizeNames[currentTextSizeIndex];
    }
    const interfaceSizeLabel = document.getElementById('interfaceSizeValueLabel');
    if (interfaceSizeLabel && typeof currentInterfaceSizeIndex !== 'undefined') {
      interfaceSizeLabel.textContent = i18n[lang].interfaceSizeNames[currentInterfaceSizeIndex];
    }

    updateThemeControls();

    if (typeof window.calcUpdateSelectAllControl === 'function') {
      window.calcUpdateSelectAllControl();
    }

    if (typeof window.calcCalculateTotals === 'function') {
      window.calcCalculateTotals();
    }

    requestAnimationFrame(() => {
      if (typeof updateIndicator === 'function') updateIndicator();
    });
  }

  function togglePatchCard(cardId, buttonId) {
    nativeVibrate('click');
    const card = document.getElementById(cardId);
    const button = document.getElementById(buttonId);
    if (!card || !button) return;

    const isExpanded = card.classList.toggle('expanded');
    button.setAttribute('aria-expanded', String(isExpanded));

    const text = button.querySelector('.patch-expand-text');
    if (text) {
      text.textContent = isExpanded ? i18n[currentLang].patchShowLess : i18n[currentLang].patchShowMore;
      text.removeAttribute('data-i18n');
    }
  }

  window.togglePatch102 = function() {
    togglePatchCard('patch-v102', 'patch102Toggle');
  };

  window.togglePatch101 = function() {
    togglePatchCard('patch-v101', 'patch101Toggle');
  };

  function switchTab(tabId, element) {
    const targetTab = document.getElementById(tabId);
    if (!targetTab || !element) return;

    if (tabId === 'calc') window.__lapEnsureCalculatorInitialized?.();
    nativeVibrate('click');

    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-hidden', 'true');
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
      btn.tabIndex = -1;
    });

    targetTab.classList.add('active');
    targetTab.setAttribute('aria-hidden', 'false');
    element.classList.add('active');
    element.setAttribute('aria-selected', 'true');
    element.tabIndex = 0;

    const mainElem = document.querySelector('main');
    if (mainElem) {
      mainElem.classList.toggle('guides-mode', tabId === 'guides');
      if (tabId === 'guides') {
        const guidesScroller = document.getElementById('guides');
        if (guidesScroller) guidesScroller.scrollTop = 0;
      } else {
        mainElem.scrollTop = 0;
      }
    }

    requestAnimationFrame(() => {
      updateIndicator();
      positionGuideFloatingControls();
      scheduleGuideReadingProgress();
      window.scheduleAdaptiveGlassContrast?.({ immediate: true });
      if (tabId === 'time') window.__lapRefreshTimeConverter?.();
    });
  }

  function updateIndicator() {
    const activeBtn = document.querySelector('.nav-btn.active');
    const nav = document.getElementById('floatingNav');
    const indicator = document.getElementById('navIndicator');

    if (!activeBtn || !nav || !indicator) return;

    const navRect = nav.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    const left = btnRect.left - navRect.left;
    const width = btnRect.width;

    indicator.style.left = left + 'px';
    indicator.style.width = width + 'px';
  }


  function setupTabKeyboardNavigation() {
    const nav = document.getElementById('floatingNav');
    if (!nav || nav.dataset.keyboardReady === '1') return;
    nav.dataset.keyboardReady = '1';

    nav.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

      const tabs = Array.from(nav.querySelectorAll('.nav-btn[role="tab"]'));
      if (!tabs.length) return;

      const current = tabs.indexOf(document.activeElement);
      let next = current >= 0 ? current : Math.max(0, tabs.findIndex(tab => tab.classList.contains('active')));

      if (event.key === 'ArrowRight') next = (next + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (next - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;

      event.preventDefault();
      const nextTab = tabs[next];
      nextTab.focus({ preventScroll: true });
      switchTab(nextTab.getAttribute('aria-controls'), nextTab);
    });
  }

  function getGuideScroller() {
    // In Telegram WebView nested content is more reliable when the Guides tab
    // owns its own scroll surface instead of sharing <main> with every tab.
    const guides = document.getElementById('guides');
    if (guides && guides.classList.contains('active')) return guides;
    return document.querySelector('main');
  }

  function getGuideScrollTop() {
    const scroller = getGuideScroller();
    return scroller ? scroller.scrollTop : (window.scrollY || 0);
  }

  function setGuideScrollTop(top = 0, behavior = 'smooth') {
    const scroller = getGuideScroller();
    if (scroller) {
      scroller.scrollTo({ top: Math.max(0, top), behavior });
    } else {
      window.scrollTo({ top: Math.max(0, top), behavior });
    }
  }

  function updateGuideControls() {
    const backBtn = document.getElementById('guideBackBtn');
    const refreshBtn = document.getElementById('guideRefreshBtn');
    const topBtn = document.getElementById('guideTopBtn');
    if (backBtn) backBtn.disabled = guideState.history.length === 0 || guideState.loading;
    if (refreshBtn) refreshBtn.disabled = guideState.loading;
    if (topBtn) topBtn.disabled = guideState.loading;
  }

  function positionGuideFloatingControls() {
    const dock = document.getElementById('guideFloatingControls');
    const guides = document.getElementById('guides');
    const card = document.getElementById('guideViewerCard');
    const bottomNav = document.querySelector('.floating-nav-container');
    if (!dock || !guides || !card) return;

    if (!guides.classList.contains('active')) {
      dock.hidden = true;
      dock.classList.remove('is-positioned');
      return;
    }

    // Keep the dock invisible until coordinates are known. This prevents the
    // Telegram WebView from briefly showing it near the header on first paint.
    dock.hidden = false;
    dock.classList.remove('is-positioned');

    const guidesRect = guides.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (!guidesRect.width || !guidesRect.height || !cardRect.width || !cardRect.height) {
      dock.hidden = true;
      return;
    }

    const scrollTop = guides.scrollTop || 0;
    const scrollLeft = guides.scrollLeft || 0;
    const shellStyle = getComputedStyle(document.getElementById('appContainer') || document.documentElement);
    const tokenPx = (name, fallback) => {
      const value = parseFloat(shellStyle.getPropertyValue(name));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const uiIconButton = tokenPx('--ui-icon-button', 44);
    const uiCardPadding = tokenPx('--ui-card-padding', 16);
    const uiGap = tokenPx('--ui-gap', 12);
    const dockWidth = Math.max(1, dock.offsetWidth || (uiIconButton + 8));
    const dockHeight = Math.max(1, dock.offsetHeight || ((uiIconButton * 3) + 16));

    const sideInset = Math.max(10, uiCardPadding);
    const bottomInset = Math.max(10, uiCardPadding);

    // #guides is the actual Telegram scroll surface. Convert viewport
    // coordinates of the dynamic reader card to coordinates in that surface.
    const cardTop = cardRect.top - guidesRect.top + scrollTop;
    const cardLeft = cardRect.left - guidesRect.left + scrollLeft;
    const cardRight = cardLeft + cardRect.width;
    const cardBottom = cardTop + cardRect.height;

    // Reserve exactly the area occupied by LAPBase's bottom navigation when it
    // overlaps the guide viewport. The control dock then follows immediately
    // above it, preserving a small visual gap.
    let navReserve = 0;
    if (bottomNav) {
      const navRect = bottomNav.getBoundingClientRect();
      const overlap = guidesRect.bottom - navRect.top;
      if (overlap > 0) navReserve = overlap + Math.max(6, uiGap / 2);
    }

    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + guides.clientHeight;
    const readerVisible = cardBottom > visibleTop && cardTop < visibleBottom;
    if (!readerVisible) {
      dock.hidden = true;
      return;
    }

    // Follow the lower edge of the visible reader. Near the real end of the
    // card the dock stops with it instead of escaping below the container.
    const desiredTop = visibleBottom - navReserve - bottomInset - dockHeight;
    const minTop = cardTop + bottomInset;
    const maxTop = Math.max(minTop, cardBottom - bottomInset - dockHeight);
    const top = Math.min(Math.max(desiredTop, minTop), maxTop);

    // Lower-right inside the dynamic card with a stable 16px inset.
    const desiredLeft = cardRight - sideInset - dockWidth;
    const minLeft = cardLeft + sideInset;
    const maxLeft = Math.max(minLeft, cardRight - sideInset - dockWidth);
    const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft);

    dock.style.setProperty('top', `${Math.round(top)}px`, 'important');
    dock.style.setProperty('left', `${Math.round(left)}px`, 'important');
    dock.style.setProperty('right', 'auto', 'important');
    dock.style.setProperty('bottom', 'auto', 'important');
    dock.style.setProperty('transform', 'none', 'important');
    dock.classList.add('is-positioned');
    window.scheduleAdaptiveGlassContrast?.();
  }

  function goGuideBack() {
    if (!guideState.history.length || guideState.loading) return;
    nativeVibrate('click');
    const previous = guideState.history.pop();
    updateGuideControls();
    window.loadGuide?.(previous.url, {
      pushHistory: false,
      restoreScrollTop: previous.scrollTop || 0,
    });
  }

  function refreshCurrentGuide() {
    if (guideState.loading) return;
    nativeVibrate('click');
    window.loadGuide?.(guideState.sourceUrl || GUIDES_HOME_URL, {
      pushHistory: false,
      restoreScrollTop: getGuideScrollTop(),
      preserveScroll: true,
      forceRefresh: true,
    });
  }

  function scrollGuideTop() {
    nativeVibrate('click');
    setGuideScrollTop(0, 'smooth');
  }

  // ===== НАТИВНЫЙ ПРОСМОТРЩИК ГАЙДОВ v5.6 =====
  // Worker отдаёт разделённые RU / ENG версии статьи, восстановленные медиа
  // и собственное оглавление. LAPBase управляет навигацией и скроллом.
  const GUIDES_HOME_URL = 'https://teletype.in/@1k0na_inf/+lastasylumplague';
  const GUIDES_WORKER_ORIGIN = 'https://lapbase-guides.dimasik98kz.workers.dev';

  const guideState = {
    sourceUrl: GUIDES_HOME_URL,
    type: '',
    titles: { ru: '', en: '' },
    html: { ru: '', en: '' },
    availableLanguages: { ru: true, en: false },
    loading: false,
    history: [],
    indexItems: [],
    indexPage: 1,
    indexHasMore: false,
    indexLoadingMore: false,
    indexObserver: null,
    indexScrollHandler: null,
    readingProgress: 0,
    readingProgressCompleted: false,
  };


  const GUIDE_CACHE_TTL_MS = 5 * 60 * 1000;
  const GUIDE_CACHE_LIMIT = 24;
  const guideResponseCache = new Map();
  let guideFetchController = null;

  function getCachedGuide(url) {
    const cached = guideResponseCache.get(url);
    if (!cached) return null;
    if (Date.now() - cached.time > GUIDE_CACHE_TTL_MS) {
      guideResponseCache.delete(url);
      return null;
    }
    return cached.data;
  }

  function cacheGuide(url, data) {
    if (guideResponseCache.size >= GUIDE_CACHE_LIMIT) {
      const oldest = guideResponseCache.keys().next().value;
      if (oldest) guideResponseCache.delete(oldest);
    }
    guideResponseCache.set(url, { time: Date.now(), data });
  }

  function guideEls() {
    return {
      card: document.getElementById('guideViewerCard'),
      indexHeading: document.getElementById('guideIndexHeading'),
      status: document.getElementById('guideStatus'),
      note: document.getElementById('guideTranslationNote'),
      article: document.getElementById('guideArticle'),
      title: document.getElementById('guideArticleTitle'),
      content: document.getElementById('guideArticleContent'),
      error: document.getElementById('guideError'),
      errorText: document.getElementById('guideErrorText'),
    };
  }

  function setGuideLoading(isLoading) {
    guideState.loading = isLoading;
    const el = guideEls();
    if (isLoading && el.card) {
      el.card.classList.remove('is-index', 'is-article');
      el.card.dataset.guideType = 'loading';
    }
    if (el.indexHeading) el.indexHeading.hidden = true;
    setGuideReadingProgressVisible(false);
    if (!el.status || !el.article || !el.error) return;
    el.status.hidden = !isLoading;
    el.article.hidden = isLoading;
    el.error.hidden = true;
    if (el.note) el.note.hidden = true;
    updateGuideControls();
  }

  function showGuideError(message) {
    guideState.loading = false;
    const el = guideEls();
    if (el.status) el.status.hidden = true;
    if (el.indexHeading) el.indexHeading.hidden = true;
    if (el.article) el.article.hidden = true;
    if (el.error) el.error.hidden = false;
    if (el.errorText) el.errorText.textContent = message || i18n[currentLang].guideErrorText;
    setGuideReadingProgressVisible(false);
    updateGuideControls();
  }

  function sanitizeClientHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    template.content.querySelectorAll('script,style,iframe,object,embed,form').forEach(el => el.remove());
    template.content.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
      });
    });
    return template.innerHTML;
  }

  function guideReadingProgressEls() {
    return {
      root: document.getElementById('guideReadingProgress'),
      fill: document.getElementById('guideReadingProgressFill'),
      article: document.getElementById('guideArticle'),
      scroller: document.getElementById('guides'),
      bottomNav: document.querySelector('.floating-nav-container'),
    };
  }

  function setGuideReadingProgressVisible(visible) {
    const { root } = guideReadingProgressEls();
    if (!root) return;
    root.hidden = !visible;
    root.classList.toggle('is-visible', visible);
    if (!visible) {
      root.style.setProperty('--reading-progress', '0');
      root.classList.remove('is-complete-pulse');
      guideState.readingProgress = 0;
      guideState.readingProgressCompleted = false;
    }
  }

  function updateGuideReadingProgress() {
    const { root, fill, article, scroller, bottomNav } = guideReadingProgressEls();
    const isArticle = guideState.type === 'article' && !guideState.loading && article && !article.hidden;
    if (!root || !fill || !article || !scroller || !isArticle || !scroller.classList.contains('active')) {
      setGuideReadingProgressVisible(false);
      return;
    }

    setGuideReadingProgressVisible(true);

    const scrollerRect = scroller.getBoundingClientRect();
    const articleRect = article.getBoundingClientRect();
    if (!scrollerRect.height || !articleRect.height) return;

    // Only the actually readable viewport counts. The floating LAPBase tab bar
    // overlays the bottom of #guides, so exclude that overlap from the reading
    // window instead of letting it make the article look more read than it is.
    let navOverlap = 0;
    if (bottomNav) {
      const navRect = bottomNav.getBoundingClientRect();
      navOverlap = Math.max(0, scrollerRect.bottom - navRect.top);
    }

    const readableHeight = Math.max(1, scrollerRect.height - navOverlap);
    const totalScrollableArticle = articleRect.height - readableHeight;
    const progressed = scrollerRect.top - articleRect.top;
    const progress = totalScrollableArticle <= 1
      ? 1
      : Math.max(0, Math.min(1, progressed / totalScrollableArticle));

    guideState.readingProgress = progress;
    root.style.setProperty('--reading-progress', progress.toFixed(4));
    fill.setAttribute('data-progress', String(Math.round(progress * 100)));

    if (progress >= .995 && !guideState.readingProgressCompleted) {
      guideState.readingProgressCompleted = true;
      root.classList.remove('is-complete-pulse');
      void root.offsetWidth;
      root.classList.add('is-complete-pulse');
      window.setTimeout(() => root.classList.remove('is-complete-pulse'), 220);
    } else if (progress < .94) {
      guideState.readingProgressCompleted = false;
    }
  }

  let guideReadingProgressRaf = 0;
  function scheduleGuideReadingProgress() {
    if (guideReadingProgressRaf) return;
    guideReadingProgressRaf = requestAnimationFrame(() => {
      guideReadingProgressRaf = 0;
      updateGuideReadingProgress();
    });
  }

  function resetGuideReadingProgress() {
    guideState.readingProgress = 0;
    guideState.readingProgressCompleted = false;
    const { root } = guideReadingProgressEls();
    if (root) {
      root.style.setProperty('--reading-progress', '0');
      root.classList.remove('is-complete-pulse');
    }
    scheduleGuideReadingProgress();
  }

  function scrollGuideToHash(hash) {
    if (!hash) return false;
    const content = document.getElementById('guideArticleContent');
    if (!content) return false;

    let anchorName = '';
    try { anchorName = decodeURIComponent(String(hash).replace(/^#/, '')); }
    catch { anchorName = String(hash).replace(/^#/, ''); }
    if (!anchorName) return false;

    let target = null;
    if (window.CSS?.escape) {
      target = content.querySelector(`#${CSS.escape(anchorName)}`);
    }

    if (!target) {
      const candidates = content.querySelectorAll('[name], [data-anchor], [data-teletype-anchor], [id]');
      target = [...candidates].find(el =>
        el.getAttribute('name') === anchorName ||
        el.getAttribute('data-anchor') === anchorName ||
        el.getAttribute('data-teletype-anchor') === anchorName ||
        el.id === anchorName
      );
    }

    if (!target) return false;

    // scrollIntoView scrolls the nearest scrollable ancestor (#guides in the
    // Telegram Mini App). Generated headings have scroll-margin-top in CSS, so
    // they stop below the floating control dock instead of underneath it.
    target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    return true;
  }

  const guideImageZoomState = {
    scale: 1,
    x: 0,
    y: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    pinchDistance: 0,
    pinchCenterX: 0,
    pinchCenterY: 0,
    panTouchX: 0,
    panTouchY: 0,
    gesture: '',
  };

  function guideLightboxEls() {
    return {
      root: document.getElementById('guideLightbox'),
      stage: document.querySelector('#guideLightbox .guide-lightbox-stage'),
      panzoom: document.getElementById('guideLightboxPanzoom'),
      image: document.getElementById('guideLightboxImage'),
      caption: document.getElementById('guideLightboxCaption'),
      shell: document.getElementById('guideLightboxShell'),
    };
  }

  function getTouchDistance(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function getTouchCenter(a, b) {
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    };
  }

  function clampGuideImagePan() {
    const el = guideLightboxEls();
    if (!el.stage || !el.image) return;

    if (guideImageZoomState.scale <= 1.001) {
      guideImageZoomState.x = 0;
      guideImageZoomState.y = 0;
      return;
    }

    const stageRect = el.stage.getBoundingClientRect();
    const baseWidth = el.image.offsetWidth || stageRect.width;
    const baseHeight = el.image.offsetHeight || stageRect.height;
    const scaledWidth = baseWidth * guideImageZoomState.scale;
    const scaledHeight = baseHeight * guideImageZoomState.scale;
    const maxX = Math.max(0, (scaledWidth - stageRect.width) / 2 + 24);
    const maxY = Math.max(0, (scaledHeight - stageRect.height) / 2 + 24);

    guideImageZoomState.x = Math.max(-maxX, Math.min(maxX, guideImageZoomState.x));
    guideImageZoomState.y = Math.max(-maxY, Math.min(maxY, guideImageZoomState.y));
  }

  function applyGuideImageTransform(animate = false) {
    const el = guideLightboxEls();
    if (!el.panzoom) return;
    clampGuideImagePan();
    el.panzoom.classList.toggle('is-zoomed', guideImageZoomState.scale > 1.001);
    el.panzoom.classList.toggle('is-animating', animate);
    el.panzoom.style.transform = `translate3d(${guideImageZoomState.x}px, ${guideImageZoomState.y}px, 0) scale(${guideImageZoomState.scale})`;
    if (animate) {
      window.setTimeout(() => el.panzoom?.classList.remove('is-animating'), 180);
    }
  }

  function resetGuideImageZoom(animate = false) {
    guideImageZoomState.scale = 1;
    guideImageZoomState.x = 0;
    guideImageZoomState.y = 0;
    guideImageZoomState.gesture = '';
    applyGuideImageTransform(animate);
  }

  function closeGuideImage() {
    const el = guideLightboxEls();
    if (!el.root) return;
    el.root.hidden = true;
    el.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('guide-lightbox-open');
    resetGuideImageZoom(false);
    if (el.image) {
      el.image.removeAttribute('src');
      el.image.alt = '';
    }
  }

  function openGuideImage(img) {
    if (!img) return;
    const el = guideLightboxEls();
    const src = img.currentSrc || img.getAttribute('src') || '';
    if (!el.root || !el.image || !src) return;

    const figure = img.closest('figure');
    const captionText = figure?.querySelector('figcaption')?.textContent?.trim() || img.alt?.trim() || '';

    resetGuideImageZoom(false);
    el.image.src = src;
    el.image.alt = img.alt || '';
    if (el.caption) {
      el.caption.textContent = captionText;
      el.caption.hidden = !captionText;
    }

    el.root.hidden = false;
    el.root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('guide-lightbox-open');
    requestAnimationFrame(() => el.shell?.focus({ preventScroll: true }));
  }

  function setupGuideLightbox() {
    const el = guideLightboxEls();
    if (!el.root || el.root.dataset.bound === '1') return;
    el.root.dataset.bound = '1';

    el.root.addEventListener('click', (event) => {
      // The enlarged image itself owns gestures/taps. Any click elsewhere in
      // the viewer closes it, so a separate close button is unnecessary.
      if (!event.target.closest?.('.guide-lightbox-panzoom')) closeGuideImage();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.root.hidden) closeGuideImage();
    });

    if (!el.stage) return;

    el.stage.addEventListener('touchstart', (event) => {
      if (el.root.hidden) return;

      if (event.touches.length === 2) {
        event.preventDefault();
        const [a, b] = event.touches;
        const center = getTouchCenter(a, b);
        guideImageZoomState.gesture = 'pinch';
        guideImageZoomState.pinchDistance = Math.max(1, getTouchDistance(a, b));
        guideImageZoomState.pinchCenterX = center.x;
        guideImageZoomState.pinchCenterY = center.y;
        guideImageZoomState.startScale = guideImageZoomState.scale;
        guideImageZoomState.startX = guideImageZoomState.x;
        guideImageZoomState.startY = guideImageZoomState.y;
      } else if (event.touches.length === 1 && guideImageZoomState.scale > 1.001) {
        event.preventDefault();
        const touch = event.touches[0];
        guideImageZoomState.gesture = 'pan';
        guideImageZoomState.panTouchX = touch.clientX;
        guideImageZoomState.panTouchY = touch.clientY;
        guideImageZoomState.startX = guideImageZoomState.x;
        guideImageZoomState.startY = guideImageZoomState.y;
      }
    }, { passive: false });

    el.stage.addEventListener('touchmove', (event) => {
      if (el.root.hidden) return;

      if (event.touches.length === 2 && guideImageZoomState.gesture === 'pinch') {
        event.preventDefault();
        const [a, b] = event.touches;
        const distance = Math.max(1, getTouchDistance(a, b));
        const center = getTouchCenter(a, b);
        const nextScale = Math.max(1, Math.min(5, guideImageZoomState.startScale * (distance / guideImageZoomState.pinchDistance)));

        // Move the image with the pinch center so zoom feels anchored to the
        // fingers instead of always zooming from the exact screen center.
        guideImageZoomState.scale = nextScale;
        guideImageZoomState.x = guideImageZoomState.startX + (center.x - guideImageZoomState.pinchCenterX);
        guideImageZoomState.y = guideImageZoomState.startY + (center.y - guideImageZoomState.pinchCenterY);
        applyGuideImageTransform(false);
      } else if (event.touches.length === 1 && guideImageZoomState.gesture === 'pan' && guideImageZoomState.scale > 1.001) {
        event.preventDefault();
        const touch = event.touches[0];
        guideImageZoomState.x = guideImageZoomState.startX + (touch.clientX - guideImageZoomState.panTouchX);
        guideImageZoomState.y = guideImageZoomState.startY + (touch.clientY - guideImageZoomState.panTouchY);
        applyGuideImageTransform(false);
      }
    }, { passive: false });

    el.stage.addEventListener('touchend', (event) => {
      if (el.root.hidden) return;
      if (event.touches.length === 0) {
        guideImageZoomState.gesture = '';
        if (guideImageZoomState.scale < 1.06) resetGuideImageZoom(true);
        else applyGuideImageTransform(true);
      } else if (event.touches.length === 1 && guideImageZoomState.scale > 1.001) {
        const touch = event.touches[0];
        guideImageZoomState.gesture = 'pan';
        guideImageZoomState.panTouchX = touch.clientX;
        guideImageZoomState.panTouchY = touch.clientY;
        guideImageZoomState.startX = guideImageZoomState.x;
        guideImageZoomState.startY = guideImageZoomState.y;
      }
    }, { passive: false });

    el.stage.addEventListener('touchcancel', () => {
      guideImageZoomState.gesture = '';
      applyGuideImageTransform(true);
    }, { passive: false });

    // Desktop fallback: wheel + Ctrl/Meta zooms the opened image without
    // opening a separate original-file page.
    el.stage.addEventListener('wheel', (event) => {
      if (el.root.hidden || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      guideImageZoomState.scale = Math.max(1, Math.min(5, guideImageZoomState.scale * factor));
      if (guideImageZoomState.scale <= 1.001) resetGuideImageZoom(false);
      else applyGuideImageTransform(false);
    }, { passive: false });
  }

  function prepareGuideMedia() {
    const content = document.getElementById('guideArticleContent');
    if (!content) return;

    content.querySelectorAll('figure[data-media-display-width]').forEach(figure => {
      const width = Number(figure.dataset.mediaDisplayWidth || 0);
      if (Number.isFinite(width) && width > 0) {
        figure.style.setProperty('--guide-media-display-width', `${Math.round(width)}px`);
      }
    });

    if (guideState.type !== 'article') return;

    content.querySelectorAll('img').forEach(img => {
      if (img.closest('.guide-index-card')) return;
      img.classList.add('guide-zoomable');
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-label', currentLang === 'en' ? 'Open image' : 'Открыть изображение');
      img.closest('figure')?.classList.add('guide-zoomable-figure');
    });
  }

  function bindGuideLinks() {
    const content = document.getElementById('guideArticleContent');
    if (!content || content.dataset.interactionsBound === '1') return;
    content.dataset.interactionsBound = '1';

    content.addEventListener('click', (event) => {
      const zoomImage = event.target.closest('img.guide-zoomable');
      if (zoomImage) {
        event.preventDefault();
        event.stopPropagation();
        openGuideImage(zoomImage);
        return;
      }

      const anchor = event.target.closest('a[href]');
      if (!anchor) return;

      const rawHref = anchor.getAttribute('href') || '';
      if (rawHref.startsWith('#')) {
        event.preventDefault();
        scrollGuideToHash(rawHref);
        return;
      }

      let url;
      try { url = new URL(rawHref, guideState.sourceUrl); } catch { return; }

      event.preventDefault();

      if (url.hostname === 'teletype.in') {
        let current;
        try { current = new URL(guideState.sourceUrl); } catch { current = null; }

        if (current && url.pathname === current.pathname && url.hash) {
          if (scrollGuideToHash(url.hash)) return;
        }

        window.loadGuide(url.toString(), { pushHistory: true });
        return;
      }

      nativeOpenUrl(url.toString());
    });

    content.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const zoomImage = event.target.closest('img.guide-zoomable');
      if (!zoomImage) return;
      event.preventDefault();
      openGuideImage(zoomImage);
    });
  }

  function normalizeWorkerLocalized(value, fallback = '') {
    if (typeof value === 'string') return { ru: value, en: '' };
    return {
      ru: value?.ru || fallback,
      en: value?.en || '',
    };
  }


  function escapeGuideHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatGuideDateClient(iso, lang) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function guideIndexCardHtml(item, lang) {
    const hasRequested = item?.availableLanguages?.[lang] !== false;
    const shownLang = hasRequested ? lang : (item?.availableLanguages?.ru ? 'ru' : lang);
    const title = item?.title?.[shownLang] || item?.title?.ru || item?.title?.en || 'Guide';
    const preview = item?.preview?.[shownLang] || '';
    const date = formatGuideDateClient(item?.publishedAt, lang);
    const badge = lang === 'en' && !item?.availableLanguages?.en
      ? '<span class="guide-index-language-badge">RU only</span>' : '';
    const open = lang === 'en' ? 'Open' : 'Открыть';
    return `
      <a class="guide-index-card" href="${escapeGuideHtml(item?.url || '')}" data-lapbase-guide-link="1">
        ${item?.image ? `<img class="guide-index-image" src="${escapeGuideHtml(item.image)}" alt="" loading="lazy" decoding="async">` : ''}
        <div class="guide-index-copy">
          ${badge}
          ${date ? `<time class="guide-index-date" datetime="${escapeGuideHtml(item.publishedAt)}">${escapeGuideHtml(date)}</time>` : ''}
          <div class="guide-index-title">${escapeGuideHtml(title)}</div>
          ${preview ? `<div class="guide-index-preview">${escapeGuideHtml(preview)}</div>` : ''}
          <span class="guide-index-open">${open}</span>
        </div>
      </a>`;
  }

  function disconnectGuideIndexPagination() {
    if (guideState.indexObserver) {
      guideState.indexObserver.disconnect();
      guideState.indexObserver = null;
    }
    const scroller = getGuideScroller();
    if (guideState.indexScrollHandler && scroller) {
      scroller.removeEventListener('scroll', guideState.indexScrollHandler);
    }
    guideState.indexScrollHandler = null;
  }

  function updateGuideIndexSentinel() {
    const sentinel = document.getElementById('guideIndexSentinel');
    if (!sentinel) return;
    sentinel.hidden = !guideState.indexHasMore;
    sentinel.classList.toggle('is-loading', guideState.indexLoadingMore);
    const label = sentinel.querySelector('.guide-index-more-label');
    if (label) {
      label.textContent = guideState.indexLoadingMore
        ? (currentLang === 'en' ? 'Loading more…' : 'Загружаем ещё…')
        : (currentLang === 'en' ? 'Scroll for more' : 'Листайте дальше');
    }
  }

  function renderGuideIndex(lang) {
    const content = document.getElementById('guideArticleContent');
    if (!content) return;
    const cards = guideState.indexItems.map(item => guideIndexCardHtml(item, lang)).join('');
    content.innerHTML = `
      <div class="guide-index-list">${cards}</div>
      <div class="guide-index-more" id="guideIndexSentinel" aria-live="polite">
        <div class="guide-index-more-spinner" aria-hidden="true"></div>
        <span class="guide-index-more-label"></span>
      </div>`;
    updateGuideIndexSentinel();
    setupGuideIndexPagination();
  }

  function appendGuideIndexItems(items, lang) {
    const list = document.querySelector('#guideArticleContent .guide-index-list');
    if (!list || !items.length) return;
    list.insertAdjacentHTML('beforeend', items.map(item => guideIndexCardHtml(item, lang)).join(''));
  }

  async function loadMoreGuides() {
    if (guideState.type !== 'index' || !guideState.indexHasMore || guideState.indexLoadingMore || guideState.loading) return;
    guideState.indexLoadingMore = true;
    updateGuideIndexSentinel();

    try {
      // v5.44: an RSS batch can contain non-Last-Asylum posts from the author's main
      // feed. In that case the Worker correctly filters it out. Keep advancing
      // automatically until we either append real guide cards or exhaust the
      // feed, otherwise the sentinel can stay visible without another observer
      // transition and look "stuck" to the user.
      let attempts = 0;
      let appended = false;
      while (guideState.indexHasMore && !appended && attempts < 24) {
        attempts += 1;
        const nextPage = guideState.indexPage + 1;
        const endpoint = `${GUIDES_WORKER_ORIGIN}/api/article?url=${encodeURIComponent(guideState.sourceUrl)}&page=${nextPage}`;
        const response = await fetch(endpoint, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data?.ok || data.type !== 'index') throw new Error(data?.error || `HTTP ${response.status}`);

        const known = new Set(guideState.indexItems.map(item => item?.url).filter(Boolean));
        const fresh = (Array.isArray(data.items) ? data.items : []).filter(item => item?.url && !known.has(item.url));
        guideState.indexPage = Number(data.pagination?.page) || nextPage;
        guideState.indexHasMore = Boolean(data.pagination?.hasMore);

        if (fresh.length) {
          guideState.indexItems.push(...fresh);
          appendGuideIndexItems(fresh, currentLang === 'en' ? 'en' : 'ru');
          appended = true;
        }
      }
    } catch (error) {
      console.warn('[LAPBase] Guide pagination:', error);
      guideState.indexHasMore = false;
    } finally {
      guideState.indexLoadingMore = false;
      updateGuideIndexSentinel();

      // If the sentinel is still already inside the preload zone after an
      // append (large screens / short batch), continue without requiring the
      // user to nudge the scroll position.
      const scroller = getGuideScroller();
      if (guideState.indexHasMore && scroller) {
        const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (remaining < 800) setTimeout(loadMoreGuides, 60);
      }
    }
  }

  function setupGuideIndexPagination() {
    disconnectGuideIndexPagination();
    if (guideState.type !== 'index' || !guideState.indexHasMore) return;
    const sentinel = document.getElementById('guideIndexSentinel');
    const scroller = getGuideScroller();
    if (!sentinel || !scroller) return;

    if ('IntersectionObserver' in window) {
      guideState.indexObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) loadMoreGuides();
      }, { root: scroller, rootMargin: '700px 0px 700px 0px', threshold: 0.01 });
      guideState.indexObserver.observe(sentinel);
    }

    guideState.indexScrollHandler = () => {
      const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (remaining < 800) loadMoreGuides();
    };
    scroller.addEventListener('scroll', guideState.indexScrollHandler, { passive: true });
  }

  async function renderCurrentGuideLanguage() {
    if (guideState.loading) return;
    const el = guideEls();
    if (!el.article || !el.title || !el.content) return;

    const requested = currentLang === 'en' ? 'en' : 'ru';
    const hasRequested = Boolean(guideState.html[requested]);
    const fallbackLang = guideState.html.ru ? 'ru' : 'en';
    const shownLang = hasRequested ? requested : fallbackLang;
    const html = guideState.html[shownLang] || '';
    const title = guideState.titles[shownLang] || guideState.titles.ru || guideState.titles.en || '';

    if (el.card) {
      el.card.classList.toggle('is-index', guideState.type === 'index');
      el.card.classList.toggle('is-article', guideState.type !== 'index');
      el.card.dataset.guideType = guideState.type || 'article';
    }

    const isIndex = guideState.type === 'index';
    if (el.indexHeading) el.indexHeading.hidden = !isIndex;
    el.title.hidden = isIndex;
    el.title.textContent = isIndex ? '' : title;
    disconnectGuideIndexPagination();
    if (guideState.type === 'index' && Array.isArray(guideState.indexItems)) {
      renderGuideIndex(shownLang);
    } else {
      el.content.innerHTML = sanitizeClientHtml(html);
    }

    // Broken image URLs should not leave a giant empty frame in the reader.
    el.content.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => {
        const figure = img.closest('figure');
        if (figure && figure.querySelectorAll('img').length === 1) figure.classList.add('guide-media-error');
        else img.hidden = true;
      }, { once: true });
    });

    if (el.note) {
      if (requested === 'en' && shownLang !== 'en') {
        el.note.textContent = i18n[currentLang].guideEnglishMissing;
        el.note.hidden = false;
      } else {
        el.note.hidden = true;
      }
    }

    if (el.status) el.status.hidden = true;
    if (el.error) el.error.hidden = true;
    el.article.hidden = false;
    prepareGuideMedia();
    bindGuideLinks();
    setupGuideLightbox();
    updateGuideControls();
    if (guideState.type === 'article') resetGuideReadingProgress();
    else setGuideReadingProgressVisible(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      positionGuideFloatingControls();
      updateGuideReadingProgress();
    }));
  }

  async function loadGuide(url = GUIDES_HOME_URL, options = {}) {
    let target;
    try {
      target = new URL(url, GUIDES_HOME_URL);
    } catch {
      showGuideError(i18n[currentLang].guideErrorText);
      return;
    }

    if (target.hostname !== 'teletype.in') {
      nativeOpenUrl(target.toString());
      return;
    }

    const requestedHash = target.hash;
    target.hash = '';
    const targetUrl = target.toString();
    const previousUrl = guideState.sourceUrl;

    if (options.pushHistory && previousUrl && previousUrl !== targetUrl) {
      guideState.history.push({
        url: previousUrl,
        scrollTop: getGuideScrollTop(),
      });
      if (guideState.history.length > 40) guideState.history.shift();
    }

    setGuideLoading(true);
    guideState.sourceUrl = targetUrl;

    try {
      let data = options.forceRefresh ? null : getCachedGuide(targetUrl);

      if (!data) {
        guideFetchController?.abort();
        guideFetchController = new AbortController();
        const endpoint = `${GUIDES_WORKER_ORIGIN}/api/article?url=${encodeURIComponent(targetUrl)}`;
        const response = await fetch(endpoint, {
          cache: 'no-store',
          signal: guideFetchController.signal,
        });
        data = await response.json();

        if (!response.ok || !data?.ok || !data?.html) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }
        cacheGuide(targetUrl, data);
      }

      guideState.type = data.type || 'article';
      guideState.titles = normalizeWorkerLocalized(data.title, 'LAPBase Guide');
      guideState.html = normalizeWorkerLocalized(data.html, '');
      guideState.availableLanguages = data.availableLanguages || {
        ru: Boolean(guideState.html.ru),
        en: Boolean(guideState.html.en),
      };
      if (guideState.type === 'index') {
        guideState.indexItems = Array.isArray(data.items) ? data.items : [];
        guideState.indexPage = Number(data.pagination?.page) || 1;
        guideState.indexHasMore = data.pagination?.hasMore !== false && guideState.indexItems.length > 0;
        guideState.indexLoadingMore = false;
      } else {
        disconnectGuideIndexPagination();
        guideState.indexItems = [];
        guideState.indexPage = 1;
        guideState.indexHasMore = false;
        guideState.indexLoadingMore = false;
      }

      setGuideLoading(false);
      await renderCurrentGuideLanguage();

      if (requestedHash && scrollGuideToHash(requestedHash)) return;

      if (typeof options.restoreScrollTop === 'number') {
        requestAnimationFrame(() => setGuideScrollTop(options.restoreScrollTop, 'auto'));
      } else if (!options.preserveScroll) {
        requestAnimationFrame(() => setGuideScrollTop(0, 'auto'));
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('[LAPBase] Guide load error:', error);
      showGuideError(`${i18n[currentLang].guideErrorText} (${error.message})`);
    }
  }

  function retryCurrentGuide() {
    nativeVibrate('click');
    loadGuide(guideState.sourceUrl || GUIDES_HOME_URL, { pushHistory: false });
  }

  window.loadGuide = loadGuide;
  window.retryCurrentGuide = retryCurrentGuide;
  window.renderCurrentGuideLanguage = renderCurrentGuideLanguage;
  window.goGuideBack = goGuideBack;
  window.refreshCurrentGuide = refreshCurrentGuide;
  window.scrollGuideTop = scrollGuideTop;
  window.loadMoreGuides = loadMoreGuides;
  window.scheduleGuideReadingProgress = scheduleGuideReadingProgress;

  // Start loading in the background so the Guides tab is ready when opened.
  window.addEventListener('DOMContentLoaded', () => {
    updateGuideControls();
    setupGuideLightbox();
    setupTabKeyboardNavigation();
    loadGuide(GUIDES_HOME_URL, { pushHistory: false });
  }, { once: true });

  const navElem = document.getElementById('floatingNav');
  if (window.ResizeObserver && navElem) {
    new ResizeObserver(() => { updateIndicator(); positionGuideFloatingControls(); scheduleGuideReadingProgress(); }).observe(navElem);
  }
  const guideViewerCardElem = document.getElementById('guideViewerCard');
  if (window.ResizeObserver && guideViewerCardElem) {
    new ResizeObserver(() => { positionGuideFloatingControls(); scheduleGuideReadingProgress(); }).observe(guideViewerCardElem);
  }

  window.addEventListener('load', updateIndicator);
  window.addEventListener('resize', () => { updateIndicator(); positionGuideFloatingControls(); scheduleGuideReadingProgress(); });

  // Follow the lower edge of the dynamic guide container while scrolling.
  let guideDockRaf = 0;
  const scheduleGuideDockPosition = () => {
    if (guideDockRaf) return;
    guideDockRaf = requestAnimationFrame(() => {
      guideDockRaf = 0;
      positionGuideFloatingControls();
    });
  };
  const guideScrollSurface = document.getElementById('guides');
  guideScrollSurface?.addEventListener('scroll', scheduleGuideDockPosition, { passive: true });
  guideScrollSurface?.addEventListener('scroll', scheduleGuideReadingProgress, { passive: true });


  const toggleBtn = document.getElementById('toggleConverterBtn');
  const wrapper = document.getElementById('converterWrapper');
  const toggleBtnText = document.getElementById('toggleBtnText');

  if (toggleBtn && wrapper) {
    toggleBtn.addEventListener('click', function() {
      nativeVibrate('click');
      const isOpen = wrapper.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (toggleBtnText) {
        toggleBtnText.textContent = isOpen ? i18n[currentLang].hideConverter : i18n[currentLang].showConverter;
      }
      const arrow = toggleBtn.querySelector('.arrow');
      if (arrow) arrow.classList.toggle('open', isOpen);

      if (isOpen) {
        setTimeout(() => {
          const mainElem = document.querySelector('main');
          if (mainElem) {
            mainElem.scrollTo({
              top: wrapper.offsetTop - 20,
              behavior: 'smooth'
            });
          }
        }, 150);
      }
    });
  }

  const appContainer = document.getElementById('appContainer');

  // ----- TEXT SIZE: typography only -----
  const textSizeSlider = document.getElementById('textSizeSlider');
  const textSizeValueLabel = document.getElementById('textSizeValueLabel');
  const textSizeClasses = ['app-text-xsmall','app-text-small','app-text-medium','app-text-large','app-text-xlarge'];
  let currentTextSizeIndex = 2; // 16 px default

  function applyTextSizeByIndex(rawIndex, { persist = true, vibrate = false } = {}) {
    const index = Math.max(0, Math.min(textSizeClasses.length - 1, Number(rawIndex) || 0));
    if (vibrate && index !== currentTextSizeIndex) nativeVibrate('click');
    currentTextSizeIndex = index;

    [document.documentElement, appContainer].filter(Boolean).forEach(node => {
      textSizeClasses.forEach(cls => node.classList.remove(cls));
      node.classList.add(textSizeClasses[index]);
    });

    if (persist) localStorage.setItem('appTextSizeIndexV1', String(index));
    if (textSizeValueLabel) textSizeValueLabel.textContent = i18n[currentLang].textSizeNames[index];

    if (textSizeSlider) {
      const min = Number(textSizeSlider.min || 0);
      const max = Number(textSizeSlider.max || 4);
      const progress = max > min ? ((index - min) / (max - min)) * 100 : 50;
      textSizeSlider.value = String(index);
      textSizeSlider.style.setProperty('--slider-progress', `${Math.max(0, Math.min(100, progress))}%`);
      textSizeSlider.setAttribute('aria-valuetext', i18n[currentLang].textSizeNames[index]);
    }

    requestAnimationFrame(() => {
      updateIndicator();
      positionGuideFloatingControls();
      scheduleGuideReadingProgress();
      window.scheduleAdaptiveGlassContrast?.();
    });
  }

  textSizeSlider?.addEventListener('input', function() {
    applyTextSizeByIndex(parseInt(this.value, 10), { persist: true, vibrate: true });
  });

  // Restore the former text-size preference when available. v5.46 used
  // appSizeIndexV3 for its combined scale, so it is intentionally NOT used
  // here: text and interface are independent again.
  const savedTextSize = localStorage.getItem('appTextSizeIndexV1');
  const legacyTextSize = localStorage.getItem('appSizeIndexV2');
  let initialTextSizeIndex = 2;
  if (savedTextSize !== null) {
    const parsed = parseInt(savedTextSize, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 4) initialTextSizeIndex = parsed;
  } else if (legacyTextSize !== null) {
    const parsed = parseInt(legacyTextSize, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 4) initialTextSizeIndex = parsed;
  }
  applyTextSizeByIndex(initialTextSizeIndex, { persist: true, vibrate: false });

  // ----- INTERFACE SIZE: geometry only; typography never changes -----
  const interfaceSizeSlider = document.getElementById('interfaceSizeSlider');
  const interfaceSizeValueLabel = document.getElementById('interfaceSizeValueLabel');
  const interfaceSizeClasses = ['app-ui-small','app-ui-normal','app-ui-medium','app-ui-large'];
  let currentInterfaceSizeIndex = 1; // Normal default

  function updateInterfaceSizeControls(index) {

    if (interfaceSizeSlider) {
      const min = Number(interfaceSizeSlider.min || 0);
      const max = Number(interfaceSizeSlider.max || 3);
      const progress = max > min ? ((index - min) / (max - min)) * 100 : 0;
      interfaceSizeSlider.value = String(index);
      interfaceSizeSlider.style.setProperty('--slider-progress', `${Math.max(0, Math.min(100, progress))}%`);
      interfaceSizeSlider.setAttribute('aria-valuetext', i18n[currentLang].interfaceSizeNames[index]);
    }
  }

  function applyInterfaceSizeByIndex(rawIndex, { persist = true, vibrate = false } = {}) {
    const index = Math.max(0, Math.min(interfaceSizeClasses.length - 1, Number(rawIndex) || 0));
    if (vibrate && index !== currentInterfaceSizeIndex) nativeVibrate('click');
    currentInterfaceSizeIndex = index;

    [document.documentElement, appContainer].filter(Boolean).forEach(node => {
      interfaceSizeClasses.forEach(cls => node.classList.remove(cls));
      node.classList.add(interfaceSizeClasses[index]);
    });

    if (persist) localStorage.setItem('appInterfaceSizeIndexV1', String(index));
    if (interfaceSizeValueLabel) interfaceSizeValueLabel.textContent = i18n[currentLang].interfaceSizeNames[index];
    updateInterfaceSizeControls(index);

    requestAnimationFrame(() => {
      updateIndicator();
      positionGuideFloatingControls();
      scheduleGuideReadingProgress();
      setTimeout(() => {
        updateIndicator();
        positionGuideFloatingControls();
        scheduleGuideReadingProgress();
        window.scheduleAdaptiveGlassContrast?.();
      }, 180);
      window.scheduleAdaptiveGlassContrast?.();
    });
  }

  interfaceSizeSlider?.addEventListener('input', function() {
    applyInterfaceSizeByIndex(parseInt(this.value, 10), { persist: true, vibrate: true });
  });

  // v5.46's four-step combined preference is migrated only to interface size.
  const savedInterfaceSize = localStorage.getItem('appInterfaceSizeIndexV1');
  const v546CombinedSize = localStorage.getItem('appSizeIndexV3');
  let initialInterfaceSizeIndex = 1;
  if (savedInterfaceSize !== null) {
    const parsed = parseInt(savedInterfaceSize, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 3) initialInterfaceSizeIndex = parsed;
  } else if (v546CombinedSize !== null) {
    const parsed = parseInt(v546CombinedSize, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 3) initialInterfaceSizeIndex = parsed;
  }
  applyInterfaceSizeByIndex(initialInterfaceSizeIndex, { persist: true, vibrate: false });

  const supportFab = document.getElementById('supportFab');
  const supportPopup = document.getElementById('supportPopup');
  const popupClose = document.getElementById('popupClose');
  let supportPopupReturnFocus = null;

  function getPopupFocusable() {
    if (!supportPopup) return [];
    return Array.from(supportPopup.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'));
  }

  function openPopup() {
    if (!supportPopup) return;
    nativeVibrate('heavy');
    supportPopupReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : supportFab;
    supportPopup.classList.add('active');
    supportPopup.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.scheduleAdaptiveGlassContrast?.();
    requestAnimationFrame(() => {
      const focusable = getPopupFocusable();
      (popupClose || focusable[0])?.focus({ preventScroll: true });
    });
  }

  function closePopup() {
    if (!supportPopup || !supportPopup.classList.contains('active')) return;
    nativeVibrate('click');
    supportPopup.classList.remove('active');
    supportPopup.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    window.scheduleAdaptiveGlassContrast?.();
    requestAnimationFrame(() => supportPopupReturnFocus?.focus?.({ preventScroll: true }));
  }

  if (supportFab) supportFab.addEventListener('click', openPopup);
  if (popupClose) popupClose.addEventListener('click', closePopup);
  if (supportPopup) {
    supportPopup.addEventListener('click', function(e) {
      if (e.target === this) closePopup();
    });
    supportPopup.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopup();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getPopupFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // ----- КОНВЕРТЕР ВРЕМЕНИ -----
  (function() {
    const userOffset = -new Date().getTimezoneOffset();

    const baseOffsets = [];
    for (let h = -12; h <= 14; h++) {
      for (let m = 0; m < 60; m += 30) {
        const total = h * 60 + m;
        if (total < -12 * 60 || total > 14 * 60) continue;
        baseOffsets.push(total);
      }
    }
    baseOffsets.sort((a, b) => a - b);

    let allOffsets = new Set(baseOffsets);
    allOffsets.add(userOffset);
    const offsets = Array.from(allOffsets).sort((a, b) => a - b);

    function formatOffset(minutes) {
      const sign = minutes >= 0 ? '+' : '-';
      const abs = Math.abs(minutes);
      const h = String(Math.floor(abs / 60)).padStart(2, '0');
      const m = String(abs % 60).padStart(2, '0');
      return `UTC${sign}${h}:${m}`;
    }

    const fromSelect = document.getElementById('fromOffset');
    const toSelect = document.getElementById('toOffset');
    const timeInput = document.getElementById('timeInput');
    const resultSpan = document.getElementById('resultValue');

    if (!fromSelect || !toSelect || !timeInput) return;

    timeInput.type = "time";
    timeInput.step = "1";

    offsets.forEach(min => {
      const opt1 = document.createElement('option');
      opt1.value = min;
      opt1.textContent = formatOffset(min);
      fromSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = min;
      opt2.textContent = formatOffset(min);
      toSelect.appendChild(opt2);
    });

    fromSelect.value = userOffset;

    const defaultTo = -120;
    if (offsets.includes(defaultTo)) {
      toSelect.value = defaultTo;
    } else {
      let closest = offsets.reduce((a, b) => Math.abs(b - defaultTo) < Math.abs(a - defaultTo) ? b : a);
      toSelect.value = closest;
    }

    let isUserEditing = false;

    function getCurrentDeviceTime() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }

    function convertTime(timeStr, fromOffsetMinutes, toOffsetMinutes) {
      if (!timeStr) return null;
      const parts = timeStr.split(':').map(Number);
      const hours = parts[0];
      const minutes = parts[1];
      const seconds = parts[2] || 0;

      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
      }

      const now = new Date();
      const utcDate = Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hours,
        minutes,
        seconds
      );
      const targetTime = utcDate - fromOffsetMinutes * 60 * 1000 + toOffsetMinutes * 60 * 1000;
      const targetDate = new Date(targetTime);

      const hh = String(targetDate.getUTCHours()).padStart(2, '0');
      const mm = String(targetDate.getUTCMinutes()).padStart(2, '0');
      const ss = String(targetDate.getUTCSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    function updateResult() {
      const fromOffset = parseInt(fromSelect.value, 10);
      const toOffset = parseInt(toSelect.value, 10);

      if (!isUserEditing) {
        timeInput.value = getCurrentDeviceTime();
      }

      const result = convertTime(timeInput.value, fromOffset, toOffset);

      if (resultSpan) {
        if (result) {
          resultSpan.textContent = result;
          resultSpan.style.color = 'var(--color-label-primary)';
        } else {
          resultSpan.textContent = i18n[currentLang].invalidTimeMsg;
          resultSpan.style.color = '#dc2626';
        }
      }
    }

    timeInput.addEventListener('focus', () => { isUserEditing = true; });
    timeInput.addEventListener('blur', () => {
      if (!timeInput.value) isUserEditing = false;
    });
    timeInput.addEventListener('input', () => {
      isUserEditing = true;
      updateResult();
    });

    fromSelect.addEventListener('change', () => { updateResult(); });
    toSelect.addEventListener('change', () => { updateResult(); });

    let clockTimer = 0;
    function scheduleClockUpdate() {
      window.clearTimeout(clockTimer);
      const tabActive = document.getElementById('time')?.classList.contains('active');
      const shouldTick = tabActive && !document.hidden && !document.documentElement.classList.contains('tg-inactive') && !isUserEditing;
      clockTimer = window.setTimeout(() => {
        if (shouldTick) updateResult();
        scheduleClockUpdate();
      }, shouldTick ? 1000 : 15000);
    }

    document.addEventListener('visibilitychange', scheduleClockUpdate, { passive: true });
    window.__lapRefreshTimeConverter = () => { updateResult(); scheduleClockUpdate(); };
    updateResult();
    scheduleClockUpdate();
  })();

  // ===== КАЛЬКУЛЯТОР С МАССИВОМ ДАННЫХ =====
  (function() {
    const rawBaseData = [
        // --- Святилище ---
        ["Святилище",                  2,             32,                32,                   0,               700,            2      ],
        ["Святилище",                  3,            983,               983,                   0,               900,            3      ],
        ["Святилище",                  4,           2600,              2600,                   0,               900,          300      ],
        ["Святилище",                  5,          19730,             19730,                   0,              1000,          658      ],
        ["Святилище",                  6,          92710,             92710,                   0,               900,         2063      ],
        ["Святилище",                  7,         235800,            235800,                   0,               900,         5440      ],
        ["Святилище",                  8,         395600,            395600,                   0,               800,        10895      ],
        ["Святилище",                  9,         605800,            605800,              208700,              1300,        15410      ],
        ["Святилище",                 10,         748700,            748700,              232900,              1400,        20123      ],
        ["Святилище",                 11,        1850000,           1850000,              601800,              2300,        26043      ],
        ["Святилище",                 12,        3100000,           3100000,              959000,              2900,        33857      ],
        ["Святилище",                 13,        3520000,           3520000,             1080000,              2800,        44013      ],
        ["Святилище",                 14,        4910000,           4910000,             1650000,              3500,        57218      ],
        ["Святилище",                 15,        6470000,           6470000,             2290000,              4400,        80105      ],
        ["Святилище",                 16,       11900000,          11900000,             3970000,              5300,       112146      ],
        ["Святилище",                 17,       16670000,          16670000,             5140000,              6500,       157004      ],
        ["Святилище",                 18,       28220000,          28220000,             9330000,              8300,       219807      ],
        ["Святилище",                 19,       32710000,          32710000,            11340000,              9200,       307728      ],
        ["Святилище",                 20,       60030000,          60030000,            18410000,             12400,       435620      ],
        ["Святилище",                 21,       85450000,          85450000,            27640000,             14200,       577211      ],
        ["Святилище",                 22,      111200000,         111200000,            36660000,             16800,       752775      ],
        ["Святилище",                 23,      145200000,         145200000,            42760000,             18400,       975487      ],
        ["Святилище",                 24,      171200000,         171200000,            56250000,             20600,      1360882      ],
        ["Святилище",                 25,      277900000,         277900000,            97530000,             27100,      1931155      ],
        ["Святилище",                 26,      386800000,         386800000,           123500000,             31500,      2667737      ],
        ["Святилище",                 27,      548000000,         548000000,           168600000,             36400,      3737832      ],
        ["Святилище",                 28,      731100000,         731100000,           236500000,             42900,      5240004      ],
        ["Святилище",                 29,     1050000000,        1050000000,           316400000,             50100,      6824404      ],
        ["Святилище",                 30,     1360000000,        1360000000,           441300000,             59000,      8862343      ],

        // --- Зал Альянса ---
        ["Зал Альянса",               2,            228,                73,                   0,               700,           30      ],
        ["Зал Альянса",               3,            952,               337,                   0,               700,          105      ],
        ["Зал Альянса",               4,           2510,               836,                   0,               700,          180      ],
        ["Зал Альянса",               5,          20840,              7090,                   0,               800,          640      ],
        ["Зал Альянса",               6,          63340,             20770,                   0,               700,         1303      ],
        ["Зал Альянса",               7,         125600,             42910,                   0,               800,         2930      ],
        ["Зал Альянса",               8,         182800,             62540,                   0,               500,         5745      ],
        ["Зал Альянса",               9,         310100,            100000,              104500,              1000,         7966      ],
        ["Зал Альянса",              10,         383200,            124300,              122800,               900,        10348      ],
        ["Зал Альянса",              11,         957500,            319200,              313600,              1300,        13022      ],
        ["Зал Альянса",              12,        1550000,            512500,              527500,              1700,        16928      ],
        ["Зал Альянса",              13,        1710000,            584200,              558600,              1700,        22006      ],
        ["Зал Альянса",              14,        2440000,            821800,              766900,              2200,        28609      ],
        ["Зал Альянса",              15,        3250000,           1050000,             1100000,              2700,        40052      ],
        ["Зал Альянса",              16,        6400000,           2100000,             1840000,              3300,        56073      ],
        ["Зал Альянса",              17,        8290000,           2730000,             2600000,              3900,        78502      ],
        ["Зал Альянса",              18,       13630000,           4480000,             4500000,              5200,       109904      ],
        ["Зал Альянса",              19,       16510000,           5340000,             5490000,              5400,       153864      ],
        ["Зал Альянса",              20,       29540000,           9850000,             9580000,              7500,       217810      ],
        ["Зал Альянса",              21,       41840000,          13950000,            13150000,              8600,       291006      ],
        ["Зал Альянса",              22,       54720000,          18240000,            16620000,             10200,       378787      ],
        ["Зал Альянса",              23,       65810000,          22260000,            22700000,             11200,       488944      ],
        ["Зал Альянса",              24,       85280000,          28090000,            27210000,             12300,       681641      ],
        ["Зал Альянса",              25,      133600000,          45790000,            43860000,             16200,       967378      ],
        ["Зал Альянса",              26,      209800000,          70290000,            65340000,             19300,      1338369      ],
        ["Зал Альянса",              27,      259200000,          87740000,            87170000,             21800,      1873716      ],
        ["Зал Альянса",              28,      387600000,         125700000,           122000000,             26000,      2628002      ],
        ["Зал Альянса",              29,      523400000,         171100000,           175000000,             30900,      3413762      ],
        ["Зал Альянса",              30,      723200000,         241100000,           222400000,             36400,      4435652      ],

        // --- Мастерская противоядий ---
        ["Мастерская противоядий",     2,            148,               148,                   0,               800,            5      ],
        ["Мастерская противоядий",     3,            677,               677,                   0,               400,           30      ],
        ["Мастерская противоядий",     4,           1630,              1630,                   0,               700,          220      ],
        ["Мастерская противоядий",     5,           3560,              3560,                   0,               700,          300      ],
        ["Мастерская противоядий",     6,          10490,             10490,                   0,               400,          480      ],
        ["Мастерская противоядий",     7,          20940,             20940,                   0,               600,          640      ],
        ["Мастерская противоядий",     8,          31910,             31910,                   0,               700,         1550      ],
        ["Мастерская противоядий",     9,          52130,             52130,               16580,               700,         2155      ],
        ["Мастерская противоядий",    10,          62790,             62790,               19150,               400,         2687      ],
        ["Мастерская противоядий",    11,         157200,            157200,               51260,               800,         3255      ],
        ["Мастерская противоядий",    12,         259300,            259300,               86710,              1000,         4232      ],
        ["Мастерская противоядий",    13,         281700,            281700,               92770,               700,         5501      ],
        ["Мастерская противоядий",    14,         392500,            392500,              132300,              1100,         7153      ],
        ["Мастерская противоядий",    15,         573600,            573600,              176500,              1100,        10013      ],
        ["Мастерская противоядий",    16,         968000,            968000,              330200,              1800,        14018      ],
        ["Мастерская противоядий",    17,        1240000,           1240000,              420800,              1700,        19626      ],
        ["Мастерская противоядий",    18,        2290000,           2290000,              719700,              2500,        27476      ],
        ["Мастерская противоядий",    19,        2710000,           2710000,              878800,              2900,        38466      ],
        ["Мастерская противоядий",    20,        4880000,           4880000,             1630000,              3300,        53852      ],
        ["Мастерская противоядий",    21,        7010000,           7010000,             2310000,              4500,        72152      ],
        ["Мастерская противоядий",    22,        9060000,           9060000,             2830000,              4600,        93797      ],
        ["Мастерская противоядий",    23,       10840000,          10840000,             3450000,              5300,       121936      ],
        ["Мастерская противоядий",    24,       14190000,          14190000,             4660000,              6000,       170711      ],
        ["Мастерская противоядий",    25,       24510000,          24510000,             7510000,              7600,       230595      ],
        ["Мастерская противоядий",    26,       34870000,          34870000,            10820000,              9100,       334592      ],
        ["Мастерская противоядий",    27,       43550000,          43550000,            14390000,             10600,       470829      ],
        ["Мастерская противоядий",    28,       61410000,          61410000,            20970000,             12300,       660601      ],
        ["Мастерская противоядий",    29,       86530000,          86530000,            29020000,             14900,       852541      ],
        ["Мастерская противоядий",    30,      125500000,         125500000,            40560000,             17100,      1113103      ],

        // --- Казарма ---
        ["Казарма",                    2,             43,                13,                   0,               700,           63      ],
        ["Казарма",                    3,            974,               337,                   0,               900,          107      ],
        ["Казарма",                    4,           2610,               836,                   0,               700,          237      ],
        ["Казарма",                    5,          19800,              6730,                   0,               600,          781      ],
        ["Казарма",                    6,          61550,             20180,                   0,               600,         1856      ],
        ["Казарма",                    7,         115400,             39440,                   0,               800,         2958      ],
        ["Казарма",                    8,         191700,             65580,                   0,               800,         5316      ],
        ["Казарма",                    9,         306500,             98900,               80990,               600,         8048      ],
        ["Казарма",                   10,         378900,            122900,               96500,               900,        10565      ],
        ["Казарма",                   11,         912800,            304300,              249800,              1500,        13022      ],
        ["Казарма",                   12,        1580000,            525200,              399700,              1600,        16928      ],
        ["Казарма",                   13,        1680000,            571400,              492200,              1600,        22006      ],
        ["Казарма",                   14,        2400000,            810500,              672500,              2300,        28609      ],
        ["Казарма",                   15,        3280000,           1060000,              934600,              2300,        40052      ],
        ["Казарма",                   16,        6230000,           2040000,             1590000,              3500,        56073      ],
        ["Казарма",                   17,        8090000,           2660000,             2040000,              3600,        78502      ],
        ["Казарма",                   18,       14510000,           4770000,             3550000,              5100,       109904      ],
        ["Казарма",                   19,       16960000,           5490000,             4280000,              5400,       153864      ],
        ["Казарма",                   20,       29110000,           9700000,             7990000,              7300,       217810      ],
        ["Казарма",                   21,       44030000,          14680000,            11200000,              8400,       291006      ],
        ["Казарма",                   22,       51920000,          17310000,            14870000,             10000,       378787      ],
        ["Казарма",                   23,       69820000,          23610000,            17850000,             10900,       488944      ],
        ["Казарма",                   24,       81020000,          26690000,            22400000,             12200,       681641      ],
        ["Казарма",                   25,      134700000,          46170000,            39540000,             16000,       967378      ],
        ["Казарма",                   26,      196700000,          65880000,            56140000,             18500,      1338369      ],
        ["Казарма",                   27,      251400000,          85100000,            70230000,             21300,      1873716      ],
        ["Казарма",                   28,      359200000,         116500000,           102110000,             25500,      2628002      ],
        ["Казарма",                   29,      506000000,         165400000,           139400000,             30000,      3413762      ],
        ["Казарма",                   30,      695200000,         231700000,           180600000,             35500,      4435652      ],

        // --- Хижина строителей ---
        ["Хижина строителей",          2,             73,               228,                   0,               500,           20      ],
        ["Хижина строителей",          3,            337,               952,                   0,               400,           60      ],
        ["Хижина строителей",          4,            836,              2380,                   0,               600,          240      ],
        ["Хижина строителей",          5,           6910,             20320,                   0,               500,          640      ],
        ["Хижина строителей",          6,          20790,             63420,                   0,               400,         1530      ],
        ["Хижина строителей",          7,          42490,            124400,                   0,               700,         2988      ],
        ["Хижина строителей",          8,          63050,            184300,                   0,               400,         5766      ],
        ["Хижина строителей",          9,         102200,            316700,               33600,               900,         7988      ],
        ["Хижина строителей",         10,         125500,            386800,               40240,               800,        10366      ],
        ["Хижина строителей",         11,         320400,            961300,              102400,              1200,        13022      ],
        ["Хижина строителей",         12,         549600,           1660000,              173600,              1600,        16928      ],
        ["Хижина строителей",         13,         584000,           1710000,              197100,              1400,        22006      ],
        ["Хижина строителей",         14,         821600,           2430000,              248400,              2200,        28609      ],
        ["Хижина строителей",         15,        1080000,           3330000,              361700,              2200,        40052      ],
        ["Хижина строителей",         16,        2010000,           6130000,              660700,              3100,        56073      ],
        ["Хижина строителей",         17,        2670000,           8120000,              814100,              3300,        78502      ],
        ["Хижина строителей",         18,        4770000,          14530000,             1460000,              4600,       109904      ],
        ["Хижина строителей",         19,        5530000,          17090000,             1820000,              5000,       153864      ],
        ["Хижина строителей",         20,       10470000,          31400000,             3170000,              6900,       217810      ],
        ["Хижина строителей",         21,       14240000,          42720000,             4310000,              8000,       291006      ],
        ["Хижина строителей",         22,       17280000,          51830000,             5700000,              8900,       378787      ],
        ["Хижина строителей",         23,       23430000,          69270000,             6970000,             10000,       488944      ],
        ["Хижина строителей",         24,       27390000,          83150000,             9410000,             11300,       681641      ],
        ["Хижина строителей",         25,       49620000,         144700000,            15650000,             14600,       967378      ],
        ["Хижина строителей",         26,       67230000,         200700000,            23000000,             17200,      1338369      ],
        ["Хижина строителей",         27,       92260000,         272600000,            26750000,             19900,      1873716      ],
        ["Хижина строителей",         28,      117900000,         363400000,            39220000,             23200,      2628002      ],
        ["Хижина строителей",         29,      165900000,         507600000,            56670000,             27900,      3413762      ],
        ["Хижина строителей",         30,      247200000,         741600000,            80350000,             32600,      4435652      ],

        // --- Ферма 1-5 ---
        ["Ферма 1-5",                  2,             73,               225,                   0,               600,           38      ],
        ["Ферма 1-5",                  3,            337,              1040,                   0,               500,          107      ],
        ["Ферма 1-5",                  4,            836,              2420,                   0,               600,          177      ],
        ["Ферма 1-5",                  5,           1760,              5280,                   0,               600,          236      ],
        ["Ферма 1-5",                  6,           5230,             15390,                   0,               700,          411      ],
        ["Ферма 1-5",                  7,           9690,             29060,                   0,               700,          648      ],
        ["Ферма 1-5",                  8,          15450,             47330,                   0,               400,         1510      ],
        ["Ферма 1-5",                  9,          25210,             75630,               16190,               600,         2110      ],
        ["Ферма 1-5",                 10,          31080,             93240,               20580,               600,         2700      ],
        ["Ферма 1-5",                 11,          74370,            219300,               52090,               900,         3255      ],
        ["Ферма 1-5",                 12,         136100,            418700,               84750,               900,         4232      ],
        ["Ферма 1-5",                 13,         154200,            452200,               88810,               700,         5501      ],
        ["Ферма 1-5",                 14,         199700,            609000,              133800,              1100,         7153      ],
        ["Ферма 1-5",                 15,         301100,            892900,              176100,              1200,        10013      ],
        ["Ферма 1-5",                 16,         528600,           1550000,              331300,              1600,        14018      ],
        ["Ферма 1-5",                 17,         682700,           2070000,              426300,              2000,        19626      ],
        ["Ферма 1-5",                 18,        1220000,           3560000,              723400,              2500,        27476      ],
        ["Ферма 1-5",                 19,        1340000,           4030000,              894500,              2800,        38466      ],
        ["Ферма 1-5",                 20,        2550000,           7650000,             1640000,              3500,        53852      ],
        ["Ферма 1-5",                 21,        3580000,          10230000,             2100000,              4200,        72152      ],
        ["Ферма 1-5",                 22,        4320000,          13450000,             2790000,              4700,        93797      ],
        ["Ферма 1-5",                 23,        5830000,          17370000,             3590000,              5400,       121936      ],
        ["Ферма 1-5",                 24,        7070000,          20900000,             4410000,              6000,       170711      ],
        ["Ферма 1-5",                 25,       12060000,          36170000,             7350000,              7700,       230595      ],
        ["Ферма 1-5",                 26,       16180000,          48530000,            10840000,              9200,       334592      ],
        ["Ферма 1-5",                 27,       22810000,          68430000,            14210000,             10400,       470829      ],
        ["Ферма 1-5",                 28,       29820000,          88490000,            20510000,             12500,       660601      ],
        ["Ферма 1-5",                 29,       44310000,         134000000,            28400000,             14900,       852541      ],
        ["Ферма 1-5",                 30,       57920000,         173700000,            37730000,             17100,      1113103      ],

        // --- Мастерская по ремонту снаряжения ---
        ["Мастерская по ремонту снаряжения", 2,          73,               228,                   0,               500,           11      ],
        ["Мастерская по ремонту снаряжения", 3,         337,              1020,                   0,               400,           50      ],
        ["Мастерская по ремонту снаряжения", 4,         836,              2420,                   0,               600,          115      ],
        ["Мастерская по ремонту снаряжения", 5,        6740,             19820,                   0,               400,          700      ],
        ["Мастерская по ремонту снаряжения", 6,       31390,             95210,                   0,               400,         2166      ],
        ["Мастерская по ремонту снаряжения", 7,       67940,            200900,                   0,               600,         5034      ],
        ["Мастерская по ремонту снаряжения", 8,      109600,            338900,                   0,               800,         9948      ],
        ["Мастерская по ремонту снаряжения", 9,      187200,            561700,               56200,              1000,        13880      ],
        ["Мастерская по ремонту снаряжения",10,      219300,            647900,               71870,              1100,        18007      ],
        ["Мастерская по ремонту снаряжения",11,      518900,           1540000,              167800,              1500,        22788      ],
        ["Мастерская по ремонту снаряжения",12,      916500,           2760000,              285700,              2100,        29624      ],
        ["Мастерская по ремонту снаряжения",13,      998000,           3090000,              321900,              2100,        38512      ],
        ["Мастерская по ремонту снаряжения",14,     1440000,           4420000,              460700,              2700,        50065      ],
        ["Мастерская по ремонту снаряжения",15,     1980000,           5950000,              625700,              3100,        70091      ],
        ["Мастерская по ремонту снаряжения",16,     3540000,          10830000,             1140000,              4000,        98128      ],
        ["Мастерская по ремонту снаряжения",17,     4720000,          14370000,             1570000,              4400,       137379      ],
        ["Мастерская по ремонту снаряжения",18,     8170000,          24200000,             2480000,              6100,       192330      ],
        ["Мастерская по ремонту снаряжения",19,    10170000,          30400000,             3220000,              6700,       269262      ],
        ["Мастерская по ремонту снаряжения",20,    16190000,          49540000,             5790000,              8700,       381168      ],
        ["Мастерская по ремонту снаряжения",21,    23970000,          72920000,             7830000,             10600,       509260      ],
        ["Мастерская по ремонту снаряжения",22,    33290000,          98830000,            10280000,             11800,       662978      ],
        ["Мастерская по ремонту снаряжения",23,    38690000,         116100000,            12980000,             13200,       855952      ],
        ["Мастерская по ремонту снаряжения",24,    48600000,         145800000,            16410000,             15200,      1193772      ],
        ["Мастерская по ремонту снаряжения",25,    85460000,         254300000,            28040000,             19300,      1677760      ],
        ["Мастерская по ремонту снаряжения",26,   119500000,         348700000,            36680000,             22800,      2348145      ],
        ["Мастерская по ремонту снаряжения",27,   144300000,         442600000,            48430000,             26100,      3279003      ],
        ["Мастерская по ремонту снаряжения",28,   219500000,         668900000,            71680000,             30700,      4591803      ],
        ["Мастерская по ремонту снаряжения",29,   296000000,         887900000,            91700000,             36600,      5965384      ],
        ["Мастерская по ремонту снаряжения",30,   433100000,        1340000000,           124400000,             43600,      7755720      ],

        // --- Зерновой склад ---
        ["Зерновой склад",             2,             73,               228,                   0,               500,           30      ],
        ["Зерновой склад",             3,            337,               986,                   0,               900,          107      ],
        ["Зерновой склад",             4,            836,              2570,                   0,               500,          237      ],
        ["Зерновой склад",             5,           6900,             20300,                   0,               900,          647      ],
        ["Зерновой склад",             6,          30120,             91370,                   0,               600,         2280      ],
        ["Зерновой склад",             7,          59950,            176900,                   0,               700,         4350      ],
        ["Зерновой склад",             8,          92400,            276200,                   0,               800,         8555      ],
        ["Зерновой склад",             9,         161800,            475300,              146700,               900,        11468      ],
        ["Зерновой склад",            10,         183300,            540300,              176700,              1000,        15480      ],
        ["Зерновой склад",            11,         468400,           1400000,              432500,              1900,        19533      ],
        ["Зерновой склад",            12,         822300,           2500000,              763100,              2000,        25392      ],
        ["Зерновой склад",            13,         894400,           2670000,              817000,              2300,        33010      ],
        ["Зерновой склад",            14,        1170000,           3620000,             1230000,              2700,        42913      ],
        ["Зерновой склад",            15,        1740000,           5230000,             1610000,              3100,        60078      ],
        ["Зерновой склад",            16,        2910000,           8830000,             2910000,              4200,        84110      ],
        ["Зерновой склад",            17,        4180000,          12550000,             3910000,              4800,       117753      ],
        ["Зерновой склад",            18,        6770000,          20600000,             6890000,              6000,       164855      ],
        ["Зерновой склад",            19,        8640000,          26020000,             7670000,              6800,       230796      ],
        ["Зерновой склад",            20,       15380000,          46140000,            13690000,              9100,       326715      ],
        ["Зерновой склад",            21,       20540000,          61620000,            19910000,             10800,       435309      ],
        ["Зерновой склад",            22,       27910000,          84760000,            26370000,             12400,       568781      ],
        ["Зерновой склад",            23,       33430000,          98300000,            33490000,             13600,       733415      ],
        ["Зерновой склад",            24,       41390000,         125100000,            39220000,             15500,      1022662      ],
        ["Зерновой склад",            25,       74480000,         227600000,            68300000,             19900,      1450966      ],
        ["Зерновой склад",            26,       95300000,         285900000,            96960000,             23500,      2003952      ],
        ["Зерновой склад",            27,      129400000,         388200000,           125800000,             27100,      2810574      ],
        ["Зерновой склад",            28,      171900000,         525100000,           180100000,             31800,      3937803      ],
        ["Зерновой склад",            29,      249200000,         737900000,           251500000,             37500,      5118543      ],
        ["Зерновой склад",            30,      344600000,        1050000000,           342800000,             45000,      6649817      ],

        // --- Цветник 1-5 ---
        ["Цветник 1-5",                2,            135,               135,                   0,               400,           38      ],
        ["Цветник 1-5",                3,            677,               677,                   0,               700,          107      ],
        ["Цветник 1-5",                4,           1690,              1690,                   0,               500,          170      ],
        ["Цветник 1-5",                5,           3470,              3470,                   0,               700,          220      ],
        ["Цветник 1-5",                6,          10100,             10100,                   0,               500,          438      ],
        ["Цветник 1-5",                7,          20930,             20930,                   0,               700,          657      ],
        ["Цветник 1-5",                8,          32150,             32150,                   0,               600,         1500      ],
        ["Цветник 1-5",                9,          51270,             51270,               17590,               500,         2100      ],
        ["Цветник 1-5",               10,          62390,             62390,               19170,               700,         2700      ],
        ["Цветник 1-5",               11,         152800,            152800,               49030,               800,         3255      ],
        ["Цветник 1-5",               12,         257000,            257000,               82450,               900,         4232      ],
        ["Цветник 1-5",               13,         284700,            284700,               95290,               800,         5501      ],
        ["Цветник 1-5",               14,         414200,            414200,              129500,              1100,         7153      ],
        ["Цветник 1-5",               15,         572600,            572600,              172400,              1100,        10013      ],
        ["Цветник 1-5",               16,         985000,            985000,              333900,              1700,        14018      ],
        ["Цветник 1-5",               17,        1260000,           1260000,              424000,              1900,        19626      ],
        ["Цветник 1-5",               18,        2300000,           2300000,              770800,              2400,        27476      ],
        ["Цветник 1-5",               19,        2910000,           2910000,              902100,              2700,        38466      ],
        ["Цветник 1-5",               20,        5050000,           5050000,             1530000,              3600,        53852      ],
        ["Цветник 1-5",               21,        6670000,           6670000,             2220000,              4100,        72152      ],
        ["Цветник 1-5",               22,        9200000,           9200000,             2880000,              4700,        93797      ],
        ["Цветник 1-5",               23,       11390000,          11390000,             3440000,              5300,       121936      ],
        ["Цветник 1-5",               24,       14310000,          14310000,             4390000,              6100,       170711      ],
        ["Цветник 1-5",               25,       22830000,          22830000,             7330000,              7700,       230595      ],
        ["Цветник 1-5",               26,       34880000,          34880000,            11330000,              9000,       334592      ],
        ["Цветник 1-5",               27,       43350000,          43350000,            13440000,             10600,       470829      ],
        ["Цветник 1-5",               28,       61190000,          61190000,            19600000,             12400,       660601      ],
        ["Цветник 1-5",               29,       83150000,          83150000,            27170000,             14600,       852541      ],
        ["Цветник 1-5",               30,      121200000,         121200000,            38510000,             17500,      1113103      ],

        // --- Травяной склад ---
        ["Травяной склад",             2,            148,               148,                   0,               600,           30      ],
        ["Травяной склад",             3,            677,               677,                   0,               800,          107      ],
        ["Травяной склад",             4,           1680,              1680,                   0,               500,          237      ],
        ["Травяной склад",             5,          13430,             13430,                   0,               800,          647      ],
        ["Травяной склад",             6,          60230,             60230,                   0,               800,         2280      ],
        ["Травяной склад",             7,         120000,            120000,                   0,               500,         4350      ],
        ["Травяной склад",             8,         194200,            194200,                   0,               800,         8555      ],
        ["Травяной склад",             9,         296600,            296600,              151000,               900,        11468      ],
        ["Травяной склад",            10,         373400,            373400,              186600,              1100,        15888      ],
        ["Травяной склад",            11,         967300,            967300,              449800,              1900,        19533      ],
        ["Травяной склад",            12,        1630000,           1630000,              748000,              2100,        25392      ],
        ["Травяной склад",            13,        1730000,           1730000,              823600,              2200,        33010      ],
        ["Травяной склад",            14,        2510000,           2510000,             1210000,              2500,        42913      ],
        ["Травяной склад",            15,        3470000,           3470000,             1620000,              3200,        60078      ],
        ["Травяной склад",            16,        6300000,           6300000,             2860000,              4000,        84110      ],
        ["Травяной склад",            17,        7960000,           7960000,             3700000,              4900,       117753      ],
        ["Травяной склад",            18,       14160000,          14160000,             6640000,              6200,       164855      ],
        ["Травяной склад",            19,       16770000,          16770000,             7700000,              6900,       230796      ],
        ["Травяной склад",            20,       29150000,          29150000,            14550000,              9100,       326715      ],
        ["Травяной склад",            21,       43310000,          43310000,            20700000,             10700,       435309      ],
        ["Травяной склад",            22,       56360000,          56360000,            25770000,             12400,       568781      ],
        ["Травяной склад",            23,       66700000,          66700000,            34270000,             13600,       733415      ],
        ["Травяной склад",            24,       81450000,          81450000,            41080000,             15300,      1022662      ],
        ["Травяной склад",            25,      138000000,         138000000,            65560000,             19800,      1450966      ],
        ["Травяной склад",            26,      209500000,         209500000,            93190000,             23600,      2003952      ],
        ["Травяной склад",            27,      267900000,         267900000,           125000000,             26900,      2810574      ],
        ["Травяной склад",            28,      374500000,         374500000,           187600000,             32000,      3937803      ],
        ["Травяной склад",            29,      514000000,         514000000,           257800000,             37800,      5118543      ],
        ["Травяной склад",            30,      699600000,         699600000,           363100000,             44400,      6649817      ],

        // --- Лазарет 1-5 ---
        ["Лазарет 1-5",                    2,            228,                73,                   0,               800,           30      ],
        ["Лазарет 1-5",                    3,            984,               337,                   0,               700,           62      ],
        ["Лазарет 1-5",                    4,           2480,               836,                   0,               800,           88      ],
        ["Лазарет 1-5",                    5,          19280,              6560,                   0,               600,          638      ],
        ["Лазарет 1-5",                    6,          88910,             29310,                   0,               700,         2300      ],
        ["Лазарет 1-5",                    7,         187800,             63640,                   0,               800,         4388      ],
        ["Лазарет 1-5",                    8,         286200,             95720,                   0,               700,         8556      ],
        ["Лазарет 1-5",                    9,         461600,            157100,              115700,               900,        12000      ],
        ["Лазарет 1-5",                   10,         554700,            188200,              151700,               900,        15025      ],
        ["Лазарет 1-5",                   11,        1420000,            475000,              381800,              1600,        19533      ],
        ["Лазарет 1-5",                   12,        2430000,            798700,              648500,              2100,        25392      ],
        ["Лазарет 1-5",                   13,        2510000,            841300,              682600,              2200,        33010      ],
        ["Лазарет 1-5",                   14,        3770000,           1220000,              980000,              2500,        42913      ],
        ["Лазарет 1-5",                   15,        5100000,           1700000,             1420000,              3100,        60078      ],
        ["Лазарет 1-5",                   16,        8860000,           2920000,             2280000,              4200,        84110      ],
        ["Лазарет 1-5",                   17,       11660000,           3890000,             3190000,              4500,       117753      ],
        ["Лазарет 1-5",                   18,       21320000,           7010000,             5470000,              6200,       164855      ],
        ["Лазарет 1-5",                   19,       24760000,           8220000,             6290000,              6400,       230796      ],
        ["Лазарет 1-5",                   20,       45300000,          15100000,            12270000,              9000,       326715      ],
        ["Лазарет 1-5",                   21,       64640000,          21550000,            16630000,             10600,       435309      ],
        ["Лазарет 1-5",                   22,       82730000,          27240000,            22750000,             11800,       568781      ],
        ["Лазарет 1-5",                   23,      100200000,          34060000,            25800000,             13500,       733415      ],
        ["Лазарет 1-5",                   24,      123600000,          40880000,            35210000,             14900,      1022662      ],
        ["Лазарет 1-5",                   25,      216500000,          70870000,            57220000,             19600,      1450966      ],
        ["Лазарет 1-5",                   26,      307600000,         102500000,            77680000,             22900,      2003952      ],
        ["Лазарет 1-5",                   27,      402800000,         134300000,           110300000,             26500,      2810574      ],
        ["Лазарет 1-5",                   28,      553700000,         181200000,           154700000,             30900,      3937803      ],
        ["Лазарет 1-5",                   29,      786500000,         265600000,           212300000,             37100,      5118543      ],
        ["Лазарет 1-5",                   30,     1100000000,         361500000,           296900000,             43500,      6649817      ],

        // --- Древесный склад ---
        ["Древесный склад",            2,            228,                73,                   0,               800,           30      ],
        ["Древесный склад",            3,           1010,               337,                   0,               700,          107      ],
        ["Древесный склад",            4,           2610,               836,                   0,               600,          237      ],
        ["Древесный склад",            5,          19370,              6580,                   0,               800,          647      ],
        ["Древесный склад",            6,          92130,             30370,                   0,               700,         2280      ],
        ["Древесный склад",            7,         186200,             63100,                   0,               700,         4350      ],
        ["Древесный склад",            8,         287400,             96120,                   0,               600,         8555      ],
        ["Древесный склад",            9,         470800,            160300,              154600,              1000,        11468      ],
        ["Древесный склад",           10,         546000,            185200,              178400,              1000,        15480      ],
        ["Древесный склад",           11,        1390000,            465800,              443500,              1800,        19533      ],
        ["Древесный склад",           12,        2290000,            754300,              747500,              2100,        25392      ],
        ["Древесный склад",           13,        2620000,            877800,              869700,              2400,        33010      ],
        ["Древесный склад",           14,        3630000,           1180000,             1170000,              2500,        42913      ],
        ["Древесный склад",           15,        5130000,           1710000,             1530000,              3300,        60078      ],
        ["Древесный склад",           16,        9230000,           3040000,             2990000,              4100,        84110      ],
        ["Древесный склад",           17,       12300000,           4100000,             3750000,              4700,       117753      ],
        ["Древесный склад",           18,       21420000,           7040000,             6710000,              6200,       164855      ],
        ["Древесный склад",           19,       25010000,           8300000,             7970000,              6900,       230796      ],
        ["Древесный склад",           20,       43810000,          14600000,            14240000,              9100,       326715      ],
        ["Древесный склад",           21,       60760000,          20250000,            19420000,             10700,       435309      ],
        ["Древесный склад",           22,       82960000,          27320000,            24720000,             12200,       568781      ],
        ["Древесный склад",           23,      103300000,          35120000,            33870000,             13900,       733415      ],
        ["Древесный склад",           24,      123500000,          40850000,            39670000,             15300,      1022662      ],
        ["Древесный склад",           25,      218300000,          71430000,            71180000,             20000,      1450966      ],
        ["Древесный склад",           26,      303400000,         101100000,            95870000,             23500,      2003952      ],
        ["Древесный склад",           27,      400800000,         133600000,           131000000,             27000,      2810574      ],
        ["Древесный склад",           28,      542100000,         177400000,           184600000,             31700,      3937803      ],
        ["Древесный склад",           29,      744400000,         251400000,           244500000,             37700,      5118543      ],
        ["Древесный склад",           30,     1120000000,         366900000,           346900000,             44700,      6649817      ],

        // --- Лесопилка 1-5 ---
        ["Лесопилка 1-5",              2,            225,                66,                   0,               600,           38      ],
        ["Лесопилка 1-5",              3,            976,               337,                   0,               700,          107      ],
        ["Лесопилка 1-5",              4,           2410,               836,                   0,               700,          177      ],
        ["Лесопилка 1-5",              5,           5110,              1700,                   0,               400,          236      ],
        ["Лесопилка 1-5",              6,          14670,              4990,                   0,               800,          411      ],
        ["Лесопилка 1-5",              7,          31340,             10450,                   0,               500,          649      ],
        ["Лесопилка 1-5",              8,          49890,             16290,                   0,               700,         1508      ],
        ["Лесопилка 1-5",              9,          75520,             25170,               16170,               400,         2108      ],
        ["Лесопилка 1-5",             10,          91770,             30590,               20270,               700,         2700      ],
        ["Лесопилка 1-5",             11,         219200,             74340,               49320,               600,         3255      ],
        ["Лесопилка 1-5",             12,         408500,            132700,               85900,              1100,         4232      ],
        ["Лесопилка 1-5",             13,         435800,            148600,               94150,               700,         5501      ],
        ["Лесопилка 1-5",             14,         606200,            198800,              129300,              1200,         7153      ],
        ["Лесопилка 1-5",             15,         878000,            296100,              182600,              1300,        10013      ],
        ["Лесопилка 1-5",             16,        1480000,            501900,              326300,              1500,        14018      ],
        ["Лесопилка 1-5",             17,        2030000,            670400,              410600,              2000,        19626      ],
        ["Лесопилка 1-5",             18,        3460000,           1190000,              770600,              2500,        27476      ],
        ["Лесопилка 1-5",             19,        4250000,           1420000,              922500,              2500,        38466      ],
        ["Лесопилка 1-5",             20,        7530000,           2510000,             1670000,              3600,        53852      ],
        ["Лесопилка 1-5",             21,       10400000,           3640000,             2240000,              4100,        72152      ],
        ["Лесопилка 1-5",             22,       14180000,           4560000,             3020000,              4900,        93797      ],
        ["Лесопилка 1-5",             23,       16180000,           5430000,             3770000,              5400,       121936      ],
        ["Лесопилка 1-5",             24,       20830000,           7040000,             4510000,              6000,       170711      ],
        ["Лесопилка 1-5",             25,       36230000,          12080000,             7380000,              7600,       230595      ],
        ["Лесопилка 1-5",             26,       51600000,          17200000,            10620000,              9200,       334592      ],
        ["Лесопилка 1-5",             27,       64320000,          21440000,            13690000,             10600,       470829      ],
        ["Лесопилка 1-5",             28,       93040000,          31350000,            20510000,             12500,       660601      ],
        ["Лесопилка 1-5",             29,      126800000,          41940000,            27600000,             14600,       852541      ],
        ["Лесопилка 1-5",             30,      187600000,          62530000,            39900000,             17500,      1113103      ],

        // --- Мастерская Ворона ---
        ["Мастерская Ворона",          2,            148,               148,                   0,               800,           80      ],
        ["Мастерская Ворона",          3,            677,               677,                   0,               500,          137      ],
        ["Мастерская Ворона",          4,           1770,              1770,                   0,               700,          250      ],
        ["Мастерская Ворона",          5,           6760,              6760,                   0,               900,          480      ],
        ["Мастерская Ворона",          6,          19280,             19280,                   0,               600,          638      ],
        ["Мастерская Ворона",          7,          40360,             40360,                   0,               600,         1588      ],
        ["Мастерская Ворона",          8,          64710,             64710,                   0,               900,         3102      ],
        ["Мастерская Ворона",          9,          96000,             96000,               51120,               500,         4106      ],
        ["Мастерская Ворона",         10,         122900,            122900,               59340,               900,         5308      ],
        ["Мастерская Ворона",         11,         321300,            321300,              149100,               800,         6466      ],
        ["Мастерская Ворона",         12,         537100,            537100,              239600,              1500,         8406      ],
        ["Мастерская Ворона",         13,         555500,            555500,              287100,              1100,        11003      ],
        ["Мастерская Ворона",         14,         846900,            846900,              401200,              1500,        14305      ],
        ["Мастерская Ворона",         15,        1080000,           1080000,              561100,              1900,        20026      ],
        ["Мастерская Ворона",         16,        1970000,           1970000,              926700,              2500,        28036      ],
        ["Мастерская Ворона",         17,        2530000,           2530000,             1310000,              2800,        39251      ],
        ["Мастерская Ворона",         18,        4670000,           4670000,             2290000,              3300,        54952      ],
        ["Мастерская Ворона",         19,        5690000,           5690000,             2660000,              4100,        76932      ],
        ["Мастерская Ворона",         20,        9510000,           9510000,             4600000,              5300,       107705      ],
        ["Мастерская Ворона",         21,       13710000,          13710000,             6710000,              6100,       144305      ],
        ["Мастерская Ворона",         22,       17660000,          17660000,             8980000,              7200,       187594      ],
        ["Мастерская Ворона",         23,       22290000,          22290000,            11380000,              8000,       243872      ],
        ["Мастерская Ворона",         24,       27660000,          27660000,            13640000,              9000,       341422      ],
        ["Мастерская Ворона",         25,       50020000,          50020000,            23860000,             11500,       461189      ],
        ["Мастерская Ворона",         26,       67500000,          67500000,            32130000,             13400,       669184      ],
        ["Мастерская Ворона",         27,       83730000,          83730000,            42520000,             15500,       941658      ],
        ["Мастерская Ворона",         28,      123300000,         123300000,            61580000,             18200,      1321201      ],
        ["Мастерская Ворона",         29,      171700000,         171700000,            82120000,             21700,      1705082      ],
        ["Мастерская Ворона",         30,      244500000,         244500000,           120900000,             25800,      2226206      ],

        // --- Исследовательская лаборатория ---
        ["Исследовательская лаборатория", 2,        228,               228,                   0,              1100,           15      ],
        ["Исследовательская лаборатория", 3,        951,               951,                   0,               700,           30      ],
        ["Исследовательская лаборатория", 4,       2580,              2580,                   0,              1000,           90      ],
        ["Исследовательская лаборатория", 5,      20890,             20890,                   0,               900,          650      ],
        ["Исследовательская лаборатория", 6,      87930,             87930,                   0,               800,         2000      ],
        ["Исследовательская лаборатория", 7,     213100,            213100,                   0,               900,         5034      ],
        ["Исследовательская лаборатория", 8,     355000,            355000,                   0,              1100,         9533      ],
        ["Исследовательская лаборатория", 9,     533400,            533400,              175800,              1000,        13880      ],
        ["Исследовательская лаборатория",10,     634000,            634000,              204300,              1400,        18066      ],
        ["Исследовательская лаборатория",11,    1540000,           1540000,              522400,              2100,        22788      ],
        ["Исследовательская лаборатория",12,    2850000,           2850000,              860000,              2600,        29624      ],
        ["Исследовательская лаборатория",13,    3150000,           3150000,              972700,              2800,        38512      ],
        ["Исследовательская лаборатория",14,    4440000,           4440000,             1430000,              3400,        50065      ],
        ["Исследовательская лаборатория",15,    6220000,           6220000,             1970000,              3700,        70091      ],
        ["Исследовательская лаборатория",16,   10690000,          10690000,             3520000,              5500,        98128      ],
        ["Исследовательская лаборатория",17,   14140000,          14140000,             4340000,              5700,       137379      ],
        ["Исследовательская лаборатория",18,   22870000,          22870000,             7560000,              7900,       192330      ],
        ["Исследовательская лаборатория",19,   28190000,          28190000,             8870000,              8400,       269262      ],
        ["Исследовательская лаборатория",20,   49610000,          49610000,            16360000,             11500,       381168      ],
        ["Исследовательская лаборатория",21,   73230000,          73230000,            22420000,             13600,       509260      ],
        ["Исследовательская лаборатория",22,   92270000,          92270000,            29040000,             15200,       662978      ],
        ["Исследовательская лаборатория",23,  115100000,         115100000,            36990000,             17500,       855952      ],
        ["Исследовательская лаборатория",24,  153600000,         153600000,            45970000,             19100,      1193772      ],
        ["Исследовательская лаборатория",25,  244100000,         244100000,            80370000,             25000,      1677760      ],
        ["Исследовательская лаборатория",26,  354300000,         354300000,           108300000,             29600,      2348145      ],
        ["Исследовательская лаборатория",27,  454600000,         454600000,           144300000,             34000,      3279003      ],
        ["Исследовательская лаборатория",28,  629100000,         629100000,           206400000,             39900,      4591803      ],
        ["Исследовательская лаборатория",29,  916900000,         916900000,           293700000,             47300,      5965384      ],
        ["Исследовательская лаборатория",30, 1300000000,        1300000000,                   0,             56600,      7755720      ],

        // --- Разведывательный отряд ---
        ["Разведывательный отряд",     2,             73,                73,                   0,               300,          100      ],
        ["Разведывательный отряд",     3,            337,               337,                   0,               200,          180      ],
        ["Разведывательный отряд",     4,            836,               836,                   0,               200,          260      ],
        ["Разведывательный отряд",     5,           7130,              7130,                   0,               400,          600      ],
        ["Разведывательный отряд",     6,          29700,             29700,                   0,               300,         2308      ],
        ["Разведывательный отряд",     7,          62950,             62950,                   0,               500,         3988      ],
        ["Разведывательный отряд",     8,         100120,            100120,                   0,               500,         8108      ],
        ["Разведывательный отряд",     9,         159400,            159400,               25470,               600,        11068      ],
        ["Разведывательный отряд",    10,         196500,            196500,               29750,               700,        15016      ],
        ["Разведывательный отряд",    11,         486300,            486300,               77320,              1200,        19533      ],
        ["Разведывательный отряд",    12,         814400,            814400,              135400,              1300,        25392      ],
        ["Разведывательный отряд",    13,         882800,            882800,              133100,              1500,        33010      ],
        ["Разведывательный отряд",    14,        1250000,           1250000,              202800,              1800,        42913      ],
        ["Разведывательный отряд",    15,        1720000,           1720000,              274000,              1900,        60078      ],
        ["Разведывательный отряд",    16,        3140000,           3140000,              468600,              2700,        84110      ],
        ["Разведывательный отряд",    17,        4160000,           4160000,              608400,              2900,       117753      ],
        ["Разведывательный отряд",    18,        6590000,           6590000,             1140000,              4100,       164855      ],
        ["Разведывательный отряд",    19,        8710000,           8710000,             1290000,              4400,       230796      ],
        ["Разведывательный отряд",    20,       15400000,          15400000,             2330000,              5800,       326715      ],
        ["Разведывательный отряд",    21,       21510000,          21510000,             3240000,              6900,       435309      ],
        ["Разведывательный отряд",    22,       27720000,          27720000,             4450000,              7800,       568781      ],
        ["Разведывательный отряд",    23,       33690000,          33690000,             5420000,              8600,       733415      ],
        ["Разведывательный отряд",    24,       41820000,          41820000,             6600000,              9900,      1022662      ],
        ["Разведывательный отряд",    25,       72750000,          72750000,            12380000,             12800,      1450966      ],
        ["Разведывательный отряд",    26,       98600000,          98600000,            15970000,             14800,      2003952      ],
        ["Разведывательный отряд",    27,      130900000,         130900000,            21600000,             17100,      2810574      ],
        ["Разведывательный отряд",    28,      185100000,         185100000,            28290000,             20200,      3937803      ],
        ["Разведывательный отряд",    29,      251500000,         251500000,            40380000,             23900,      5118543      ],
        ["Разведывательный отряд",    30,      367400000,         367400000,            60270000,             28400,      6649817      ],

        // --- Плавильный цех ---
        ["Плавильный цех",             2,            148,               148,                   0,               600,           20      ],
        ["Плавильный цех",             3,            677,               677,                   0,               800,           30      ],
        ["Плавильный цех",             4,           1740,              1740,                   0,               500,          240      ],
        ["Плавильный цех",             5,           6930,              6930,                   0,               700,          480      ],
        ["Плавильный цех",             6,          20260,             20260,                   0,               800,          635      ],
        ["Плавильный цех",             7,          42560,             42560,                   0,               600,         1555      ],
        ["Плавильный цех",             8,          64360,             64360,                   0,               800,         2999      ],
        ["Плавильный цех",             9,         100100,            100100,               49780,               600,         4111      ],
        ["Плавильный цех",            10,         118700,            118700,               57130,               800,         5333      ],
        ["Плавильный цех",            11,         313500,            313500,              156800,              1100,         6511      ],
        ["Плавильный цех",            12,         525100,            525100,              247900,              1300,         8464      ],
        ["Плавильный цех",            13,         569600,            569600,              280300,              1100,        11003      ],
        ["Плавильный цех",            14,         803900,            803900,              405900,              1600,        14305      ],
        ["Плавильный цех",            15,        1050000,           1050000,              574500,              1700,        20026      ],
        ["Плавильный цех",            16,        2000000,           2000000,              937800,              2500,        28036      ],
        ["Плавильный цех",            17,        2660000,           2660000,             1360000,              2900,        39251      ],
        ["Плавильный цех",            18,        4430000,           4430000,             2220000,              3500,        54952      ],
        ["Плавильный цех",            19,        5450000,           5450000,             2830000,              3800,        76932      ],
        ["Плавильный цех",            20,        9850000,           9850000,             4750000,              5200,       107705      ],
        ["Плавильный цех",            21,       14520000,          14520000,             6480000,              6300,       144305      ],
        ["Плавильный цех",            22,       17470000,          17470000,             8360000,              7100,       187594      ],
        ["Плавильный цех",            23,       24050000,          24050000,            11520000,              8100,       243872      ],
        ["Плавильный цех",            24,       27910000,          27910000,            13900000,              8900,       341422      ],
        ["Плавильный цех",            25,       45730000,          45730000,            24000000,             11400,       461189      ],
        ["Плавильный цех",            26,       64550000,          64550000,            31460000,             13600,       669184      ],
        ["Плавильный цех",            27,       89450000,          89450000,            43380000,             15500,       941658      ],
        ["Плавильный цех",            28,      117300000,         117300000,            61140000,             18200,      1321201      ],
        ["Плавильный цех",            29,      171500000,         171500000,            84250000,             21800,      1705082      ],
        ["Плавильный цех",            30,      242500000,         242500000,           125400000,             25800,      2226206      ],

        // --- Отряд ---
        ["Отряд",                      2,            148,               148,                   0,               500,           72      ],
        ["Отряд",                      3,            677,               677,                   0,               500,          106      ],
        ["Отряд",                      4,           1680,              1680,                   0,               600,          240      ],
        ["Отряд",                      5,          14440,             14440,                   0,               500,          648      ],
        ["Отряд",                      6,          61540,             61540,                   0,               300,         2235      ],
        ["Отряд",                      7,         115600,            115600,                   0,               700,         4308      ],
        ["Отряд",                      8,         192900,            192900,                   0,               500,         8566      ],
        ["Отряд",                      9,         308800,            308800,               52220,              1000,        11988      ],
        ["Отряд",                     10,         359300,            359300,               61410,              1100,        15558      ],
        ["Отряд",                     11,         917400,            917400,              146300,              1400,        19533      ],
        ["Отряд",                     12,        1620000,           1620000,              253200,              2100,        25392      ],
        ["Отряд",                     13,        1770000,           1770000,              266700,              1800,        33010      ],
        ["Отряд",                     14,        2400000,           2400000,              385200,              2500,        42913      ],
        ["Отряд",                     15,        3540000,           3540000,              567100,              2700,        60078      ],
        ["Отряд",                     16,        6280000,           6280000,              948300,              3600,        84110      ],
        ["Отряд",                     17,        7840000,           7840000,             1320000,              4500,       117753      ],
        ["Отряд",                     18,       14620000,          14620000,             2200000,              5400,       164855      ],
        ["Отряд",                     19,       17770000,          17770000,             2580000,              6300,       230796      ],
        ["Отряд",                     20,       29200000,          29200000,             5020000,              8300,       326715      ],
        ["Отряд",                     21,       42070000,          42070000,             6670000,              9600,       435309      ],
        ["Отряд",                     22,       56230000,          56230000,             9000000,             11100,       568781      ],
        ["Отряд",                     23,       66990000,          66990000,            10770000,             12400,       733415      ],
        ["Отряд",                     24,       88040000,          88040000,            13940000,             13900,      1022662      ],
        ["Отряд",                     25,      135500000,         135500000,            22310000,             17500,      1450966      ],
        ["Отряд",                     26,      190100000,         190100000,            32330000,             21100,      2003952      ],
        ["Отряд",                     27,      249000000,         249000000,            42230000,             24300,      2810574      ],
        ["Отряд",                     28,      383300000,         383300000,            58890000,             28500,      3937803      ],
        ["Отряд",                     29,      533100000,         533100000,            80290000,             34300,      5118543      ],
        ["Отряд",                     30,      695500000,         695500000,           115800000,             40000,      6649817      ],

        // --- Таверна ---
        ["Таверна",                    2,             43,                13,                   0,               800,           10      ],
        ["Таверна",                    3,           1030,               337,                   0,               600,           30      ],
        ["Таверна",                    4,           2410,               836,                   0,               900,          240      ],
        ["Таверна",                    5,          19990,              6800,                   0,               600,          640      ],
        ["Таверна",                    6,         107800,             34300,                   0,               700,         2600      ],
        ["Таверна",                    7,         205100,             69350,                   0,               600,         5155      ],
        ["Таверна",                    8,         351200,            113600,                   0,               900,         9636      ],
        ["Таверна",                    9,         541800,            180600,              173200,              1100,        13238      ],
        ["Таверна",                   10,         662700,            224300,              214700,              1100,        18366      ],
        ["Таверна",                   11,        1570000,            531500,              507600,              1700,        22788      ],
        ["Таверна",                   12,        2770000,            921600,              929700,              2400,        29624      ],
        ["Таверна",                   13,        3040000,            981000,              949200,              2200,        38512      ],
        ["Таверна",                   14,        4480000,           1460000,             1410000,              3000,        50065      ],
        ["Таверна",                   15,        6190000,           2060000,             1850000,              3300,        70091      ],
        ["Таверна",                   16,       11180000,           3660000,             3540000,              4700,        98128      ],
        ["Таверна",                   17,       13710000,           4510000,             4520000,              4900,       137379      ],
        ["Таверна",                   18,       24870000,           8390000,             7610000,              6800,       192330      ],
        ["Таверна",                   19,       28640000,           9580000,             9050000,              7400,       269262      ],
        ["Таверна",                   20,       54020000,          17660000,            16400000,              9800,       381168      ],
        ["Таверна",                   21,       76510000,          25150000,            23060000,             11500,       509260      ],
        ["Таверна",                   22,       95610000,          32210000,            28630000,             13200,       662978      ],
        ["Таверна",                   23,      119600000,          39860000,            36660000,             14900,       855952      ],
        ["Таверна",                   24,      153900000,          51280000,            49460000,             16600,      1193772      ],
        ["Таверна",                   25,      244000000,          81990000,            80260000,             21400,      1677760      ],
        ["Таверна",                   26,      340800000,         116800000,           113600000,             25400,      2348145      ],
        ["Таверна",                   27,      463500000,         151100000,           144300000,             29200,      3279003      ],
        ["Таверна",                   28,      651900000,         213900000,           217900000,             34300,      4591803      ],
        ["Таверна",                   29,      872600000,         290900000,           280600000,             40600,      5965384      ],
        ["Таверна",                   30,     1250000000,         405400000,           404400000,             48400,      7755720      ],

        // --- Полигон 1-5 ---
        ["Полигон 1-5",   2,             28,                28,                   0,               700,           63      ],
        ["Полигон 1-5",   3,            677,               677,                   0,               600,          107      ],
        ["Полигон 1-5",   4,           1680,              1680,                   0,               800,          237      ],
        ["Полигон 1-5",   5,          14520,             14520,                   0,               700,          640      ],
        ["Полигон 1-5",   6,          62310,             62310,                   0,               700,         2200      ],
        ["Полигон 1-5",   7,         123500,            123500,                   0,               600,         4358      ],
        ["Полигон 1-5",   8,         195800,            195800,                   0,               900,         8568      ],
        ["Полигон 1-5",   9,         297400,            297400,              117400,               800,        12015      ],
        ["Полигон 1-5",  10,         365100,            365100,              147900,              1200,        15484      ],
        ["Полигон 1-5",  11,         936000,            936000,              371300,              1400,        19533      ],
        ["Полигон 1-5",  12,        1560000,           1560000,              641400,              2100,        25392      ],
        ["Полигон 1-5",  13,        1780000,           1780000,              703200,              2200,        33010      ],
        ["Полигон 1-5",  14,        2440000,           2440000,              977800,              2500,        42913      ],
        ["Полигон 1-5",  15,        3310000,           3310000,             1450000,              3100,        60078      ],
        ["Полигон 1-5",  16,        6160000,           6160000,             2400000,              4100,        84110      ],
        ["Полигон 1-5",  17,        8160000,           8160000,             3140000,              4500,       117753      ],
        ["Полигон 1-5",  18,       13830000,          13830000,             5420000,              6100,       164855      ],
        ["Полигон 1-5",  19,       17570000,          17570000,             6330000,              6800,       230796      ],
        ["Полигон 1-5",  20,       30190000,          30190000,            11950000,              9000,       326715      ],
        ["Полигон 1-5",  21,       40150000,          40150000,            16360000,             10400,       435309      ],
        ["Полигон 1-5",  22,       52260000,          52260000,            23070000,             11800,       568781      ],
        ["Полигон 1-5",  23,       69390000,          69390000,            26470000,             13500,       733415      ],
        ["Полигон 1-5",  24,       88490000,          88490000,            34580000,             14900,      1022662      ],
        ["Полигон 1-5",  25,      135500000,         135500000,            55450000,             19300,      1450966      ],
        ["Полигон 1-5",  26,      190100000,         190100000,            82770000,             23100,      2003952      ],
        ["Полигон 1-5",  27,      271500000,         271500000,           115500000,             26300,      2810574      ],
        ["Полигон 1-5",  28,      382300000,         382300000,           150900000,             31000,      3937803      ],
        ["Полигон 1-5",  29,      515100000,         515100000,           211200000,             37000,      5118543      ],
        ["Полигон 1-5",  30,      684300000,         684300000,           303700000,             43500,      6649817      ],

        // --- Стены ---
        ["Стены",                      2,             21,                66,                   0,               700,           30      ],
        ["Стены",                      3,            337,              1030,                   0,               700,           60      ],
        ["Стены",                      4,            836,              2520,                   0,               400,           88      ],
        ["Стены",                      5,           6850,             20140,                   0,               800,          653      ],
        ["Стены",                      6,          31190,             94610,                   0,               500,         1999      ],
        ["Стены",                      7,          78140,            231500,                   0,               700,         5418      ],
        ["Стены",                      8,         126500,            379600,                   0,               600,        10950      ],
        ["Стены",                      9,         209700,            619100,              134600,              1200,        15078      ],
        ["Стены",                     10,         253200,            759700,              163300,              1300,        20138      ],
        ["Стены",                     11,         595600,           1820000,              406300,              1600,        26043      ],
        ["Стены",                     12,        1100000,           3210000,              703700,              2500,        33857      ],
        ["Стены",                     13,        1260000,           3670000,              761400,              2400,        44013      ],
        ["Стены",                     14,        1670000,           5120000,             1050000,              3000,        57218      ],
        ["Стены",                     15,        2200000,           6520000,             1520000,              3300,        80105      ],
        ["Стены",                     16,        3950000,          11560000,             2670000,              4500,       112146      ],
        ["Стены",                     17,        5420000,          16360000,             3540000,              5300,       157004      ],
        ["Стены",                     18,        8870000,          26980000,             5720000,              6800,       219807      ],
        ["Стены",                     19,       11550000,          34650000,             6910000,              7500,       307728      ],
        ["Стены",                     20,       20020000,          60050000,            12970000,              9800,       435620      ],
        ["Стены",                     21,       26830000,          80500000,            17130000,             12100,       577211      ],
        ["Стены",                     22,       35580000,         108700000,            21950000,             13300,       752775      ],
        ["Стены",                     23,       46120000,         143500000,            27650000,             15300,       975487      ],
        ["Стены",                     24,       54770000,         163300000,            34910000,             16600,      1360882      ],
        ["Стены",                     25,       96280000,         290800000,            64600000,             22000,      1931155      ],
        ["Стены",                     26,      130700000,         402200000,            84890000,             25700,      2667737      ],
        ["Стены",                     27,      173200000,         510000000,           108200000,             29700,      3737832      ],
        ["Стены",                     28,      260900000,         772400000,           161000000,             35300,      5240004      ],
        ["Стены",                     29,      355300000,        1040000000,           225400000,             40900,      6824404      ],
        ["Стены",                     30,      499700000,        1460000000,           312400000,             48400,      8862343      ],

        // --- Статуя рейнджера ---
        ["Статуя рейнджера",           2,             73,               228,                   0,               800,           30      ],
        ["Статуя рейнджера",           3,            337,              1040,                   0,               600,          101      ],
        ["Статуя рейнджера",           4,            836,              2510,                   0,               400,          225      ],
        ["Статуя рейнджера",           5,           9510,             28530,                   0,               600,         1205      ],
        ["Статуя рейнджера",           6,          29960,             90880,                   0,               800,         2320      ],
        ["Статуя рейнджера",           7,          63620,            187700,                   0,               400,         4420      ],
        ["Статуя рейнджера",           8,         101800,            304300,                   0,               900,         8620      ],
        ["Статуя рейнджера",           9,         167100,            490900,              103500,               700,        11966      ],
        ["Статуя рейнджера",          10,         199400,            587900,              115600,              1200,        15666      ],
        ["Статуя рейнджера",          11,         463900,           1380000,              299000,              1500,        19503      ],
        ["Статуя рейнджера",          12,         794400,           2410000,              512200,              2000,        25392      ],
        ["Статуя рейнджера",          13,         874400,           2610000,              566200,              2200,        33010      ],
        ["Статуя рейнджера",          14,        1220000,           3760000,              786300,              2500,        42913      ],
        ["Статуя рейнджера",          15,        1630000,           4880000,             1100000,              2900,        60078      ],
        ["Статуя рейнджера",          16,        3130000,           9510000,             1900000,              4000,        84110      ],
        ["Статуя рейнджера",          17,        3930000,          11800000,             2390000,              4400,       117753      ],
        ["Статуя рейнджера",          18,        6930000,          21090000,             4350000,              5800,       164855      ],
        ["Статуя рейнджера",          19,        8200000,          24690000,             5430000,              6600,       230796      ],
        ["Статуя рейнджера",          20,       14970000,          44920000,             9140000,              8600,       326715      ],
        ["Статуя рейнджера",          21,       22040000,          66120000,            13590000,             10400,       435309      ],
        ["Статуя рейнджера",          22,       26080000,          79190000,            16430000,             11600,       568781      ],
        ["Статуя рейнджера",          23,       32830000,          96600000,            21530000,             12900,       733415      ],
        ["Статуя рейнджера",          24,       43460000,         131400000,            26160000,             14600,      1022662      ],
        ["Статуя рейнджера",          25,       70220000,         214600000,            47670000,             19100,      1450966      ],
        ["Статуя рейнджера",          26,       96700000,         290100000,            65850000,             22600,      2003952      ],
        ["Статуя рейнджера",          27,      126500000,         379500000,            82600000,             25400,      2810574      ],
        ["Статуя рейнджера",          28,      172200000,         526200000,           125500000,             30100,      3937803      ],
        ["Статуя рейнджера",          29,      260500000,         771400000,           162300000,             36000,      5118543      ],
        ["Статуя рейнджера",          30,      344800000,        1050000000,           227400000,             42500,      6649817      ],

        // --- Статуя колдуна ---
        ["Статуя колдуна",             2,             73,               228,                   0,               600,           30      ],
        ["Статуя колдуна",             3,            337,               989,                   0,               600,          100      ],
        ["Статуя колдуна",             4,            836,              2450,                   0,               600,          222      ],
        ["Статуя колдуна",             5,          10480,             31440,                   0,               600,         1203      ],
        ["Статуя колдуна",             6,          29740,             90200,                   0,               500,         2315      ],
        ["Статуя колдуна",             7,          58450,            172500,                   0,               700,         4415      ],
        ["Статуя колдуна",             8,          96040,            287100,                   0,               500,         8613      ],
        ["Статуя колдуна",             9,         163700,            481000,              104100,               900,        11914      ],
        ["Статуя колдуна",            10,         183300,            540300,              123400,              1000,        15608      ],
        ["Статуя колдуна",            11,         468500,           1400000,              301200,              1700,        19503      ],
        ["Статуя колдуна",            12,         803100,           2440000,              486800,              2000,        25392      ],
        ["Статуя колдуна",            13,         828100,           2480000,              573400,              2100,        33010      ],
        ["Статуя колдуна",            14,        1170000,           3590000,              784300,              2500,        42913      ],
        ["Статуя колдуна",            15,        1740000,           5220000,             1120000,              3100,        60078      ],
        ["Статуя колдуна",            16,        2850000,           8650000,             1920000,              3700,        84110      ],
        ["Статуя колдуна",            17,        4020000,          12070000,             2440000,              4600,       117753      ],
        ["Статуя колдуна",            18,        7010000,          21340000,             4440000,              5900,       164855      ],
        ["Статуя колдуна",            19,        8600000,          25900000,             5120000,              6400,       230796      ],
        ["Статуя колдуна",            20,       14250000,          42760000,             9380000,              8900,       326715      ],
        ["Статуя колдуна",            21,       21450000,          64340000,            13570000,             10200,       435309      ],
        ["Статуя колдуна",            22,       25980000,          78890000,            16190000,             11700,       568781      ],
        ["Статуя колдуна",            23,       33430000,          9830000,            22780000,             12800,       733415      ],
        ["Статуя колдуна",            24,       45110000,         136400000,            27320000,             14700,      1022662      ],
        ["Статуя колдуна",            25,       69990000,         213800000,            46200000,             19200,      1450966      ],
        ["Статуя колдуна",            26,       97400000,         292200000,            68230000,             22200,      2003952      ],
        ["Статуя колдуна",            27,      125100000,         375400000,            84030000,             25600,      2810574      ],
        ["Статуя колдуна",            28,      179400000,         548300000,           123800000,             30200,      3937803      ],
        ["Статуя колдуна",            29,      264300000,         782700000,           170000000,             35800,      5118543      ],
        ["Статуя колдуна",            30,      349200000,        1070000000,           233400000,             42700,      6649817      ],

        // --- Статуя воина ---
        ["Статуя воина",               2,             73,               228,                   0,               400,           30      ],
        ["Статуя воина",               3,            337,               992,                   0,               600,          100      ],
        ["Статуя воина",               4,            836,              2460,                   0,               600,          228      ],
        ["Статуя воина",               5,           9850,             29550,                   0,               700,         1200      ],
        ["Статуя воина",               6,          28930,             87760,                   0,               600,         2312      ],
        ["Статуя воина",               7,          58380,            172300,                   0,               500,         4407      ],
        ["Статуя воина",               8,          98950,            295800,                   0,               800,         8609      ],
        ["Статуя воина",               9,         163400,            480000,               99700,               900,        11914      ],
        ["Статуя воина",              10,         187300,            551900,              118700,              1100,        15608      ],
        ["Статуя воина",              11,         488500,           1460000,              289800,              1600,        19503      ],
        ["Статуя воина",              12,         789700,           2400000,              495600,              2000,        25392      ],
        ["Статуя воина",              13,         877600,           2620000,              536000,              1900,        33010      ],
        ["Статуя воина",              14,        1230000,           3810000,              788300,              2600,        42913      ],
        ["Статуя воина",              15,        1710000,           5130000,             1090000,              3000,        60078      ],
        ["Статуя воина",              16,        3010000,           9130000,             1910000,              4000,        84110      ],
        ["Статуя воина",              17,        3870000,          11610000,             2470000,              4500,       117753      ],
        ["Статуя воина",              18,        6910000,          21040000,             4480000,              5900,       164855      ],
        ["Статуя воина",              19,        7900000,          23790000,             5070000,              6300,       230796      ],
        ["Статуя воина",              20,       14890000,          44660000,            10000000,              8900,       326715      ],
        ["Статуя воина",              21,       21550000,          64650000,            13060000,             10000,       435309      ],
        ["Статуя воина",              22,       28260000,          85820000,            16840000,             11800,       568781      ],
        ["Статуя воина",              23,       33930000,          99800000,            22140000,             12800,       733415      ],
        ["Статуя воина",              24,       44410000,         134300000,            26560000,             14800,      1022662      ],
        ["Статуя воина",              25,       72030000,         220100000,            46340000,             19100,      1450966      ],
        ["Статуя воина",              26,      101800000,         305500000,            63020000,             22500,      2003952      ],
        ["Статуя воина",              27,      124500000,         373400000,            81590000,             25400,      2810574      ],
        ["Статуя воина",              28,      183600000,         561000000,           125800000,             30200,      3937803      ],
        ["Статуя воина",              29,      258500000,         765400000,           163400000,             35800,      5118543      ],
        ["Статуя воина",              30,      366000000,        1120000000,           227700000,             42500,      6649817      ],

        // --- Сторожевая башня ---
        ["Сторожевая башня",           2,          47710,             47710,                   0,               600,         2888      ],
        ["Сторожевая башня",           3,          63600,             63600,                   0,               700,         3155      ],
        ["Сторожевая башня",           4,          89150,             89150,                   0,               600,         4668      ],
        ["Сторожевая башня",           5,         155100,            155100,                   0,               500,         6169      ],
        ["Сторожевая башня",           6,         428900,            428900,                   0,              1100,        10670      ],
        ["Сторожевая башня",           7,         630700,            630700,                   0,              1100,        17886      ],
        ["Сторожевая башня",           8,         743100,            743100,                   0,              1500,        24261      ],
        ["Сторожевая башня",           9,         894400,            894400,              125900,              1300,        26133      ],
        ["Сторожевая башня",          10,        1040000,           1040000,              125600,              1700,        31890      ],
        ["Сторожевая башня",          11,        2150000,           2150000,              264600,              1900,        35810      ],
        ["Сторожевая башня",          12,        2870000,           2870000,              362900,              2600,        38088      ],
        ["Сторожевая башня",          13,        3130000,           3130000,              380600,              2800,        46214      ],
        ["Сторожевая башня",          14,        3630000,           3630000,              447300,              3000,        50065      ],
        ["Сторожевая башня",          15,        5100000,           5100000,              642900,              3100,        70091      ],
        ["Сторожевая башня",          16,        9090000,           9090000,             1130000,              4700,        98128      ],
        ["Сторожевая башня",          17,       11940000,          11940000,             1480000,              4900,       137379      ],
        ["Сторожевая башня",          18,       19860000,          19860000,             2730000,              6700,       192330      ],
        ["Сторожевая башня",          19,       24900000,          24900000,             3100000,              7300,       269262      ],
        ["Сторожевая башня",          20,       42230000,          42230000,             5680000,              9800,       381168      ],
        ["Сторожевая башня",          21,       62770000,          62770000,             7500000,             11600,       509260      ],
        ["Сторожевая башня",          22,       76180000,          76180000,             9610000,             13200,       662978      ],
        ["Сторожевая башня",          23,       96220000,          96220000,            12660000,             14700,       855952      ],
        ["Сторожевая башня",          24,      120000000,         120000000,            16120000,             16100,      1193772      ],
        ["Сторожевая башня",          25,      205100000,         205100000,            26360000,             21500,      1677760      ],
        ["Сторожевая башня",          26,      301900000,         301900000,            39490000,             25400,      2348145      ],
        ["Сторожевая башня",          27,      362100000,         362100000,            49080000,             29000,      3279003      ],
        ["Сторожевая башня",          28,      554500000,         554500000,            69690000,             34200,      4591803      ],
        ["Сторожевая башня",          29,      756900000,         756900000,            99180000,             40400,      5965384      ],
        ["Сторожевая башня",          30,     1050000000,        1050000000,           130200000,             48700,      7755720      ],

        // --- Ткацкая мастерская ---
        ["Ткацкая мастерская",         2,            148,               148,                   0,               700,           20      ],
        ["Ткацкая мастерская",         3,            677,               677,                   0,               800,           30      ],
        ["Ткацкая мастерская",         4,           1740,              1740,                   0,               800,          230      ],
        ["Ткацкая мастерская",         5,           7120,              7120,                   0,               700,          470      ],
        ["Ткацкая мастерская",         6,          19140,             19140,                   0,               600,          630      ],
        ["Ткацкая мастерская",         7,          41510,             41510,                   0,               700,         1565      ],
        ["Ткацкая мастерская",         8,          66470,             66470,                   0,               600,         2999      ],
        ["Ткацкая мастерская",         9,         103900,            103900,               52160,               800,         4055      ],
        ["Ткацкая мастерская",        10,         115600,            115600,               61820,               700,         5308      ],
        ["Ткацкая мастерская",        11,         317500,            317500,              156400,              1100,         6511      ],
        ["Ткацкая мастерская",        12,         517200,            517200,              253300,              1200,         8464      ],
        ["Ткацкая мастерская",        13,         591200,            591200,              284400,              1300,        11003      ],
        ["Ткацкая мастерская",        14,         822900,            822900,              398000,              1600,        14305      ],
        ["Ткацкая мастерская",        15,        1140000,           1140000,              525000,              1700,        20026      ],
        ["Ткацкая мастерская",        16,        1970000,           1970000,              993800,              2300,        28036      ],
        ["Ткацкая мастерская",        17,        2600000,           2600000,             1260000,              3000,        39251      ],
        ["Ткацкая мастерская",        18,        4760000,           4760000,             2190000,              3300,        54952      ],
        ["Ткацкая мастерская",        19,        5390000,           5390000,             2630000,              4000,        76932      ],
        ["Ткацкая мастерская",        20,        9930000,           9930000,             4660000,              5400,       107705      ],
        ["Ткацкая мастерская",        21,       13920000,          13920000,             6720000,              6300,       144305      ],
        ["Ткацкая мастерская",        22,       18030000,          18030000,             8440000,              6900,       187594      ],
        ["Ткацкая мастерская",        23,       22100000,          22100000,            11480000,              8200,       243872      ],
        ["Ткацкая мастерская",        24,       27500000,          27500000,            13750000,              8800,       341422      ],
        ["Ткацкая мастерская",        25,       47290000,          47290000,            22050000,             11400,       461189      ],
        ["Ткацкая мастерская",        26,       67000000,          67000000,            30830000,             13700,       669184      ],
        ["Ткацкая мастерская",        27,       89800000,          89800000,            41140000,             15400,       941658      ],
        ["Ткацкая мастерская",        28,      119000000,         119000000,            56180000,             18400,      1321201      ],
        ["Ткацкая мастерская",        29,      167400000,         167400000,            83440000,             21600,      1705082      ],
        ["Ткацкая мастерская",        30,      229300000,         229300000,           118400000,             25700,      2226206      ],
      ];

    const buildingNamesEn = {
      "Святилище": "Sanctuary",
      "Зал Альянса": "Alliance Hall",
      "Мастерская противоядий": "Antidote Workshop",
      "Казарма": "Barracks",
      "Хижина строителей": "Builder Hut",
      "Ферма 1-5": "Farm 1–5",
      "Мастерская по ремонту снаряжения": "Equipment Repair Workshop",
      "Зерновой склад": "Grain Warehouse",
      "Цветник 1-5": "Herb Garden 1–5",
      "Травяной склад": "Herb Warehouse",
      "Лазарет 1-5": "Infirmary 1–5",
      "Древесный склад": "Wood Warehouse",
      "Лесопилка 1-5": "Sawmill 1–5",
      "Мастерская Ворона": "Raven Workshop",
      "Исследовательская лаборатория": "Research Laboratory",
      "Разведывательный отряд": "Scout Squad",
      "Плавильный цех": "Smelter",
      "Отряд": "Squad",
      "Таверна": "Tavern",
      "Полигон 1-5": "Training Ground 1–5",
      "Стены": "Walls",
      "Статуя рейнджера": "Ranger Statue",
      "Статуя колдуна": "Mage Statue",
      "Статуя воина": "Warrior Statue",
      "Сторожевая башня": "Watchtower",
      "Ткацкая мастерская": "Weaving Workshop"
    };

    const buildingsContainer = document.getElementById('calc-buildings-container');
    const defFromSelect = document.getElementById('calc-def-from');
    const defToSelect = document.getElementById('calc-def-to');
    const applyDefBtn = document.getElementById('calc-apply-def-btn');
    const selectAllToggle = document.getElementById('calc-select-all-toggle');
    const selectAllControl = document.getElementById('calc-select-all-control');
    const selectAllLabel = document.getElementById('calc-select-all-label');
    const discountResInput = document.getElementById('calc-discount-res');
    const discountTimeInput = document.getElementById('calc-discount-time');
    const freeConstructionInput = document.getElementById('calc-free-construction');
    const existingGrainInput = document.getElementById('calc-existing-grain');
    const existingWoodInput = document.getElementById('calc-existing-wood');
    const existingHerbInput = document.getElementById('calc-existing-herb');
    const buildingSpeedupsInput = document.getElementById('calc-building-speedups');
    const generalSpeedupsInput = document.getElementById('calc-general-speedups');
    const fullNumbersToggle = document.getElementById('calc-full-numbers');
    const fullNumbersControl = document.getElementById('calc-full-numbers-control');

    const totalGrainEl = document.getElementById('calc-total-grain');
    const totalWoodEl = document.getElementById('calc-total-wood');
    const totalGrassEl = document.getElementById('calc-total-grass');
    const totalPowerEl = document.getElementById('calc-total-power');
    const totalTimeEl = document.getElementById('calc-total-time');
    const existingGrainResultEl = document.getElementById('calc-existing-grain-result');
    const existingWoodResultEl = document.getElementById('calc-existing-wood-result');
    const existingHerbResultEl = document.getElementById('calc-existing-herb-result');
    const missingGrainEl = document.getElementById('calc-missing-grain');
    const missingWoodEl = document.getElementById('calc-missing-wood');
    const missingHerbEl = document.getElementById('calc-missing-herb');
    const freeCoveredTimeEl = document.getElementById('calc-time-free-covered');
    const speedupRequiredTimeEl = document.getElementById('calc-time-speedup-required');
    const buildingSpeedupAvailableEl = document.getElementById('calc-building-speedup-available');
    const generalSpeedupAvailableEl = document.getElementById('calc-general-speedup-available');
    const missingSpeedupTimeEl = document.getElementById('calc-time-speedup-missing');
    const calcErrorBanner = document.getElementById('calc-error-banner');
    const calcResultsContent = document.getElementById('calc-results-content');

    const calcMath = window.LAPBaseCalculatorMath;
    if (!calcMath) throw new Error('LAPBase calculator math module is not loaded');

    // Index immutable building data once. Calculator input used to scan the
    // whole 754-row table repeatedly for every selected building.
    const buildingRowsByName = new Map();
    const buildingRowsByLevel = new Map();
    rawBaseData.forEach(row => {
      const name = row[0];
      const level = Number(row[1]);
      if (!buildingRowsByName.has(name)) buildingRowsByName.set(name, []);
      if (!buildingRowsByLevel.has(name)) buildingRowsByLevel.set(name, new Map());
      buildingRowsByName.get(name).push(row);
      buildingRowsByLevel.get(name).set(level, row);
    });

    const buildingNames = [...buildingRowsByName.keys()];
    const rangeResultCache = new Map();
    let lastRangeResultsByBuilding = new Map();
    let calculatorRaf = 0;
    let calculatorInitialized = false;


    function saveSettings() {
      localStorage.setItem('calcFullNumbers', fullNumbersToggle.checked);
    }

    function syncFullNumbersControl() {
      if (!fullNumbersControl || !fullNumbersToggle) return;
      fullNumbersControl.setAttribute('aria-checked', String(fullNumbersToggle.checked));
    }

    function loadSettings() {
      const saved = localStorage.getItem('calcFullNumbers');
      if (saved !== null) {
        fullNumbersToggle.checked = saved === 'true';
      } else {
        fullNumbersToggle.checked = true;
      }
      syncFullNumbersControl();
    }

    window.calcSaveSettings = saveSettings;

    function fillDefaultSelects() {
      defFromSelect.innerHTML = '';
      defToSelect.innerHTML = '';
      for (let i = 2; i <= 30; i++) {
        const opt1 = document.createElement('option');
        opt1.value = i;
        opt1.textContent = i;
        if (i === 2) opt1.selected = true;
        defFromSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = i;
        opt2.textContent = i;
        if (i === 30) opt2.selected = true;
        defToSelect.appendChild(opt2);
      }
    }

    function formatNumber(num) {
      if (!num || num < 0) return '0';
      if (fullNumbersToggle && fullNumbersToggle.checked) {
        // ru-RU uses NBSP/narrow-NBSP group separators. In narrow Telegram
        // WebViews those separators can make a long number behave like one
        // unbreakable token and stretch result grids. Normalize them to regular
        // spaces so wrapping can happen only between digit groups.
        return Math.round(num)
          .toLocaleString(currentLang === 'en' ? 'en-US' : 'ru-RU')
          .replace(/[\u00A0\u202F]/g, ' ');
      }
      if (num >= 1e9) return (num / 1e9).toFixed(2) + ' B';
      if (num >= 1e6) return (num / 1e6).toFixed(2) + ' M';
      if (num >= 1e3) return (num / 1e3).toFixed(1) + ' K';
      return Math.round(num).toString();
    }

    function formatTime(totalSec) {
      if (!totalSec || totalSec <= 0) return `0 ${i18n[currentLang].daysUnit} 0 ${i18n[currentLang].hoursUnit} 0 ${i18n[currentLang].minsUnit}`;
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      return `${days} ${i18n[currentLang].daysUnit} ${hours} ${i18n[currentLang].hoursUnit} ${mins} ${i18n[currentLang].minsUnit}`;
    }

    function formatDetailedTime(totalSec) {
      const secondsTotal = calcMath.roundRequired(totalSec);
      if (secondsTotal <= 0) return `0 ${i18n[currentLang].secondsUnitShort}`;

      const days = Math.floor(secondsTotal / 86400);
      const hours = Math.floor((secondsTotal % 86400) / 3600);
      const mins = Math.floor((secondsTotal % 3600) / 60);
      const seconds = secondsTotal % 60;
      const parts = [];
      if (days) parts.push(`${days} ${i18n[currentLang].daysUnit}`);
      if (hours) parts.push(`${hours} ${i18n[currentLang].hoursUnit}`);
      if (mins) parts.push(`${mins} ${i18n[currentLang].minsUnit}`);
      if (seconds || !parts.length) parts.push(`${seconds} ${i18n[currentLang].secondsUnitShort}`);
      return parts.join(' ');
    }

    function readCalculatorState() {
      return {
        bonuses: {
          constructionSpeedBoostPct: calcMath.nonNegative(discountTimeInput?.value),
          freeConstructionSeconds: calcMath.nonNegative(freeConstructionInput?.value),
          constructionResourceDiscountPct: calcMath.nonNegative(discountResInput?.value, 100),
        },
        existing: {
          resources: {
            grain: calcMath.nonNegative(existingGrainInput?.value),
            wood: calcMath.nonNegative(existingWoodInput?.value),
            herb: calcMath.nonNegative(existingHerbInput?.value),
          },
          speedups: {
            buildingMinutes: calcMath.nonNegative(buildingSpeedupsInput?.value),
            generalMinutes: calcMath.nonNegative(generalSpeedupsInput?.value),
          },
        },
      };
    }

    function normalizeCalculatorInput(input) {
      if (!input) return;
      const max = input === discountResInput ? 100 : Infinity;
      const normalized = calcMath.nonNegative(input.value, max);
      const integerOnly = [freeConstructionInput, existingGrainInput, existingWoodInput, existingHerbInput, buildingSpeedupsInput, generalSpeedupsInput].includes(input);
      input.value = String(integerOnly ? Math.round(normalized) : normalized).replace('.', currentLang === 'ru' ? ',' : '.');
    }

    function getUpgradeRows(name, fromLvl, toLvl) {
      const rowsByLevel = buildingRowsByLevel.get(name);
      const rows = [];
      const missingLevels = [];
      for (let targetLevel = fromLvl + 1; targetLevel <= toLvl; targetLevel++) {
        const row = rowsByLevel?.get(targetLevel);
        if (row) rows.push(row);
        else missingLevels.push(targetLevel);
      }
      return { rows, missingLevels };
    }

    function getBuildingLevelBounds(name) {
      const rows = buildingRowsByName.get(name) || [];
      if (!rows.length) return { minLvl: 2, maxLvl: 30 };
      return { minLvl: Number(rows[0][1]), maxLvl: Number(rows[rows.length - 1][1]) };
    }

    function rangeCacheKey(name, fromLvl, toLvl, bonuses) {
      return [
        name,
        fromLvl,
        toLvl,
        calcMath.nonNegative(bonuses.constructionSpeedBoostPct),
        calcMath.nonNegative(bonuses.freeConstructionSeconds),
        calcMath.nonNegative(bonuses.constructionResourceDiscountPct, 100),
      ].join('|');
    }

    function showCalculationErrors(errors) {
      const hasErrors = errors.length > 0;
      if (calcErrorBanner) {
        calcErrorBanner.hidden = !hasErrors;
        calcErrorBanner.textContent = hasErrors
          ? `${i18n[currentLang].calcDataErrorTitle}: ${errors.join('; ')}`
          : '';
      }
      if (calcResultsContent) calcResultsContent.hidden = hasErrors;
    }

    function renderBuildingSubtotal(subEl, rangeResult) {
      if (!subEl || !rangeResult) return;
      const resources = rangeResult.resources.afterDiscount;
      const grain = formatNumber(resources.grain);
      const wood = formatNumber(resources.wood);
      const herb = formatNumber(resources.herb);
      const time = formatDetailedTime(rangeResult.time.speedupRequiredSeconds);
      const renderKey = `${grain}|${wood}|${herb}|${time}`;
      if (subEl.dataset.renderKey === renderKey) return;
      subEl.dataset.renderKey = renderKey;
      subEl.innerHTML = `
        <div class="building-stat grain"><span class="building-stat-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-grain"></use></svg></span><span class="building-stat-value">${grain}</span></div>
        <div class="building-stat wood"><span class="building-stat-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-wood"></use></svg></span><span class="building-stat-value">${wood}</span></div>
        <div class="building-stat grass"><span class="building-stat-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-leaf"></use></svg></span><span class="building-stat-value">${herb}</span></div>
        <div class="building-stat time"><span class="building-stat-icon" aria-hidden="true"><svg class="ui-icon"><use href="#icon-timer"></use></svg></span><span class="building-stat-value">${time}</span></div>
      `;
    }

    function setCalculatorNumberText(element, value, kind = 'total') {
      if (!element) return;
      const text = formatNumber(value);
      element.textContent = text;

      element.classList.remove('calc-number-long', 'calc-number-xlong', 'calc-number-total', 'calc-number-availability');
      element.classList.add(kind === 'availability' ? 'calc-number-availability' : 'calc-number-total');

      if (!fullNumbersToggle?.checked) return;
      const digitCount = (text.match(/\d/g) || []).length;
      if (digitCount >= 13) element.classList.add('calc-number-xlong');
      else if (digitCount >= 10) element.classList.add('calc-number-long');
    }

    function renderFinalResult(result) {
      const required = result.resources.afterDiscount;
      setCalculatorNumberText(totalGrainEl, required.grain, 'total');
      setCalculatorNumberText(totalWoodEl, required.wood, 'total');
      setCalculatorNumberText(totalGrassEl, required.herb, 'total');
      setCalculatorNumberText(totalPowerEl, result.power, 'total');
      totalTimeEl.textContent = formatTime(result.time.adjustedSeconds);

      setCalculatorNumberText(existingGrainResultEl, result.resources.existing.grain, 'availability');
      setCalculatorNumberText(existingWoodResultEl, result.resources.existing.wood, 'availability');
      setCalculatorNumberText(existingHerbResultEl, result.resources.existing.herb, 'availability');
      setCalculatorNumberText(missingGrainEl, result.resources.missing.grain, 'availability');
      setCalculatorNumberText(missingWoodEl, result.resources.missing.wood, 'availability');
      setCalculatorNumberText(missingHerbEl, result.resources.missing.herb, 'availability');

      freeCoveredTimeEl.textContent = formatDetailedTime(result.time.freeCoveredSeconds);
      speedupRequiredTimeEl.textContent = formatDetailedTime(result.time.speedupRequiredSeconds);
      buildingSpeedupAvailableEl.textContent = formatDetailedTime(result.time.speedups.buildingAvailableSeconds);
      generalSpeedupAvailableEl.textContent = formatDetailedTime(result.time.speedups.generalAvailableSeconds);
      missingSpeedupTimeEl.textContent = formatDetailedTime(result.time.speedups.missingSeconds);
    }

    function calculateTotals() {
      const calcSection = document.getElementById('calc');
      if (calcSection && fullNumbersToggle) {
        calcSection.classList.toggle('calc-full-numbers-active', fullNumbersToggle.checked);
      }

      const state = readCalculatorState();
      const rangeResults = [];
      const nextRangeResultsByBuilding = new Map();
      const errors = [];

      buildingNames.forEach(name => {
        const tile = document.getElementById(`calc-tile-${name}`);
        if (!tile) return;

        const nameSpan = tile.querySelector('.building-name');
        if (nameSpan) {
          const displayName = currentLang === 'en' ? (buildingNamesEn[name] || name) : name;
          nameSpan.textContent = displayName;
        }

        if (!tile.classList.contains('active')) return;

        const fromSel = document.getElementById(`calc-from-${name}`);
        const toSel = document.getElementById(`calc-to-${name}`);
        if (!fromSel || !toSel) return;

        const fromLvl = Number.parseInt(fromSel.value, 10);
        const toLvl = Number.parseInt(toSel.value, 10);
        const subEl = document.getElementById(`calc-sub-${name}`);

        if (!Number.isFinite(fromLvl) || !Number.isFinite(toLvl) || fromLvl >= toLvl) {
          if (subEl) subEl.textContent = i18n[currentLang].lvlEqualsHint;
          return;
        }

        const { rows, missingLevels } = getUpgradeRows(name, fromLvl, toLvl);
        if (missingLevels.length) {
          const displayName = currentLang === 'en' ? (buildingNamesEn[name] || name) : name;
          errors.push(`${displayName}: ${i18n[currentLang].calcDataErrorDetail} ${missingLevels.join(', ')}`);
          if (subEl) subEl.textContent = `${i18n[currentLang].calcDataErrorDetail}: ${missingLevels.join(', ')}`;
          return;
        }

        const cacheKey = rangeCacheKey(name, fromLvl, toLvl, state.bonuses);
        let rangeResult = rangeResultCache.get(cacheKey);
        if (!rangeResult) {
          rangeResult = calcMath.calculateUpgradeRange(rows, state.bonuses);
          if (rangeResultCache.size > 320) rangeResultCache.clear();
          rangeResultCache.set(cacheKey, rangeResult);
        }
        rangeResults.push(rangeResult);
        nextRangeResultsByBuilding.set(name, rangeResult);
        renderBuildingSubtotal(subEl, rangeResult);
      });

      showCalculationErrors(errors);
      if (errors.length) return;

      const finalResult = calcMath.calculateFinalResult(rangeResults, state.existing);
      lastRangeResultsByBuilding = nextRangeResultsByBuilding;
      renderFinalResult(finalResult);
      window.__lapLastCalculatorResult = finalResult;
    }

    function refreshCalculatorNumberPresentation() {
      const calcSection = document.getElementById('calc');
      if (calcSection && fullNumbersToggle) {
        calcSection.classList.toggle('calc-full-numbers-active', fullNumbersToggle.checked);
      }

      // IMPORTANT: changing number format must not replace building subtotal
      // DOM. Replacing these nodes while <main> is scrolled invalidates the
      // browser's scroll anchor and can make the whole calculator jump.
      lastRangeResultsByBuilding.forEach((rangeResult, name) => {
        const subEl = document.getElementById(`calc-sub-${name}`);
        if (!subEl) return;

        const resources = rangeResult.resources.afterDiscount;
        const values = {
          grain: formatNumber(resources.grain),
          wood: formatNumber(resources.wood),
          grass: formatNumber(resources.herb),
        };

        let complete = true;
        Object.entries(values).forEach(([kind, text]) => {
          const valueEl = subEl.querySelector(`.building-stat.${kind} .building-stat-value`);
          if (!valueEl) {
            complete = false;
            return;
          }
          valueEl.textContent = text;
        });

        // Fallback is only for an uninitialized/malformed tile. Normal toggle
        // operation never reaches it, so existing scroll-anchor nodes survive.
        if (!complete) {
          delete subEl.dataset.renderKey;
          renderBuildingSubtotal(subEl, rangeResult);
          return;
        }

        const timeEl = subEl.querySelector('.building-stat.time .building-stat-value');
        if (timeEl) timeEl.textContent = formatDetailedTime(rangeResult.time.speedupRequiredSeconds);

        subEl.dataset.renderKey = [
          values.grain, values.wood, values.grass,
          formatDetailedTime(rangeResult.time.speedupRequiredSeconds),
        ].join('|');
      });

      if (window.__lapLastCalculatorResult) renderFinalResult(window.__lapLastCalculatorResult);
    }

    function setFullNumbersEnabled(nextChecked) {
      if (!fullNumbersToggle) return;

      const mainElem = document.querySelector('main');
      const scrollTop = mainElem ? mainElem.scrollTop : 0;

      fullNumbersToggle.checked = Boolean(nextChecked);
      syncFullNumbersControl();
      saveSettings();
      refreshCalculatorNumberPresentation();

      // The control sits deep inside the scrollable calculator. Preserve the
      // exact reading position even if Telegram/Chromium performs a late
      // layout/scroll-anchor adjustment after text metrics change.
      if (mainElem) {
        mainElem.scrollTop = scrollTop;
        requestAnimationFrame(() => {
          mainElem.scrollTop = scrollTop;
        });
      }
    }

    function scheduleCalculatorCalculation() {
      if (!calculatorInitialized || calculatorRaf) return;
      calculatorRaf = requestAnimationFrame(() => {
        calculatorRaf = 0;
        calculateTotals();
      });
    }


    function updateSelectAllControl() {
      if (!selectAllLabel) return;
      selectAllLabel.textContent = isAllSelected
        ? i18n[currentLang].deselectAllBtn
        : i18n[currentLang].selectAllBtn;
      if (selectAllToggle) selectAllToggle.checked = isAllSelected;
      if (selectAllControl) selectAllControl.setAttribute('aria-checked', String(isAllSelected));
    }

    function syncSelectAllState() {
      const totalTiles = buildingNames.length;
      const activeTiles = buildingNames.reduce((count, name) => {
        const tile = document.getElementById(`calc-tile-${name}`);
        return count + (tile && tile.classList.contains('active') ? 1 : 0);
      }, 0);
      isAllSelected = totalTiles > 0 && activeTiles === totalTiles;
      updateSelectAllControl();
    }

    window.calcUpdateSelectAllControl = updateSelectAllControl;

    function renderBuildings() {
      buildingsContainer.innerHTML = '';

      buildingNames.forEach(name => {
        const { minLvl, maxLvl } = getBuildingLevelBounds(name);

        const tile = document.createElement('div');
        tile.className = 'building-tile active';
        tile.id = `calc-tile-${name}`;

        let optionsFrom = '';
        let optionsTo = '';

        for (let l = minLvl; l <= maxLvl; l++) {
          optionsFrom += `<option value="${l}" ${l === minLvl ? 'selected' : ''}>${l}</option>`;
          optionsTo += `<option value="${l}" ${l === maxLvl ? 'selected' : ''}>${l}</option>`;
        }

        const displayName = currentLang === 'en' ? (buildingNamesEn[name] || name) : name;

        tile.innerHTML = `
          <div class="building-tile-topline">
            <span class="building-card-kicker">BUILDING</span>
            <button type="button" class="building-select-button" onclick="toggleBuildingTile('${name}')" aria-label="Выбрать здание" data-i18n-aria-label="buildingSelectAria">
              <span class="building-checkbox-custom"></span>
            </button>
          </div>

          <div class="building-tile-header">
            <div class="building-icon-shell" aria-hidden="true"><svg class="ui-icon"><use href="#icon-building"></use></svg></div>
            <div class="building-title-wrap" onclick="toggleBuildingTile('${name}')">
              <span class="building-name">${displayName}</span>
              <span class="building-card-status" data-i18n="buildingSelectedStatus">Выбрано для расчёта</span>
            </div>
          </div>

          <div class="building-levels-title" data-i18n="buildingLevelsTitle">Уровни улучшения</div>
          <div class="building-controls">
            <div class="level-select-wrap">
              <span class="level-select-label" data-i18n="fromLvlLabel">С уровня:</span>
              <select id="calc-from-${name}" class="level-select" onchange="window.calcCalculateTotals()">${optionsFrom}</select>
            </div>
            <div class="building-level-arrow" aria-hidden="true"><svg class="ui-icon"><use href="#icon-arrow-right"></use></svg></div>
            <div class="level-select-wrap">
              <span class="level-select-label" data-i18n="toLvlLabel">До уровня:</span>
              <select id="calc-to-${name}" class="level-select" onchange="window.calcCalculateTotals()">${optionsTo}</select>
            </div>
          </div>

          <div class="building-summary-label" data-i18n="buildingUpgradeCost">Стоимость улучшения</div>
          <div class="building-subtotals" id="calc-sub-${name}"></div>
        `;

        buildingsContainer.appendChild(tile);
      });

      calculateTotals();
      syncSelectAllState();
    }

    window.toggleBuildingTile = function(name) {
      nativeVibrate('click');
      const tile = document.getElementById(`calc-tile-${name}`);
      if (tile) {
        tile.classList.toggle('active');
        tile.classList.toggle('disabled', !tile.classList.contains('active'));
        syncSelectAllState();
        scheduleCalculatorCalculation();
      }
    };

    window.calcCalculateTotals = scheduleCalculatorCalculation;

    applyDefBtn.addEventListener('click', () => {
      nativeVibrate('click');
      const defFrom = parseInt(defFromSelect.value, 10) || 2;
      const defTo = parseInt(defToSelect.value, 10) || 30;

      buildingNames.forEach(name => {
        const { minLvl, maxLvl } = getBuildingLevelBounds(name);

        const fromSel = document.getElementById(`calc-from-${name}`);
        const toSel = document.getElementById(`calc-to-${name}`);
        if (fromSel) {
          const val = Math.min(Math.max(defFrom, minLvl), maxLvl);
          fromSel.value = val;
        }
        if (toSel) {
          const val = Math.min(Math.max(defTo, minLvl), maxLvl);
          toSel.value = val;
        }
      });

      scheduleCalculatorCalculation();
    });

    let isAllSelected = true;

    function setAllBuildingsSelected(nextSelected) {
      const mainElem = document.querySelector('main');
      const scrollTop = mainElem ? mainElem.scrollTop : 0;

      isAllSelected = Boolean(nextSelected);
      buildingNames.forEach(name => {
        const tile = document.getElementById(`calc-tile-${name}`);
        if (tile) {
          tile.classList.toggle('active', isAllSelected);
          tile.classList.toggle('disabled', !isAllSelected);
        }
      });

      updateSelectAllControl();
      scheduleCalculatorCalculation();

      // Keep the calculator at exactly the same reading position. The hidden
      // checkbox is not allowed to receive native label focus, and this also
      // protects against a late Telegram/Chromium scroll-anchor correction.
      if (mainElem) {
        mainElem.scrollTop = scrollTop;
        requestAnimationFrame(() => {
          mainElem.scrollTop = scrollTop;
        });
      }
    }

    if (selectAllToggle) selectAllToggle.checked = true;

    if (selectAllControl && selectAllToggle) {
      const activateSelectAllControl = () => {
        nativeVibrate('click');
        setAllBuildingsSelected(!isAllSelected);
      };

      selectAllControl.addEventListener('click', event => {
        // Prevent native <label> activation/focus of the visually hidden input.
        // That focus can make Telegram/Chromium change <main>.scrollTop.
        event.preventDefault();
        activateSelectAllControl();
      });

      selectAllControl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activateSelectAllControl();
      });
    }

    updateSelectAllControl();

    const calculatorInputs = [
      discountResInput, discountTimeInput, freeConstructionInput,
      existingGrainInput, existingWoodInput, existingHerbInput,
      buildingSpeedupsInput, generalSpeedupsInput,
    ].filter(Boolean);

    calculatorInputs.forEach(input => {
      input.addEventListener('input', scheduleCalculatorCalculation);
      input.addEventListener('blur', () => { normalizeCalculatorInput(input); scheduleCalculatorCalculation(); });
    });
    if (fullNumbersControl && fullNumbersToggle) {
      const activateFullNumbersControl = () => {
        nativeVibrate('click');
        setFullNumbersEnabled(!fullNumbersToggle.checked);
      };

      fullNumbersControl.addEventListener('click', event => {
        // Prevent native <label> activation. The hidden checkbox is focusable
        // by default, and Telegram/Chromium may scroll <main> to reveal that
        // invisible focused element. We toggle it ourselves without focusing it.
        event.preventDefault();
        activateFullNumbersControl();
      });

      fullNumbersControl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activateFullNumbersControl();
      });
    }

    function initializeCalculatorUI() {
      if (calculatorInitialized) return;
      calculatorInitialized = true;
      loadSettings();
      fillDefaultSelects();
      renderBuildings();
    }

    window.__lapEnsureCalculatorInitialized = initializeCalculatorUI;

    // Global appearance/language are cheap and should be ready immediately.
    setAccentColor(localStorage.getItem('appAccentColor') || 'orange', false);
    setAppLanguage(currentLang, false);

    // Pre-warm only when the device is not classified as LOW. Low-end
    // Telegram Android devices initialize on the first Calculator tap instead.
    const lowPerformanceDevice = document.documentElement.classList.contains('tg-performance-low');
    if (!lowPerformanceDevice && 'requestIdleCallback' in window) {
      window.requestIdleCallback(initializeCalculatorUI, { timeout: 2400 });
    } else if (!lowPerformanceDevice) {
      window.setTimeout(initializeCalculatorUI, 800);
    }
  })();




// ===== MINI APP INTERACTION POLICY =====
(() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  try {
    if (tg && typeof tg.enableVerticalSwipes === 'function') tg.enableVerticalSwipes();
  } catch (_) {}

  const editable = target => {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, [contenteditable="true"], select'));
  };

  document.addEventListener('contextmenu', event => {
    event.preventDefault();
  }, { capture: true });

  document.addEventListener('dragstart', event => {
    event.preventDefault();
  }, { capture: true });

  document.addEventListener('mousedown', event => {
    if (event.button && !editable(event.target)) event.preventDefault();
  }, { capture: true });

  document.addEventListener('auxclick', event => {
    if (!editable(event.target)) event.preventDefault();
  }, { capture: true });

  window.addEventListener('gesturestart', event => {
    event.preventDefault();
  }, { capture: true, passive: false });
})();
