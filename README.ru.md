<div align="center">

# OperationPerimeter - Операция: Периметр

**Операция: Периметр - тактический шутер от первого лица в браузере: 5 на 5 с ботами, закладка и обезвреживание бомбы, экономика раундов, разминка и короткая кампания миссий. Работает в браузере без сервера и без интернета: откройте `index.html` или играйте онлайн.**

[**▶ Играть онлайн →**](https://alexalesha.github.io/OperationPerimeter/) &nbsp;·&nbsp; [English version of this file](README.md)

[![Status](https://img.shields.io/badge/status-stable-brightgreen)](#) [![CI](https://github.com/ALEXalesha/OperationPerimeter/actions/workflows/ci.yml/badge.svg)](https://github.com/ALEXalesha/OperationPerimeter/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/docs/Web/HTML) [![Website](https://img.shields.io/badge/Website-open-0A84FF?logo=googlechrome&logoColor=white)](https://alexalesha.github.io/OperationPerimeter/) [![Built with Claude Code](https://img.shields.io/badge/Built_with-Claude_Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)

Код, тесты и документация этого проекта написаны Claude (Anthropic) в Claude Code. Идеи, проверка и решения - Алексей.

</div>

> Фанатская игра. Не связана с Valve и не одобрена ею. Карты, модели, оружие и названия свои и сделаны кодом.

![Главное меню](docs/screens/menu.png)

![Идёт раунд](docs/screens/fight.png)

![Меню покупки](docs/screens/buy.png)

## Что есть в игре

- **Режимы:** закладка бомбы 5 на 5 с ботами, бой насмерть, разминка и короткая кампания миссий.
- Экономика раундов: деньги за убийства, победы и поражения, бонус за серию поражений; меню покупки - пистолеты, пистолеты-пулемёты, винтовки, снайперские, тяжёлое, гранаты и снаряжение.
- У оружия свой разброс, отдача и пробитие брони; боты занимают позиции, ставят и обезвреживают бомбу.
- Профиль со статистикой и званиями, инвентарь, настройки с переназначением клавиш; three.js r149 в `vendor/` (MIT).

## Управление

| Клавиша | Действие |
|---|---|
| W A S D | ходьба |
| Пробел | прыжок |
| Ctrl | присесть |
| Shift | идти шагом |
| R | перезарядка |
| E | действие (обезвредить, поднять) |
| B | меню покупки |
| Tab | таблица счёта |
| Мышь | прицел и огонь |

Где игра это позволяет, клавиши меняются в настройках.

## Запуск у себя

Откройте `index.html` в Chrome, Edge или Firefox. Всё лежит в репозитории, ничего не скачивается.

## Проверки

Законы - проверки Playwright в `tests/`. Они открывают страницу по файловому адресу в безголовом
Chromium, по одной за раз:

```
npm install
npx playwright install chromium
npm test
```

Захват мыши в проверках всегда поддельный: настоящий `requestPointerLock` в безголовом Chromium
на Windows может зажать курсор пользователя.
Кадры выше сняты в безголовом браузере скриптом кадров сборника Hub.

## История

Игра сделана в сборнике [Hub](https://github.com/ALEXalesha/ALEXalesha.github.io) (папка `web/fps_1`), там она же работает в Хабе ([играть там](https://alexalesha.github.io/)). Здесь игра лежит вместе с историей коммитов.

## Лицензия

MIT, см. [LICENSE](LICENSE). three.js - MIT.
