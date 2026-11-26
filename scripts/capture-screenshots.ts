// Headless screenshot capture and validation for Token Radar (Node 26, stdlib only).
//
// Builds (or reads) a Token Radar output directory, serves it over an in-process HTTP
// static server on 127.0.0.1:0 (falling back to file:// if loopback bind fails), captures
// 1-board.png, 2-detail.png, 3-filtered.png (and optional 4-mobile.png) via headless
// Chrome/Edge, and validates PNG magic bytes, IHDR dimensions, and the 524,288-byte cap.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHOT_CAP_MAX_BYTES = 524_288;
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;
const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const BROWSER_CANDIDATES: readonly string[] = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ...(process.env.LOCALAPPDATA
    ? [
        join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ]
    : []),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/bin/microsoft-edge',
];

interface CliOptions {
  help: boolean;
  input?: string;
  outDir?: string;
  shotsDir: string;
  mobile: boolean;
  browser?: string;
  width: number;
  height: number;
}

interface BoardLikeRow {
  rank?: number;
  slug?: string;
  category?: string | null;
}

interface CaptureTarget {
  name: string;
  url: string;
  width: number;
  height: number;
}

interface ValidatedShot {
  path: string;
  width: number;
  height: number;
  bytes: number;
}

/** Print CLI usage to stdout. */
function printUsage(): void {
  const usage = [
    'Usage: node scripts/capture-screenshots.ts [options]',
    '',
    'Capture and validate headless dashboard screenshots for Token Radar.',
    '',
    'Options:',
    '  --input <snapshot.json|dir>   Build into a temporary output dir via main.ts',
    '                                (required unless --out-dir is given)',
    '  --out-dir <dir>               Use an existing built output dir containing',
    '                                board.json, data.js, and dashboard/',
    '  --shots-dir <dir>             Output directory for PNGs (default: ./screenshots)',
    '  --mobile                      Also capture 4-mobile.png at 390x844',
    '  --browser <path>              Override Chrome/Edge binary path',
    `  --width <px>                  Desktop viewport width (default: ${DEFAULT_WIDTH})`,
    `  --height <px>                 Desktop viewport height (default: ${DEFAULT_HEIGHT})`,
    '  -h, --help                    Show this help message and exit 0',
    '',
    'Outputs:',
    '  1-board.png                   Ranked board view',
    '  2-detail.png                  Top-ranked protocol detail drawer (#p=<slug>)',
    '  3-filtered.png                Most populated category view (#cat=<category>)',
    '  4-mobile.png                  Mobile board view at 390x844 (only with --mobile)',
  ].join('\n');
  process.stdout.write(`${usage}\n`);
}

/** Fail with a message on stderr and exit 1. */
function fail(message: string): never {
  process.stderr.write(`capture-screenshots: ${message}\n`);
  process.exit(1);
}

/** Parse a positive integer flag value. */
function parsePositiveInt(raw: string, flagName: string): number {
  if (!/^\d+$/.test(raw)) fail(`${flagName} expects a positive integer, got "${raw}"`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`${flagName} expects a positive integer, got "${raw}"`);
  }
  return parsed;
}

/** Parse CLI arguments into validated options. */
function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = {
    help: false,
    shotsDir: resolve(process.cwd(), 'screenshots'),
    mobile: false,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      return opts;
    }
    if (arg === '--mobile') {
      opts.mobile = true;
      continue;
    }

    const eqAt = arg.indexOf('=');
    const name = eqAt >= 0 ? arg.slice(0, eqAt) : arg;
    const readValue = (): string => {
      if (eqAt >= 0) {
        const val = arg.slice(eqAt + 1);
        if (!val) fail(`${name} requires a value`);
        return val;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) fail(`${name} requires a value`);
      i++;
      return next;
    };

    switch (name) {
      case '--input':
        opts.input = resolve(process.cwd(), readValue());
        break;
      case '--out-dir':
        opts.outDir = resolve(process.cwd(), readValue());
        break;
      case '--shots-dir':
        opts.shotsDir = resolve(process.cwd(), readValue());
        break;
      case '--browser':
        opts.browser = readValue();
        break;
      case '--width':
        opts.width = parsePositiveInt(readValue(), '--width');
        break;
      case '--height':
        opts.height = parsePositiveInt(readValue(), '--height');
        break;
      default:
        fail(`unknown option: ${arg} (run with --help for usage)`);
    }
  }

  if (!opts.input && !opts.outDir) {
    fail('either --input <snapshot.json|dir> or --out-dir <dir> is required (run with --help for usage)');
  }
  if (opts.input && opts.outDir) {
    fail('pass either --input or --out-dir, not both');
  }
  return opts;
}

/** Resolve an executable on PATH, or return undefined if not found. */
function findOnPath(cmd: string): string | undefined {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(locator, [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (res.status !== 0 || !res.stdout) return undefined;
  const first = res.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);
  return first && existsSync(first) ? first : undefined;
}

/** Locate Chrome/Edge executable from override, well-known paths, or PATH. */
function resolveBrowser(override?: string): string {
  if (override !== undefined) {
    const resolved = resolve(process.cwd(), override);
    if (existsSync(resolved)) return resolved;
    if (existsSync(override)) return override;
    const onPath = findOnPath(override);
    if (onPath) return onPath;
    fail(`browser binary not found: ${override}`);
  }

  for (const candidate of BROWSER_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }

  const pathNames =
    process.platform === 'win32'
      ? ['chrome.exe', 'msedge.exe']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  for (const name of pathNames) {
    const found = findOnPath(name);
    if (found) return found;
  }

  fail('could not find Chrome or Edge; pass --browser <path> to specify a headless browser binary');
}

/** Validate that a built output directory has board.json, data.js, and dashboard/index.html. */
function assertBuiltOutput(dir: string): void {
  const required = [
    join(dir, 'board.json'),
    join(dir, 'data.js'),
    join(dir, 'dashboard', 'index.html'),
  ];
  for (const file of required) {
    if (!existsSync(file)) {
      fail(`built output directory is missing ${file}`);
    }
  }
}

/** Select the top-ranked slug and most populated non-null category from board.json. */
function selectViews(boardJsonPath: string): { topSlug: string; topCategory: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(boardJsonPath, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`failed to parse ${boardJsonPath}: ${msg}`);
  }

  const rows: BoardLikeRow[] = Array.isArray(parsed)
    ? (parsed as BoardLikeRow[])
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
      ? ((parsed as { rows: BoardLikeRow[] }).rows)
      : [];

  if (rows.length === 0) fail(`${boardJsonPath} contains no rows`);

  let topRow = rows[0]!;
  let bestRank = typeof topRow.rank === 'number' && Number.isFinite(topRow.rank) ? topRow.rank : Infinity;
  for (const row of rows) {
    const rank = typeof row.rank === 'number' && Number.isFinite(row.rank) ? row.rank : Infinity;
    if (rank < bestRank) {
      bestRank = rank;
      topRow = row;
    }
  }

  if (typeof topRow.slug !== 'string' || topRow.slug.trim() === '') {
    fail(`${boardJsonPath} top-ranked row is missing a valid slug`);
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.category !== 'string') continue;
    const cat = row.category.trim();
    if (cat === '') continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  let bestCategory = '';
  let bestCount = 0;
  for (const [cat, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestCategory = cat;
    }
  }

  if (!bestCategory) {
    const fallback = typeof topRow.category === 'string' ? topRow.category.trim() : '';
    bestCategory = fallback || 'Other';
  }

  return { topSlug: topRow.slug, topCategory: bestCategory };
}

/** Start an in-process static HTTP server on 127.0.0.1:0, or null if loopback bind fails. */
async function startStaticServer(rootDir: string): Promise<{ server: Server; baseUrl: string } | null> {
  const rootResolved = resolve(rootDir);
  const rootPrefix = rootResolved.endsWith(sep) ? rootResolved : `${rootResolved}${sep}`;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    let pathname = '/';
    try {
      const parsedUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      pathname = decodeURIComponent(parsedUrl.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    const rel = pathname.replace(/^\/+/, '');
    let targetPath = resolve(rootResolved, rel || 'index.html');
    if (targetPath !== rootResolved && !targetPath.startsWith(rootPrefix)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    try {
      if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
        targetPath = join(targetPath, 'index.html');
      }
      if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const data = readFileSync(targetPath);
      const mime = MIME_TYPES[extname(targetPath).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': String(data.length) });
      res.end(method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  return await new Promise<{ server: Server; baseUrl: string } | null>((resolveStart) => {
    const onError = () => {
      server.removeListener('listening', onListening);
      try {
        server.close();
      } catch {
        // Ignore close errors on failed bind.
      }
      resolveStart(null);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        resolveStart(null);
        return;
      }
      resolveStart({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}/dashboard/index.html`,
      });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

/** Clean up a temporary directory with retries for Windows file-handle release. */
function removeDirSafe(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Best-effort cleanup so validation results are never masked.
  }
}

/** Run headless Chrome/Edge asynchronously so the in-process HTTP server can respond. */
async function captureOne(browserPath: string, target: CaptureTarget, outPath: string): Promise<void> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'token-radar-chrome-'));
  try {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${target.width},${target.height}`,
      '--virtual-time-budget=2500',
      `--user-data-dir=${userDataDir}`,
      `--screenshot=${outPath}`,
      target.url,
    ];
    await new Promise<void>((resolveRun, rejectRun) => {
      const child = spawn(browserPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      const timer = setTimeout(() => {
        child.kill();
        rejectRun(new Error(`browser timed out capturing ${target.name}`));
      }, 60_000);

      child.once('error', (err) => {
        clearTimeout(timer);
        rejectRun(new Error(`failed to launch browser for ${target.name}: ${err.message}`));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolveRun();
        } else {
          const detail = (stderr || stdout).trim();
          rejectRun(
            new Error(
              `browser exited with code ${code ?? 'null'} capturing ${target.name}${detail ? `: ${detail}` : ''}`,
            ),
          );
        }
      });
    });
  } finally {
    removeDirSafe(userDataDir);
  }
}

/** Validate PNG magic bytes, IHDR dimensions, and SHOT_CAP byte limit. */
function validatePng(filePath: string): ValidatedShot {
  if (!existsSync(filePath)) {
    throw new Error(`missing screenshot: ${filePath}`);
  }
  const st = statSync(filePath);
  if (!st.isFile()) {
    throw new Error(`not a regular file: ${filePath}`);
  }

  const buf = readFileSync(filePath);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error(`invalid PNG magic bytes: ${filePath}`);
  }
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`missing PNG IHDR chunk: ${filePath}`);
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`invalid PNG dimensions (${width}x${height}): ${filePath}`);
  }
  if (buf.length > SHOT_CAP_MAX_BYTES) {
    throw new Error(
      `screenshot exceeds ${SHOT_CAP_MAX_BYTES} bytes (${buf.length} bytes): ${filePath}`,
    );
  }

  return { path: filePath, width, height, bytes: buf.length };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }

  const browserPath = resolveBrowser(opts.browser);
  const scriptDir = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = resolve(scriptDir, '..');
  const mainTsPath = join(repoRoot, 'main.ts');

  let tempBuildDir: string | null = null;
  let server: Server | null = null;

  try {
    let buildDir: string;
    if (opts.input) {
      tempBuildDir = mkdtempSync(join(tmpdir(), 'token-radar-build-'));
      buildDir = tempBuildDir;
      try {
        execFileSync(
          process.execPath,
          [mainTsPath, '--input', opts.input, '--output', buildDir],
          { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch (err) {
        const execErr = err as { stderr?: string; stdout?: string; message?: string };
        const detail = (execErr.stderr || execErr.stdout || execErr.message || String(err)).trim();
        fail(`main.ts build failed: ${detail}`);
      }
    } else {
      buildDir = opts.outDir!;
    }

    assertBuiltOutput(buildDir);
    const { topSlug, topCategory } = selectViews(join(buildDir, 'board.json'));

    mkdirSync(opts.shotsDir, { recursive: true });

    const started = await startStaticServer(buildDir);
    let baseUrl: string;
    if (started) {
      server = started.server;
      baseUrl = started.baseUrl;
    } else {
      baseUrl = pathToFileURL(join(buildDir, 'dashboard', 'index.html')).href;
    }

    const targets: CaptureTarget[] = [
      { name: '1-board.png', url: baseUrl, width: opts.width, height: opts.height },
      {
        name: '2-detail.png',
        url: `${baseUrl}#p=${encodeURIComponent(topSlug)}`,
        width: opts.width,
        height: opts.height,
      },
      {
        name: '3-filtered.png',
        url: `${baseUrl}#cat=${encodeURIComponent(topCategory)}`,
        width: opts.width,
        height: opts.height,
      },
    ];
    if (opts.mobile) {
      targets.push({
        name: '4-mobile.png',
        url: baseUrl,
        width: MOBILE_WIDTH,
        height: MOBILE_HEIGHT,
      });
    }

    const results: ValidatedShot[] = [];
    for (const target of targets) {
      const outPath = join(opts.shotsDir, target.name);
      await captureOne(browserPath, target, outPath);
      results.push(validatePng(outPath));
    }

    for (const shot of results) {
      process.stdout.write(`${shot.path}  ${shot.width}x${shot.height}  ${shot.bytes} bytes\n`);
    }
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
    }
    if (tempBuildDir) {
      removeDirSafe(tempBuildDir);
    }
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  fail(msg);
});
