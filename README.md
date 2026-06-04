# 📌 Wireframe Pins

A self-hosted, BugHerd-style pin feedback tool for wireframe and prototype reviews. Drop pins anywhere on a page, leave comments, get Slack notifications. No database, no accounts, no third-party dependencies.

---

## Repository Structure

```
wireframe-pins/
  src/                    ← Generic reusable tool (start here for new projects)
    styles.css            ← Base wireframe CSS (grayscale, layout components)
    comments.js           ← Pin feedback system (drop pins, replies, resolve)
    api.php               ← PHP backend (configure PROJECT_NAME + PAGE_NAMES)
  examples/
    demo/                 ← Minimal generic demo page wired to src/
  docs/
    Wireframe-Pins-Implementation-Guide.md  ← Full guide for AI tools
```

> **`src/`** = clean, project-agnostic tool. Copy these files into any project.
> **`examples/`** = generic demo only — client deployments must NOT be committed here (public repo).

---

## Features

- **Pin anywhere** — Click any spot on the page to drop a numbered pin
- **Element context capture** — Every pin records the HTML element and selector under the cursor so AI tools can apply changes precisely
- **Optional screenshot** — Opt-in per pin via lazy-loaded html2canvas (400×400 around the pin)
- **Shared & persistent** — All reviewers see the same pins (PHP backend + JSON)
- **Slack notifications** — New pins, replies, and resolved items
- **Replies & threads** — Conversations per pin
- **Resolve / Reopen** — Mark done without deleting (turns green)
- **Hide / Show** — Toggle visibility for clean design review
- **Export .txt** — Download all feedback organized by page and status
- **Onboarding popup** — Auto-shows on first visit, reads from `document.title`
- **Auto-refresh** — Syncs every 30 seconds across all reviewers
- **Near-zero dependencies** — No npm, no composer, no database. Only `html2canvas` (CDN, lazy-loaded only when a reviewer opts into a screenshot)

---

## Quick Start

### 1. Copy core files into your project

```
your-project/
  index.html
  about.html
  styles.css        ← From src/styles.css
  comments.js       ← From src/comments.js
  api.php           ← From src/api.php (configure this)
```

### 2. Configure api.php (top 3 lines)

```php
$PROJECT_NAME  = 'YOUR_PROJECT';
$SLACK_WEBHOOK = 'https://hooks.slack.com/services/...';
$PAGE_NAMES    = ['index' => 'Home', 'about' => 'About', 'contact' => 'Contact'];
```

### 3. Add to every HTML page

```html
<script src="comments.js"></script>
```

### 4. Upload to Apache hosting — done.

---

## What changes per project

| What | Where |
|------|-------|
| Page content | Your HTML files |
| Project name | `api.php` line 12 |
| Page names map | `api.php` line 14 |
| Slack webhook | `api.php` line 13 (shared across all projects) |

`styles.css` and `comments.js` never change between projects.

---

## For AI tools

See `docs/Wireframe-Pins-Implementation-Guide.md` for a complete reference guide you can share with Claude Code, Cursor, Copilot or any AI assistant to add this system to any project automatically.

---

## Slack Setup

1. Go to https://api.slack.com/apps → Create App → Incoming Webhooks
2. Add webhook to your channel → Copy URL
3. Paste into `api.php` → shared across all projects, differentiated by `$PROJECT_NAME`

---

## API Reference

| Method | URL | Action |
|--------|-----|--------|
| GET | `api.php` | All pins |
| GET | `api.php?page=index` | Pins for one page |
| GET | `api.php?screenshot=<id>` | JPEG binary for a pin's screenshot (404 if none) |
| POST | `api.php` | Create `{page, x, y, author, text, context?, screenshot?}` |
| POST | `api.php` | Reply `{reply_to, author, text}` |
| POST | `api.php` | Resolve `{resolve: id}` |
| DELETE | `api.php?id=abc` | Delete one (also removes its screenshot file) |
| DELETE | `api.php?all=1` | Delete all (clears `data/screenshots/` too) |
| GET | `api.php?export=1` | Download .txt report (includes context + screenshot path per pin) |

`context` is `{selector, tag, text_content, outer_html, viewport:{width,height}}`. `screenshot` on POST is a `data:image/jpeg;base64,...` URL — the server stores the binary at `data/screenshots/<id>.jpg` and persists only the path on the pin. See `docs/Wireframe-Pins-Implementation-Guide.md` for the full schema.

---

## Examples

`examples/demo/` — Minimal one-page wireframe wired to `src/styles.css` + `src/comments.js`. Serve the repo root with PHP (`php -S localhost:8000`) and open `examples/demo/index.html` to try the tool.

---

## Changelog

### v1.3.0 (2026-06-03)
- **Removed client work from the public repo:** a real client wireframe in `examples/` replaced with a generic `examples/demo/` page. Policy: no client deployments in `examples/`.
- **Fix:** clicking a pin in the "All Pins" panel now works — same page scrolls to the pin and opens its popover; other pages deep-link via `page.html#wf-pin=<id>` and auto-open on load.
- **api.php:** `LOCK_EX` on writes (concurrent POSTs no longer lose pins); data-dir `.htaccess` now includes Apache 2.4 `Require all denied` alongside 2.2 syntax.

### v1.2.0 (2026-04-28)
- **Element context capture:** every new pin records the anchor element under the cursor (`selector`, `tag`, `text_content`, `outer_html`, `viewport`) so AI tools can act on feedback precisely. Backward compatible — older pins without context render unchanged.
- **Optional screenshot per pin:** new "Include screenshot of this area" checkbox in the pin form. When ticked, `html2canvas` is lazy-loaded once from CDN and a 400×400 region is captured as JPEG @ 0.7. The toolbar, pins, and overlays are filtered out via `ignoreElements`.
- Screenshots are stored at `data/screenshots/<pin-id>.jpg` (under the existing `Deny from all` .htaccess) and served through a new `GET api.php?screenshot=<id>` endpoint. The popover shows a 100×100 thumbnail with click-to-lightbox; the .txt export lists the path per pin.
- Deleting a pin (or all pins) cleans up its screenshot file.

### v1.1.0 (2026-04-28)
- Cleaned `src/` files: removed all client-specific contamination
- `comments.js` onboarding popup now reads `document.title` dynamically
- `api.php` export filename and report title now use `$PROJECT_NAME`
- Added `Wireframe-Pins-Implementation-Guide.md` for AI-assisted deployments
- Updated README with clearer `src/` vs `examples/` separation

### v1.0.0 (2026-04-07)
- Initial release with full pin system + a client wireframe as example (removed in v1.3.0)

---

## License

MIT
