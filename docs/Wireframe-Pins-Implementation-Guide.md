# Wireframe Pins — Implementation Guide

> **Purpose:** This document contains everything an AI assistant (Claude Code, Codex, Cursor, Antigravity, etc.) needs to add a BugHerd-style pin feedback system to any website project.
>
> **How to use:** Share this file with your AI tool and say: "Read this guide and add the pin feedback system to my project."
>
> **Repo:** https://github.com/Jardcoder/wireframe-pins

---

## What this does

Adds a pin-based feedback overlay to any website. Users click anywhere on a page to drop a numbered pin, write feedback, and the team gets Slack notifications. Pins are shared between all reviewers, support replies, resolve/reopen, hide/show toggle, and export to .txt.

No accounts needed. No third-party services. Works on any website.

**External dependencies:** none at page-load time. The optional per-pin screenshot feature lazy-loads `html2canvas` from `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js` — but only the first time a reviewer ticks "Include screenshot of this area." Reviewers who never use that checkbox never download it.

---

## Quick start

To add this system to any project, you need 3 files added to the project:

1. **comments.js** — Client-side pin UI (drop pins, popovers, replies, toolbar, onboarding popup)
2. **api backend** — Server-side CRUD for pins + Slack notifications
3. **One line of HTML** per page — `<script src="comments.js"></script>` before `</body>`

The backend can be PHP (for Apache/shared hosting) or JavaScript (for Node/Astro/Next.js/etc.). Both implementations are provided below.

---

## Configuration

Every deployment needs 3 values configured in the backend:

```
PROJECT_NAME  = "MyProject"          // Shows in Slack notifications as [MyProject]
SLACK_WEBHOOK = "https://hooks..."   // Slack incoming webhook URL
PAGE_NAMES    = { index: "Home", about: "About", ... }  // Filename-to-label map
```

The Slack webhook URL is shared across all projects. Only `PROJECT_NAME` and `PAGE_NAMES` change per project.

---

## How to add to an existing page

Add this single line before `</body>` on every page that should have pin feedback:

```html
<script src="comments.js"></script>
```

That's it. The JS auto-injects all styles, creates the toolbar, and sets up the pin system. No CSS file needed for the pin system itself (styles are injected by JS).

The `comments.js` file expects the API backend to be at `api.php` (PHP) or `/api/pins` (JS) in the same directory/origin. If the API is at a different path, change the `API` constant at the top of `comments.js`.

---

---

# OPTION A: PHP Backend (Apache / shared hosting)

Use this when the site runs on Apache with PHP (shared hosting, WordPress, plain HTML sites).

> **Source of truth:** the snippet below is a minimal reference. The complete current `api.php` — including the `context` and `screenshot` handling described later in this guide, plus the `?screenshot=<id>` serving endpoint — lives at `src/api.php` in the repo. Copy that file when deploying; the snippet here exists for readers who want to understand the shape of the backend.

## File: api.php

Create this file in the same directory as your HTML pages.

```php
<?php
/**
 * Wireframe Pins — Pin Comments API with Slack Notifications
 * 
 * GET  api.php              → all pins
 * GET  api.php?page=index   → pins for one page
 * POST api.php              → create pin {page, x, y, author, text}
 * POST api.php              → reply {reply_to: "id", author, text}
 * POST api.php              → toggle resolve {resolve: "id"}
 * DELETE api.php?id=abc     → delete one pin
 * DELETE api.php?all=1      → delete all pins
 * GET api.php?export=1      → download .txt report
 */

// ┌─────────────────────────────────────────────┐
// │  CONFIGURATION — Change these per project   │
// └─────────────────────────────────────────────┘

$PROJECT_NAME   = 'CHANGE_ME';  // e.g. 'ACME', 'MyClient'
$SLACK_WEBHOOK  = 'PASTE_WEBHOOK_URL_HERE';
$PAGE_NAMES     = [
    'index'     => 'Home',
    'about'     => 'About',
    'services'  => 'Services',
    'contact'   => 'Contact',
    // Add your pages here
];

// ── Slack notification ──
function notifySlack($message) {
    global $SLACK_WEBHOOK;
    if (empty($SLACK_WEBHOOK) || $SLACK_WEBHOOK === 'PASTE_WEBHOOK_URL_HERE') return;
    $payload = json_encode(['text' => $message]);
    $ch = curl_init($SLACK_WEBHOOK);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5
    ]);
    curl_exec($ch);
    curl_close($ch);
}

function getPageLabel($page) {
    global $PAGE_NAMES;
    return $PAGE_NAMES[$page] ?? ucfirst($page);
}

// ── Headers ──
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Data storage ──
$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/comments.json';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
    file_put_contents($dataDir . '/.htaccess', "Deny from all\n");
}

if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([], JSON_PRETTY_PRINT));
}

function loadComments() {
    global $dataFile;
    $data = json_decode(file_get_contents($dataFile), true);
    return is_array($data) ? $data : [];
}

function saveComments($data) {
    global $dataFile;
    file_put_contents($dataFile, json_encode(array_values($data), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function generateId() {
    return bin2hex(random_bytes(6));
}

$method = $_SERVER['REQUEST_METHOD'];

// ── GET ──
if ($method === 'GET') {
    if (isset($_GET['export'])) {
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . strtolower($GLOBALS['PROJECT_NAME']) . '-feedback-' . date('Y-m-d') . '.txt"');
        $comments = loadComments();
        $pageNames = $GLOBALS['PAGE_NAMES'];
        echo "Pin Feedback Report — {$GLOBALS['PROJECT_NAME']}\n";
        echo "Exported: " . date('Y-m-d H:i:s') . "\n";
        echo "Total pins: " . count($comments) . "\n";
        echo str_repeat('=', 50) . "\n";
        $grouped = [];
        foreach ($comments as $c) { $grouped[$c['page'] ?? 'unknown'][] = $c; }
        foreach ($grouped as $page => $items) {
            $label = $pageNames[$page] ?? ucfirst($page);
            echo "\n\n📄 PAGE: " . strtoupper($label) . "\n" . str_repeat('-', 40) . "\n";
            foreach ($items as $i => $c) {
                $num = $i + 1;
                $time = date('M j, g:ia', strtotime($c['created_at']));
                $status = ($c['resolved'] ?? false) ? '✅ RESOLVED' : '⏳ Open';
                echo "\n  📌 Pin #{$num} ({$status})\n     By: {$c['author']} — {$time}\n     \"{$c['text']}\"\n";
                if (!empty($c['replies'])) {
                    foreach ($c['replies'] as $r) {
                        $rt = date('M j, g:ia', strtotime($r['created_at']));
                        echo "       ↳ {$r['author']} ({$rt}): {$r['text']}\n";
                    }
                }
            }
        }
        exit;
    }
    $comments = loadComments();
    if (isset($_GET['page'])) {
        $page = $_GET['page'];
        $comments = array_values(array_filter($comments, function($c) use ($page) {
            return ($c['page'] ?? '') === $page;
        }));
    }
    echo json_encode($comments);
    exit;
}

// ── POST ──
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $comments = loadComments();

    // Reply
    if (!empty($input['reply_to'])) {
        $id = $input['reply_to'];
        foreach ($comments as &$c) {
            if ($c['id'] === $id) {
                $replyAuthor = strip_tags(trim($input['author'] ?? 'Anonymous'));
                $replyText = strip_tags(trim($input['text'] ?? ''));
                $c['replies'][] = ['author' => $replyAuthor, 'text' => $replyText, 'created_at' => date('c')];
                saveComments($comments);
                $pageLabel = getPageLabel($c['page']);
                notifySlack("💬 *[$GLOBALS[PROJECT_NAME]]* Reply on *{$pageLabel}* by {$replyAuthor}\n↳ Re: \"{$c['text']}\"\n\"{$replyText}\"");
                echo json_encode($c);
                exit;
            }
        }
        http_response_code(404);
        echo json_encode(['error' => 'Pin not found']);
        exit;
    }

    // Resolve toggle
    if (isset($input['resolve'])) {
        $id = $input['resolve'];
        foreach ($comments as &$c) {
            if ($c['id'] === $id) {
                $c['resolved'] = !($c['resolved'] ?? false);
                saveComments($comments);
                $status = $c['resolved'] ? '✅ Resolved' : '🔄 Reopened';
                $pageLabel = getPageLabel($c['page']);
                notifySlack("{$status} *[$GLOBALS[PROJECT_NAME]]* Pin on *{$pageLabel}* by {$c['author']}\n\"{$c['text']}\"");
                echo json_encode($c);
                exit;
            }
        }
        http_response_code(404);
        echo json_encode(['error' => 'Pin not found']);
        exit;
    }

    // New pin
    if (empty($input['text']) || empty($input['page'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing: page, text']);
        exit;
    }
    $new = [
        'id' => generateId(), 'page' => strip_tags(trim($input['page'])),
        'x' => floatval($input['x'] ?? 0), 'y' => floatval($input['y'] ?? 0),
        'author' => strip_tags(trim($input['author'] ?? 'Anonymous')),
        'text' => strip_tags(trim($input['text'])), 'created_at' => date('c'),
        'resolved' => false, 'replies' => []
    ];
    $comments[] = $new;
    saveComments($comments);
    $pageLabel = getPageLabel($new['page']);
    notifySlack("📌 *[$GLOBALS[PROJECT_NAME]]* New pin on *{$pageLabel}* by {$new['author']}\n\"{$new['text']}\"");
    echo json_encode($new);
    exit;
}

// ── DELETE ──
if ($method === 'DELETE') {
    if (isset($_GET['all'])) { saveComments([]); echo json_encode(['success' => true]); exit; }
    if (isset($_GET['id'])) {
        $id = $_GET['id'];
        $comments = array_values(array_filter(loadComments(), function($c) use ($id) { return $c['id'] !== $id; }));
        saveComments($comments);
        echo json_encode(['success' => true]);
        exit;
    }
    http_response_code(400);
    echo json_encode(['error' => 'Missing id']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
```

---

---

# OPTION B: JavaScript Backend (Astro / Next.js / Node / Deno)

Use this when the site runs on a JS-based framework. Adapt the endpoint path to your framework's API route convention.

> The example below covers the original CRUD only. To match the v1.2.0 PHP backend you also need to (a) accept and persist a `context` object on new pins, (b) accept an optional `screenshot` data URL, decode it to a JPEG file under `data/screenshots/<id>.jpg`, store the relative path on the pin, and (c) expose a `GET ?screenshot=<id>` endpoint that streams the file back. Mirror the logic in `src/api.php`.

## For Astro: `src/pages/api/pins.js`

```javascript
// Astro API route: /api/pins
import fs from 'fs';
import path from 'path';

const PROJECT_NAME = 'CHANGE_ME';
const SLACK_WEBHOOK = 'PASTE_WEBHOOK_URL_HERE';
const PAGE_NAMES = { index: 'Home', about: 'About', services: 'Services', contact: 'Contact' };

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'comments.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
}

function loadPins() {
  ensureDataFile();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function savePins(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function getPageLabel(page) {
  return PAGE_NAMES[page] || page.charAt(0).toUpperCase() + page.slice(1);
}

async function notifySlack(message) {
  if (!SLACK_WEBHOOK || SLACK_WEBHOOK === 'PASTE_WEBHOOK_URL_HERE') return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
  } catch (e) { console.warn('Slack notification failed:', e); }
}

// ── GET ──
export async function GET({ url }) {
  const page = url.searchParams.get('page');
  const doExport = url.searchParams.get('export');
  let pins = loadPins();

  if (doExport) {
    if (page) pins = pins.filter(p => p.page === page);
    const grouped = {};
    pins.forEach(p => { (grouped[p.page] ||= []).push(p); });
    let text = `Pin Feedback Report — ${PROJECT_NAME}\nExported: ${new Date().toISOString()}\nTotal: ${pins.length}\n${'='.repeat(50)}\n`;
    for (const [pg, items] of Object.entries(grouped)) {
      text += `\n\n📄 PAGE: ${getPageLabel(pg).toUpperCase()}\n${'-'.repeat(40)}\n`;
      items.forEach((c, i) => {
        const status = c.resolved ? '✅ RESOLVED' : '⏳ Open';
        text += `\n  📌 Pin #${i+1} (${status})\n     By: ${c.author} — ${c.created_at}\n     "${c.text}"\n`;
        (c.replies || []).forEach(r => { text += `       ↳ ${r.author}: ${r.text}\n`; });
      });
    }
    return new Response(text, {
      headers: { 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="${PROJECT_NAME.toLowerCase()}-feedback.txt"` }
    });
  }

  if (page) pins = pins.filter(p => p.page === page);
  return new Response(JSON.stringify(pins), { headers: { 'Content-Type': 'application/json' } });
}

// ── POST ──
export async function POST({ request }) {
  const input = await request.json();
  const pins = loadPins();

  // Reply
  if (input.reply_to) {
    const pin = pins.find(p => p.id === input.reply_to);
    if (!pin) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    const reply = { author: input.author || 'Anonymous', text: input.text || '', created_at: new Date().toISOString() };
    pin.replies = pin.replies || [];
    pin.replies.push(reply);
    savePins(pins);
    await notifySlack(`💬 *[${PROJECT_NAME}]* Reply on *${getPageLabel(pin.page)}* by ${reply.author}\n↳ Re: "${pin.text}"\n"${reply.text}"`);
    return new Response(JSON.stringify(pin), { headers: { 'Content-Type': 'application/json' } });
  }

  // Resolve
  if (input.resolve) {
    const pin = pins.find(p => p.id === input.resolve);
    if (!pin) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    pin.resolved = !pin.resolved;
    savePins(pins);
    const status = pin.resolved ? '✅ Resolved' : '🔄 Reopened';
    await notifySlack(`${status} *[${PROJECT_NAME}]* Pin on *${getPageLabel(pin.page)}* by ${pin.author}\n"${pin.text}"`);
    return new Response(JSON.stringify(pin), { headers: { 'Content-Type': 'application/json' } });
  }

  // New pin
  if (!input.text || !input.page) {
    return new Response(JSON.stringify({ error: 'Missing page or text' }), { status: 400 });
  }
  const newPin = {
    id: genId(), page: input.page, x: parseFloat(input.x || 0), y: parseInt(input.y || 0),
    author: input.author || 'Anonymous', text: input.text,
    created_at: new Date().toISOString(), resolved: false, replies: []
  };
  pins.push(newPin);
  savePins(pins);
  await notifySlack(`📌 *[${PROJECT_NAME}]* New pin on *${getPageLabel(newPin.page)}* by ${newPin.author}\n"${newPin.text}"`);
  return new Response(JSON.stringify(newPin), { headers: { 'Content-Type': 'application/json' } });
}

// ── DELETE ──
export async function DELETE({ url }) {
  if (url.searchParams.get('all')) { savePins([]); return new Response(JSON.stringify({ success: true })); }
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  const pins = loadPins().filter(p => p.id !== id);
  savePins(pins);
  return new Response(JSON.stringify({ success: true }));
}
```

## For Next.js: `app/api/pins/route.js`

Same logic as above but exported as `GET`, `POST`, `DELETE` from a Next.js App Router route file. Replace `url.searchParams` with `new URL(request.url).searchParams` and `request.json()` for the body.

## For Express / plain Node:

```javascript
const express = require('express');
const router = express.Router();
// Same logic, use router.get('/pins', ...), router.post('/pins', ...), router.delete('/pins', ...)
```

---

---

# Frontend: comments.js

This file is the same regardless of whether the backend is PHP or JS. The only thing that changes is the `API` constant at the top.

## Adapting the API path

At the top of `comments.js`, change this line:

```javascript
const API = 'api.php';           // For PHP backend
// const API = '/api/pins';      // For Astro/Next.js/Node backend
```

## Full source code

The complete `comments.js` source is in the GitHub repo at:
https://github.com/Jardcoder/wireframe-pins/blob/main/src/comments.js

It includes:
- Pin drop system (click anywhere to place a pin)
- Numbered pin markers (red = open, green = resolved)
- Popover per pin with: comment text, author, timestamp, reply form, resolve/reopen button, delete button
- Toolbar (fixed bottom-right): Add Pin | Hide/Show Pins | All Pins panel
- Global panel: all pins across all pages, grouped by page, with stats, export, and clear all
- Onboarding popup: 4-step guide for first-time users (stored in localStorage, shows once)
- Auto-refresh every 30 seconds (skips if popover is open, only re-renders on changes)
- Author name remembered in localStorage
- LocalStorage fallback if API is unreachable (for local testing)

### Key behaviors to preserve if rewriting:

1. **Pin positioning:** `x` is stored as percentage of page width (`e.pageX / document.documentElement.scrollWidth * 100`), `y` is stored as pixels from top of document (`e.pageY`). This ensures pins stay in the right position across different screen widths.

2. **Page detection:** `getPage()` extracts the filename without extension from `window.location.pathname`. Example: `/about.html` → `about`, `/` → `index`.

3. **Pin mode toggle:** When "Add Pin" is clicked, `body` gets class `pin-mode` which changes cursor to crosshair. Clicking anywhere creates a form at that position. Escape exits pin mode.

4. **Auto-refresh guard:** The 30-second refresh does NOT re-render if a popover is open (would close it) or if pin count hasn't changed (avoids unnecessary DOM churn).

5. **Visibility toggle:** "Hide Pins" hides all pin elements via `display: none`. If pin mode is activated while pins are hidden, they automatically become visible.

---

---

# Pin data structure

Every pin is a JSON object. Fields `context` and `screenshot` were added in v1.2.0; older pins may omit them — clients must render gracefully when missing.

```json
{
  "id": "a1b2c3d4e5f6",
  "page": "index",
  "x": 45.23,
  "y": 1240,
  "author": "Carmela",
  "text": "Change this heading to mention telehealth",
  "created_at": "2026-04-07T20:30:00-05:00",
  "resolved": false,
  "replies": [
    {
      "author": "Jardium",
      "text": "Done in v2",
      "created_at": "2026-04-08T10:15:00-05:00"
    }
  ],
  "context": {
    "selector": "#hero > h1",
    "tag": "h1",
    "text_content": "Welcome to our practice",
    "outer_html": "<h1>Welcome to our practice</h1>",
    "viewport": { "width": 1440, "height": 900 }
  },
  "screenshot": "data/screenshots/a1b2c3d4e5f6.jpg"
}
```

### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | 12-char hex, server-generated |
| `page` | string | Filename without `.html` |
| `x` | number | Percentage of page width (0–100) |
| `y` | number | Pixels from top of document |
| `author` | string | Reviewer name |
| `text` | string | Feedback text |
| `created_at` | string | ISO 8601 |
| `resolved` | boolean | |
| `replies` | array | `{author, text, created_at}` |
| `context` | object \| null | Captured at pin-drop time. May be `null` for legacy pins or if elementFromPoint failed |
| `context.selector` | string | Unique CSS selector for the anchor element (id-based when possible, otherwise nth-of-type path from nearest id-bearing ancestor) |
| `context.tag` | string | Lowercase tag name of the anchor element |
| `context.text_content` | string | First 200 chars of `textContent`, whitespace-collapsed |
| `context.outer_html` | string | Up to 2000 chars of `outerHTML` (truncated with `...`) |
| `context.viewport` | object | `{width, height}` of the reviewer's window |
| `screenshot` | string \| absent | Server-relative path to JPEG, or absent if the reviewer didn't opt in. The browser must NOT request this path directly (the directory is `Deny from all`); fetch via `api.php?screenshot=<pin-id>` instead |

---

# How AI tools should use the context field

The `context` field exists so coding agents can act on pin feedback precisely without re-inferring which element the reviewer meant.

For each open pin, the recommended workflow is:

1. **Locate the element** with `pin.context.selector`. This selector is stable enough to feed to `document.querySelector()` or to grep against the source HTML files.
2. **Confirm you have the right element** by comparing `pin.context.tag` and `pin.context.text_content` against what you find. If text drifted (someone edited the file in the meantime), use `text_content` as a fuzzy match instead of trusting the selector blindly.
3. **Read `pin.context.outer_html`** to see the element's state at the moment of feedback. Useful when comparing against the current source.
4. **Read `pin.text`** for the requested change.
5. **Apply the change** to the source file.
6. **Mark the pin resolved** by `POST`ing `{"resolve": pin.id}` to `api.php`.

If `pin.context` is `null` (older pins, or pins dropped on a non-anchor element), fall back to `pin.x` / `pin.y` plus `pin.text` and ask the reviewer for clarification.

---

# Slack notification format

Three events trigger notifications:

```
📌 [PROJECT] New pin on Home by Carmela
"The hero text should mention telehealth more prominently"

💬 [PROJECT] Reply on Services by Jorge
↳ Re: "Change the CTA text"
"Done, updated to Start Your Sessions"

✅ Resolved [PROJECT] Pin on Contact by Carmela
"Add office hours here"
```

---

# Reading pins programmatically (for AI feedback loops)

Any AI tool can read all pins by fetching the API:

```bash
# All pins across all pages
curl https://example.com/api.php

# Pins for a specific page
curl https://example.com/api.php?page=index

# Mark a pin as resolved after applying the change
curl -X POST https://example.com/api.php \
  -H "Content-Type: application/json" \
  -d '{"resolve": "pin_id_here"}'

# Export as text report
curl https://example.com/api.php?export=1

# Fetch a screenshot binary (requires the pin id, not the path)
curl https://example.com/api.php?screenshot=pin_id_here -o pin.jpg
```

## End-to-end agent loop

A typical autonomous agent (Claude Code, Cursor, Codex, etc.) can process all open pins in one pass:

```javascript
// Pseudocode — adapt to whatever tool/SDK you use
const pins = await fetch(`${API}`).then(r => r.json());
const open = pins.filter(p => !p.resolved);

for (const pin of open) {
  // 1. Find the file that owns this page
  const sourceFile = `${pin.page}.html`;
  const html = await readFile(sourceFile);

  // 2. Identify the element from the captured context
  if (pin.context) {
    // Prefer the selector; fall back to text_content if the file drifted
    const target = findInSource(html, pin.context.selector, pin.context.text_content);
    if (!target) { skip(pin, 'element not found'); continue; }

    // 3. Apply the requested change
    const newHtml = applyChange(html, target, pin.text, pin.context.outer_html);
    await writeFile(sourceFile, newHtml);
  } else {
    // Legacy pin without context — needs a human in the loop
    skip(pin, 'no context, manual review needed');
    continue;
  }

  // 4. Mark resolved
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolve: pin.id })
  });
}
```

The screenshot field (when present) is most useful for visually verifying the change after it's applied, or for showing the human reviewer what the agent saw.

---

# Checklist for adding to a new project

1. [ ] Choose backend: PHP (`api.php`) or JS (`/api/pins`)
2. [ ] Set `PROJECT_NAME` in the backend config
3. [ ] Set `SLACK_WEBHOOK` in the backend config (shared across projects)
4. [ ] Set `PAGE_NAMES` mapping for your pages
5. [ ] If using JS backend, change `API` constant in `comments.js` to `/api/pins`
6. [ ] Add `<script src="comments.js"></script>` before `</body>` on every page
7. [ ] Deploy and test: drop a pin, check Slack notification
8. [ ] Share URL with reviewer
