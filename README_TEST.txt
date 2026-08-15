LAPBase v5.67 — Telegram Mini App Optimization Pass

Цель версии
-----------
Полная техническая чистка текущего проекта без изменения бизнес-логики и визуальной системы. Версия собрана от v5.66 и сохраняет калькулятор v5.60+, гайды, Reading Progress, настройки текста/интерфейса, Day/Night/Auto и текущую нижнюю навигацию.

Главные изменения
-----------------
1. Telegram Mini App
- Удалена самодельная JS-высота --app-height и старые viewport/reflow-компенсации.
- Размер приложения опирается на реальный CSS dynamic viewport (100dvh).
- Safe Area / Content Safe Area синхронизируются только на Bot API 8.0+, на старых клиентах остаются CSS env()/Telegram CSS fallbacks.
- viewportChanged обрабатывается только после стабильного состояния для тяжёлых geometry updates.
- Сохранены tg.ready(), expand(), fullscreen, themeChanged, safeAreaChanged, contentSafeAreaChanged и fullscreen events.
- Системные вертикальные swipes Telegram снова включены.
- Добавлена обработка activated/deactivated и visibilitychange: декоративные анимации ставятся на паузу в фоне.
- На Android определяется Telegram performance class LOW / AVERAGE / HIGH из User-Agent.
- AVERAGE автоматически снижает blur; LOW отключает backdrop blur и тяжёлые shadows, сокращает motion.

2. Калькулятор
- Удалён forced display:none/display:block remount и связанные синхронные offset/scroll измерения.
- «Полные цифры» снова является только presentation-настройкой и не перестраивает вкладку.
- 754 строки данных индексируются один раз по зданию и уровню; повторные rawBaseData.filter() удалены.
- Результаты диапазона levels + bonuses кэшируются в памяти.
- Повторный innerHTML для subtotal не выполняется, если визуальный результат не изменился.
- Пересчёты полей объединяются через requestAnimationFrame, чтобы серия input events не запускала несколько расчётов за один кадр.
- 26 карточек зданий больше не строятся до первого Calculator tap на LOW-class Android; на других устройствах калькулятор pre-warm выполняется в idle.
- calculator-math.js не изменён.

3. Гайды
- Добавлен session memory cache на 24 статьи, TTL 5 минут.
- Переход назад по истории обычно не требует повторного сетевого запроса.
- Новый запрос отменяет предыдущий через AbortController, предотвращая гонки и лишний трафик.
- Кнопка «Обновить» обходит session cache и действительно запрашивает свежую статью.
- Lazy loading изображений и content-visibility списка гайдов сохранены.

4. Runtime / CSS cleanup
- Удалён MutationObserver + forced offsetWidth, использовавшийся только для анимации чисел.
- Конвертер времени больше не выполняет полный update каждую секунду, когда вкладка закрыта/приложение скрыто.
- Удалены неиспользуемые CSS classes старых вариантов UI.
- Удалены неиспользуемые compatibility theme variables --lap-tg-*, --bg-primary/secondary и другие legacy aliases.
- Удалены v5.63–v5.66 patch layers из конца CSS; необходимые правила объединены в актуальные feature sections.
- Карточки зданий больше не используют content-visibility:auto, который нестабилен для горизонтального калькулятора в некоторых WebView.
- Политика запрета выделения перенесена преимущественно в CSS; editable controls сохраняют нормальный ввод.
- README очищен от накопленного changelog старых тестовых версий.

Файлы
-----
index.html                 — интерфейс и Telegram bridge
styles.css                 — единая HIG/Telegram дизайн-система
app.js                     — приложение, гайды, настройки, калькулятор UI
calculator-math.js         — чистая математика калькулятора
cloudflare-worker.js       — Worker гайдов (логика не изменена относительно v5.66)
HIG_PROJECT_DESIGN_SYSTEM.txt — проектная HIG-спецификация

Развёртывание
-------------
Для обновления Web App загрузить index.html, styles.css, app.js и calculator-math.js на текущий hosting/GitHub Pages. cloudflare-worker.js функционально не менялся в этом optimization pass, поэтому отдельный redeploy Worker для v5.67 не обязателен.

Проверки перед упаковкой
-----------------------
- node --check app.js
- node --check calculator-math.js
- node --check cloudflare-worker.js
- CSS parsing via tinycss2
- duplicate HTML IDs
- SVG <use> references
- inline handler function availability
- i18n RU/EN keys
- calculator scenarios A–J
- building dataset: 754 rows / 26 buildings
- ZIP integrity test
