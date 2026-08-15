LAPBase v5.30 — обновлена лента v1.0.1 простым списком главных изменений.

LAPBase Guides JSON Test v5.7

Изменение v5.7
---------------
Плавающие кнопки управления теперь привязаны к правому нижнему углу
видимого контейнера гайдов (позиция, отмеченная зелёной стрелкой).

- 16 px от правой границы контейнера;
- 16 px от его нижней видимой границы;
- пока контейнер продолжается ниже экрана, кнопки остаются над нижней
  навигацией LAPBase;
- когда пользователь доходит до конца контейнера, панель следует за его
  закруглённой нижней границей и остаётся внутри неё.

Cloudflare Worker менять не нужно. На GitHub Pages заменить:
index.html, styles.css, app.js


v5.8: Guide controls moved fully outside the reader container and fixed to the viewport bottom-right above the LAPBase navigation. Worker unchanged from v5.7.


v5.10 UI changes:
- Removed the lightbox "Original" action.
- Added custom two-finger pinch zoom (1x–5x) and one-finger pan while zoomed.
- Guide controls are a vertical floating dock pinned to the right side of the guide container.
- Cloudflare Worker is unchanged from v5.8.


v5.11: guide controls are centered on the guide container, keep a 16px gap from its bottom edge near the end, and otherwise float above the bottom navigation. Worker unchanged.


v5.12 UI fix:
- Guide controls removed from header area.
- Controls follow the visible lower-right corner of the guide container.
- Constant 16px right/bottom inset from the reader shell.
- Worker does not need to be changed from the currently deployed version.


v5.13: guide control dock moved physically into #guides and positioned absolutely from scrollTop/clientHeight. This avoids Telegram WebView fixed-position containing-block bugs and keeps it at the reader lower-right with a 16px inset. Worker unchanged.


v5.14: блок управления перемещён к нижней видимой части контейнера и следует за ней при прокрутке; при достижении конца остаётся внутри контейнера. Worker менять не требуется.


v5.15 UI:
- Donation button moved into the LAPBase brand row.
- In Telegram fullscreen it stays below the system Mini App chrome, next to the brand.
- Historical floating support-FAB positioning is explicitly overridden.


v5.18: Заголовок «База знаний» вынесен за предел glass-контейнера и получил отдельную иконку книги. Worker не менялся.

v5.19 UI:
- Все внутренние emoji-иконки заменены на единую SVG outline-систему в стиле иконки «База знаний».
- Основные заголовки разделов получили одинаковые glass-chip иконки.
- Нижняя навигация, калькулятор, ресурсы, настройки, управление гайдами и кнопка поддержки используют один stroke-стиль и текущий accent color.
- Брендовые логотипы Telegram и Teletype оставлены оригинальными.
- Cloudflare Worker не изменён относительно v5.18.


=== v5.20 THEME ===
- Settings -> Display now has Auto / Day / Night.
- Auto follows Telegram.WebApp.colorScheme and reacts to themeChanged.
- Outside Telegram, Auto follows prefers-color-scheme.
- Manual choice is stored in localStorage as appThemeMode.
- Telegram header/background/bottom bar are synchronized with the effective LAPBase theme.
- Cloudflare Worker is unchanged from v5.19.

=== v5.21 COMPLETE THEME ADAPTATION ===
- Полная семантическая палитра Day / Night для всех поверхностей приложения.
- Auto использует Telegram.WebApp.colorScheme + themeParams, включая кастомные темы Telegram.
- Ручные Day/Night больше не наследуют тёмные цвета Telegram: используются собственные палитры LAPBase.
- Telegram header/background/bottom bar синхронизируются с фактической темой LAPBase.
- Telegram bridge перенесён в <head>; добавлен ранний theme bootstrap для уменьшения вспышки неверной темы при запуске.
- Адаптированы: шапка, фон, glass-карточки, лента, калькулятор, поля/select, здания, итоги, настройки, переключатели, акцентные цвета, нижняя навигация, гайды, оглавление, таблицы, код, popups и lightbox.
- Добавлены theme-aware scrollbars, placeholders, select options и плавный переход темы.
- Cloudflare Worker не менялся.

v5.23 UI: full Liquid Glass material pass for Day/Night themes. Worker unchanged.


v5.24: Removed press transforms from cards to prevent jumping/shrinking on tap.

v5.27: The Guides glass reader now fills all remaining vertical space down to the bottom of the Guides viewport. Long lists/articles still grow naturally. The existing floating-control positioning logic was intentionally left unchanged so the dock stays at the same visible level.


v5.27 UI: Guides glass reader now extends behind the floating tab bar. Historical stacked bottom paddings were consolidated into one under-nav glass tail, so article/list endings no longer show a large blank area while the guide control dock keeps its previous visible level above navigation.


=== v5.29 Layered Depth + Liquid Glass ===
- Полностью переработан визуальный слой по принципу Layered Depth.
- Контентные карточки используют спокойный standard material, а Liquid Glass зарезервирован для навигации и интерактивных контролов.
- Добавлены 4 уровня глубины, оптические блики, lens-like tint, более точные тени и границы.
- Переработаны header, bottom navigation, кнопки, segmented controls, settings, calculator, guides, popup и lightbox.
- Карточки не двигаются при нажатии: feedback идет через свет/контраст, без layout shift.
- Добавлена поддержка prefers-reduced-motion / prefers-contrast / prefers-reduced-transparency.
- Cloudflare Worker не менялся.
