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
- **Viewer / admin roles** — Clients only add pins and reply; deleting, resolving, clearing and exporting are admin-only and enforced server-side ([details](#roles--admin-access))
- **Responsive pins** — Pins anchor to their element, so they land correctly whether the reviewer is on mobile or desktop
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

### 2. Configure api.php (top of the file)

```php
$PROJECT_NAME  = 'YOUR_PROJECT';
$SLACK_WEBHOOK = 'https://hooks.slack.com/services/...';
$PAGE_NAMES    = ['index' => 'Home', 'about' => 'About', 'contact' => 'Contact'];
$ADMIN_KEY     = 'pick-a-long-random-string';   // unlock admin via ?admin=THIS_KEY
```

### 3. Add to every HTML page

```html
<script src="comments.js"></script>
```

### 4. Upload to Apache hosting — done.

---

## Roles & admin access

The tool has two roles so a client can leave feedback without being able to destroy it.

| Action | Viewer (client) | Admin |
|--------|:---:|:---:|
| Add a pin | ✅ | ✅ |
| Reply to a pin | ✅ | ✅ |
| See all pins / filter | ✅ | ✅ |
| Resolve / reopen | — | ✅ |
| Delete a pin | — | ✅ |
| Clear all pins | — | ✅ |
| Export `.txt` report | — | ✅ |

**Everyone is a viewer by default.** Destructive and management actions are hidden from the UI *and* rejected by the server (HTTP 403) — hiding the buttons isn't the only line of defense.

### Becoming an admin

1. Set a secret key in `api.php`:
   ```php
   $ADMIN_KEY = 'pick-a-long-random-string';
   ```
2. Open any page once with that key in the URL:
   ```
   https://your-site/page.html?admin=pick-a-long-random-string
   ```
3. The key is saved to the browser's `localStorage` and **immediately stripped from the URL** (so it isn't left on screen or copied into a shared link). The toolbar shows an **ADMIN** tag, and resolve/delete/clear/export appear.

The key is sent as an `X-Admin-Key` header on protected requests and compared server-side with `hash_equals()`. It lives only in your `api.php` on the server — never commit a real key to source control. To revoke access, change `$ADMIN_KEY` (existing browsers stop being admin) or clear `localStorage` on a given device.

> **Heads-up:** the key travels in the URL on that first visit (browser history). Treat it like a password — share it privately with whoever needs admin, not in the client-facing link.

---

## What changes per project

| What | Where |
|------|-------|
| Page content | Your HTML files |
| Project name | `api.php` → `$PROJECT_NAME` |
| Page names map | `api.php` → `$PAGE_NAMES` |
| Slack webhook | `api.php` → `$SLACK_WEBHOOK` (shared across all projects) |
| Admin key | `api.php` → `$ADMIN_KEY` (unique per project) |

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

| Method | URL | Action | Admin |
|--------|-----|--------|:---:|
| GET | `api.php` | All pins | |
| GET | `api.php?page=index` | Pins for one page | |
| GET | `api.php?screenshot=<id>` | JPEG binary for a pin's screenshot (404 if none) | |
| POST | `api.php` | Create `{page, x, y, author, text, context?, anchor?, screenshot?}` | |
| POST | `api.php` | Reply `{reply_to, author, text}` | |
| POST | `api.php` | Resolve `{resolve: id}` | ✅ |
| DELETE | `api.php?id=abc` | Delete one (also removes its screenshot file) | ✅ |
| DELETE | `api.php?all=1` | Delete all (clears `data/screenshots/` too) | ✅ |
| GET | `api.php?export=1` | Download .txt report (includes context + screenshot path per pin) | |

Rows marked **Admin** require the `X-Admin-Key` header (or `?key=`) to match `$ADMIN_KEY`, else they return `403`. See [Roles & admin access](#roles--admin-access).

`context` is `{selector, tag, text_content, outer_html, viewport:{width,height}}`. `anchor` is `{selector, rx, ry}` — the element to pin to plus a 0–1 fractional position inside it, so pins reflow with a responsive layout. `screenshot` on POST is a `data:image/jpeg;base64,...` URL — the server stores the binary at `data/screenshots/<id>.jpg` and persists only the path on the pin. See `docs/Wireframe-Pins-Implementation-Guide.md` for the full schema.

---

## Examples

`examples/demo/` — Minimal one-page wireframe wired to `src/styles.css` + `src/comments.js`. Serve the repo root with PHP (`php -S localhost:8000`) and open `examples/demo/index.html` to try the tool.

---

## Changelog

### v1.4.0 (2026-06-04)
- **Roles (viewer vs admin):** clients can only add pins and reply. Delete, resolve, clear-all and export are admin-only, enforced server-side (`$ADMIN_KEY` + `X-Admin-Key`/`hash_equals`), not just hidden in the UI. Unlock admin by opening any page once with `?admin=<key>` (remembered in localStorage, stripped from the URL). Protects client feedback from accidental "Clear All".
- **Responsive pins:** pins now anchor to their element (`selector` + fractional `rx`/`ry`) and reflow with the layout, so a pin dropped on mobile lands correctly on desktop and vice-versa. Repositions on resize/load. Legacy pins fall back to old absolute coords.
- **Panel filters:** "All Pins" panel filters by All / Open / Resolved.
- **Badge = unresolved count** (the actionable number) instead of total.
- **Backup:** `comments.json.bak` written on every save (last-good copy).

### v1.3.2 (2026-06-03)
- Host-page isolation: tool UI (toolbar, popovers, forms, panel, onboarding) now enforces its own font family and heading colors, so host sites with serif headings or light-on-dark themes can't bleed into the tool.

### v1.3.1 (2026-06-03)
- Mobile usability: compact full-width toolbar with safe-area inset, full-screen All Pins panel, popovers and pin form fitted to viewport, form position clamped on small screens.

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
