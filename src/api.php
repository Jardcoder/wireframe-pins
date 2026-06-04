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
 * GET  api.php?export=1     → download .txt report
 *
 * ┌─────────────────────────────────────────────┐
 * │  CONFIGURATION — Change these per project   │
 * └─────────────────────────────────────────────┘
 */

$PROJECT_NAME   = 'YOUR_PROJECT';  // short label used in Slack messages and export filename
$SLACK_WEBHOOK  = 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL';
$PAGE_NAMES     = [
    'index'   => 'Home',
    'about'   => 'About',
    'contact' => 'Contact',
    // Add your pages here: 'filename' => 'Display Name'
];

/* ── Slack notification ── */
function notifySlack($message) {
    global $SLACK_WEBHOOK;
    if (empty($SLACK_WEBHOOK) || $SLACK_WEBHOOK === 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL') return;
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

/* ── Headers ── */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── Data storage ── */
$dataDir  = __DIR__ . '/data';
$dataFile = $dataDir . '/comments.json';

// Apache 2.2 + 2.4 syntax so the data dir is blocked on either version
$HTACCESS_DENY = "Deny from all\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n";

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
    file_put_contents($dataDir . '/.htaccess', $HTACCESS_DENY);
}
if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([], JSON_PRETTY_PRINT));
}

function loadComments() {
    global $dataFile;
    $data = json_decode(file_get_contents($dataFile), true);
    return is_array($data) ? $data : [];
}

// LOCK_EX: two simultaneous POSTs must not lose pins
function saveComments($data) {
    global $dataFile;
    file_put_contents(
        $dataFile,
        json_encode(array_values($data), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

function generateId() {
    return bin2hex(random_bytes(6));
}

function sanitizeContext($ctx) {
    if (!is_array($ctx)) return null;
    $tag = isset($ctx['tag']) ? strtolower(preg_replace('/[^a-z0-9-]/i', '', (string)$ctx['tag'])) : '';
    $selector = isset($ctx['selector']) ? mb_substr(strip_tags((string)$ctx['selector']), 0, 500) : '';
    $text = isset($ctx['text_content']) ? mb_substr(strip_tags((string)$ctx['text_content']), 0, 200) : '';
    $outer = isset($ctx['outer_html']) ? mb_substr((string)$ctx['outer_html'], 0, 2000) : '';
    $vw = isset($ctx['viewport']['width'])  ? max(0, min(100000, (int)$ctx['viewport']['width']))  : 0;
    $vh = isset($ctx['viewport']['height']) ? max(0, min(100000, (int)$ctx['viewport']['height'])) : 0;
    return [
        'selector'     => $selector,
        'tag'          => $tag,
        'text_content' => $text,
        'outer_html'   => $outer,
        'viewport'     => ['width' => $vw, 'height' => $vh]
    ];
}

$method = $_SERVER['REQUEST_METHOD'];

/* ── GET ── */
if ($method === 'GET') {
    if (isset($_GET['screenshot'])) {
        $id = preg_replace('/[^a-z0-9]/', '', (string)$_GET['screenshot']);
        $file = $dataDir . '/screenshots/' . $id . '.jpg';
        if ($id === '' || !is_file($file)) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            exit;
        }
        header('Content-Type: image/jpeg');
        header('Content-Length: ' . filesize($file));
        header('Cache-Control: private, max-age=86400');
        readfile($file);
        exit;
    }
    if (isset($_GET['export'])) {
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . strtolower($PROJECT_NAME) . '-feedback-' . date('Y-m-d') . '.txt"');
        $comments  = loadComments();
        $pageNames = $PAGE_NAMES;
        echo $PROJECT_NAME . " — Wireframe Pin Feedback Report\n";
        echo "Exported: " . date('Y-m-d H:i:s') . "\n";
        echo "Total pins: " . count($comments) . "\n";
        echo str_repeat('=', 50) . "\n";
        $grouped = [];
        foreach ($comments as $c) { $grouped[$c['page'] ?? 'unknown'][] = $c; }
        foreach ($grouped as $page => $items) {
            $label = $pageNames[$page] ?? ucfirst($page);
            echo "\n\n📄 PAGE: " . strtoupper($label) . "\n" . str_repeat('-', 40) . "\n";
            foreach ($items as $i => $c) {
                $num    = $i + 1;
                $time   = date('M j, g:ia', strtotime($c['created_at']));
                $status = ($c['resolved'] ?? false) ? '✅ RESOLVED' : '⏳ Open';
                echo "\n  📌 Pin #{$num} ({$status})\n     By: {$c['author']} — {$time}\n     \"{$c['text']}\"\n";
                if (!empty($c['context']) && is_array($c['context'])) {
                    $ctag  = $c['context']['tag'] ?? '';
                    $ctext = $c['context']['text_content'] ?? '';
                    $csel  = $c['context']['selector'] ?? '';
                    if ($ctag !== '' || $ctext !== '') {
                        echo "     📍 Context: <{$ctag}>" . ($ctext !== '' ? " \"{$ctext}\"" : '') . "\n";
                        if ($csel !== '') echo "        Selector: {$csel}\n";
                    }
                }
                if (!empty($c['screenshot'])) {
                    echo "     📸 Screenshot: {$c['screenshot']}\n";
                }
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
        $page     = $_GET['page'];
        $comments = array_values(array_filter($comments, function($c) use ($page) {
            return ($c['page'] ?? '') === $page;
        }));
    }
    echo json_encode($comments);
    exit;
}

/* ── POST ── */
if ($method === 'POST') {
    $input    = json_decode(file_get_contents('php://input'), true);
    $comments = loadComments();

    // Reply
    if (!empty($input['reply_to'])) {
        $id = $input['reply_to'];
        foreach ($comments as &$c) {
            if ($c['id'] === $id) {
                $replyAuthor  = strip_tags(trim($input['author'] ?? 'Anonymous'));
                $replyText    = strip_tags(trim($input['text'] ?? ''));
                $c['replies'][] = ['author' => $replyAuthor, 'text' => $replyText, 'created_at' => date('c')];
                saveComments($comments);
                notifySlack("💬 *[$PROJECT_NAME]* Reply on *" . getPageLabel($c['page']) . "* by {$replyAuthor}\n↳ Re: \"{$c['text']}\"\n\"{$replyText}\"");
                echo json_encode($c);
                exit;
            }
        }
        http_response_code(404);
        echo json_encode(['error' => 'Pin not found']);
        exit;
    }

    // Resolve / Reopen
    if (!empty($input['resolve'])) {
        $id = $input['resolve'];
        foreach ($comments as &$c) {
            if ($c['id'] === $id) {
                $c['resolved'] = !($c['resolved'] ?? false);
                saveComments($comments);
                $status = $c['resolved'] ? '✅ Resolved' : '🔄 Reopened';
                notifySlack("{$status} *[$PROJECT_NAME]* Pin on *" . getPageLabel($c['page']) . "* by {$c['author']}\n\"{$c['text']}\"");
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
        echo json_encode(['error' => 'Missing page or text']);
        exit;
    }
    $new = [
        'id'         => generateId(),
        'page'       => strip_tags(trim($input['page'])),
        'x'          => (float)($input['x'] ?? 0),
        'y'          => (int)($input['y'] ?? 0),
        'author'     => strip_tags(trim($input['author'] ?? 'Anonymous')),
        'text'       => strip_tags(trim($input['text'])),
        'created_at' => date('c'),
        'resolved'   => false,
        'replies'    => [],
        'context'    => sanitizeContext($input['context'] ?? null)
    ];

    if (!empty($input['screenshot']) && is_string($input['screenshot'])) {
        if (preg_match('/^data:image\/jpeg;base64,(.+)$/', $input['screenshot'], $m)) {
            $bin = base64_decode($m[1], true);
            if ($bin !== false && strlen($bin) <= 5 * 1024 * 1024) {
                $shotDir = $dataDir . '/screenshots';
                if (!is_dir($shotDir)) {
                    mkdir($shotDir, 0755, true);
                    file_put_contents($shotDir . '/.htaccess', $HTACCESS_DENY);
                }
                $relPath = 'data/screenshots/' . $new['id'] . '.jpg';
                file_put_contents(__DIR__ . '/' . $relPath, $bin);
                $new['screenshot'] = $relPath;
            }
        }
    }

    $comments[] = $new;
    saveComments($comments);
    notifySlack("📌 *[$PROJECT_NAME]* New pin on *" . getPageLabel($new['page']) . "* by {$new['author']}\n\"{$new['text']}\"");
    http_response_code(201);
    echo json_encode($new);
    exit;
}

/* ── DELETE ── */
if ($method === 'DELETE') {
    if (isset($_GET['all'])) {
        $shotDir = $dataDir . '/screenshots';
        if (is_dir($shotDir)) {
            foreach (glob($shotDir . '/*.jpg') ?: [] as $f) @unlink($f);
        }
        saveComments([]);
        echo json_encode(['success' => true]);
        exit;
    }
    if (isset($_GET['id'])) {
        $id       = $_GET['id'];
        $comments = array_values(array_filter(loadComments(), function($c) use ($id) {
            return $c['id'] !== $id;
        }));
        $shotFile = $dataDir . '/screenshots/' . preg_replace('/[^a-z0-9]/', '', $id) . '.jpg';
        if (is_file($shotFile)) @unlink($shotFile);
        saveComments($comments);
        echo json_encode(['success' => true]);
        exit;
    }
    http_response_code(400);
    echo json_encode(['error' => 'Missing id or all parameter']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
