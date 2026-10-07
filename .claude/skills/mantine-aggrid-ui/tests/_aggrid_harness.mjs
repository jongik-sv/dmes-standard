// aggrid_docs 시험 공용 도구(시험 전용, 이 파일은 import 만 한다 — 실행하면 아무 일도 하지 않는다).
//  - 경로 상수, 시험 샌드박스(legacy 를 원래 이름으로 복사), 로컬 가짜 서버 기동
//  - 시험 트리 빌더(audit 픽스처 + 가짜 ag-grid 설치본: 직접 설치·pnpm·junction·없음)
//  - 골든 케이스 표(CASES)와 python/node 실행·정규화

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findPython, runCommand, runNode, makeTempDir } from '../../_shared/node/proc.mjs';
import { walkSorted } from '../../_shared/node/paths.mjs';
import { compareCodePoint } from '../../_shared/node/pytext.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL = path.join(HERE, '..');
export const SCRIPT = path.join(SKILL, 'scripts', 'aggrid_docs.mjs');
export const EXCEPTIONS = path.join(SKILL, 'scripts', 'audit-exceptions.json');
export const LEGACY = path.join(HERE, 'golden', 'legacy', 'aggrid_docs.legacy.py');
export const DRIVER = path.join(HERE, 'golden', 'legacy', 'aggrid_driver.py');
export const FIXTURES = path.join(HERE, 'fixtures', 'aggrid');
export const SERVER = path.join(HERE, '_aggrid_server.mjs');
export const REPO_FRONTEND = path.join(SKILL, '..', '..', '..', 'src', 'frontend');
/** 닫혀 있는 로컬 포트 — 빠뜨린 네트워크 접근이 실제 인터넷으로 나가지 않게 하는 기본 기준 URL */
export const DEAD = 'http://127.0.0.1:9';
export const PY_ENV = { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
const DAY = 24 * 3600 * 1000;

export const pythonOrNull = () => findPython();

// ── 샌드박스·파일 ──────────────────────────────────────────────────────────────────────────────────
export function makeSandbox(prefix = 'aggrid-') {
  const tmp = fs.realpathSync(makeTempDir(prefix));
  const legacyDir = path.join(tmp, 'legacy');
  fs.mkdirSync(legacyDir);
  fs.copyFileSync(LEGACY, path.join(legacyDir, 'aggrid_docs.py'));
  fs.copyFileSync(EXCEPTIONS, path.join(legacyDir, 'audit-exceptions.json'));
  return { tmp, legacyDir };
}

/** 예외 목록(audit-exceptions.json)을 바꾼 python legacy 폴더와 node 스크립트 사본을 만든다. */
export function buildVariant(tmp, name, exceptions) {
  const legacyDir = path.join(tmp, `legacy-${name}`);
  fs.mkdirSync(legacyDir);
  fs.copyFileSync(LEGACY, path.join(legacyDir, 'aggrid_docs.py'));
  fs.writeFileSync(path.join(legacyDir, 'audit-exceptions.json'), JSON.stringify(exceptions, null, 1));
  const skills = path.join(tmp, `skill-${name}`, '.claude', 'skills');
  const scripts = path.join(skills, 'mantine-aggrid-ui', 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  for (const f of ['aggrid_docs.mjs', '_html5_entities.json']) fs.copyFileSync(path.join(SKILL, 'scripts', f), path.join(scripts, f));
  fs.writeFileSync(path.join(scripts, 'audit-exceptions.json'), JSON.stringify(exceptions, null, 1));
  copyTree(path.join(SKILL, '..', '_shared', 'node'), path.join(skills, '_shared', 'node'), (rel) => !rel.startsWith('tests'));
  return { legacyDir, script: path.join(scripts, 'aggrid_docs.mjs') };
}

/** 예외 변이 케이스용 목록: P-R1 info·exempt·call 생략·level 생략, P-R1b info·exempt, P-R14 exempt·info, path 없는 항목 */
export const VARIANT_EXCEPTIONS = [
  { rule: 'P-R1', path: 'm-fx/pages/list1/page.tsx', call: 'searchUnits', level: 'info', reason: 'x' },
  { rule: 'P-R1', path: 'm-fx/pages/list1/page.tsx', call: 'searchCodes', reason: 'level 생략 = exempt' },
  { rule: 'P-R1', path: 'pages/list1/page.tsx', reason: 'call 생략 = 모든 호출(앞 항목이 먼저)' },
  { rule: 'P-R1', path: 'list3/Panel.tsx', call: 'searchBoards', level: 'info' },
  { rule: 'P-R1', path: 'ist3/PanelOk.tsx', call: 'searchDrops', level: 'exempt', reason: '/ 경계가 아니라 일치하지 않는다' },
  { rule: 'P-R1b', path: 'm-fx/pages/list3/page.tsx', level: 'info' },
  { rule: 'P-R1b', path: 'm-fx/pages/list5/page.tsx', level: 'exempt' },
  { rule: 'P-R14', path: 'm-fx/widgets/Clock.tsx', level: 'exempt' },
  { rule: 'P-R14', path: 'm-fx/widgets/Recursive.tsx', level: 'info' },
  { rule: 'P-R14', reason: 'path 없음' },
  { path: 'm-fx/widgets/Kind.tsx', level: 'exempt', reason: 'rule 없음' },
];

export function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** src 폴더 아래 모든 파일을 dst 로 복사한다(fs.cpSync 를 쓰지 않는다). */
export function copyTree(src, dst, filter = () => true) {
  for (const f of walkSorted(src)) {
    if (!filter(path.relative(src, f))) continue;
    const to = path.join(dst, path.relative(src, f));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f, to);
  }
}

// ── 가짜 서버 ────────────────────────────────────────────────────────────────────────────────────────
/** 로컬 가짜 서버를 별도 프로세스로 띄운다. {base, log(), reset(), stop()} */
export async function startServer() {
  const child = spawn(process.execPath, [SERVER, '--serve', FIXTURES], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      const m = /PORT (\d+)/.exec(buf);
      if (m) resolve(Number(m[1]));
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`가짜 서버가 먼저 끝남(${code})`)));
    setTimeout(() => reject(new Error('가짜 서버 시작 시간 초과')), 15000).unref();
  });
  const base = `http://127.0.0.1:${port}`;
  const get = async (p) => (await fetch(`${base}${p}`)).text();
  return {
    base,
    log: async () => JSON.parse(await get('/__log')),
    reset: () => get('/__reset'),
    stop: () => new Promise((resolve) => { child.removeAllListeners('exit'); child.on('exit', resolve); child.kill(); }),
  };
}

// ── 시험 트리 ────────────────────────────────────────────────────────────────────────────────────────
const DTS_GRID_OPTIONS = [
  '/**',
  ' * Grid options 입니다.',
  ' */',
  'export interface GridOptions<TData = any> {',
  '    /**',
  '     * Allow row selection by clicking.',
  '     * @deprecated v32.2 Use `rowSelection.enableClickSelection` instead',
  '     */',
  '    suppressRowClickSelection?: boolean;',
  '    /** @deprecated v32.2 Use `rowSelection.isRowSelectable` instead */',
  '    isRowSelectable?: (node: IRowNode<TData>) => boolean;',
  '    /** 문제 없는 옵션 */',
  '    animateRows?: boolean;',
  '    /**',
  '     * @deprecated As of v31 use `api.foo()` */',
  '    suppressFoo: string;',
  '    /** @deprecated v33 Use `suppressMenu2`   */',
  '    enableRangeSelection   ?   : boolean;',
  '    /** @deprecated 설명이 있는 한글 안내 — 대신 `rowSelection` 을 쓴다 */',
  '    한글옵션?: boolean;',
  '    /** @deprecated first note */',
  '    /** 새 JSDoc 이 시작되면 이전 안내는 버려진다 */',
  '    afterReset?: boolean;',
  '    /**',
  '     * Selection mode.',
  '     */',
  '    rowSelection?: RowSelectionOptions<TData> | undefined;',
  '    suppressRowClickSelectionExtra?: boolean;',
  '}',
  'export type GridOptionsAlias = GridOptions;',
  '',
].join('\n');

const DTS_COL_DEF = [
  'export interface ColDef<TData = any, TValue = any> {',
  '    /** @deprecated v32.2 Use `rowSelection.checkboxes` instead */',
  '    checkboxSelection?: boolean | CheckboxSelectionCallback<TData, TValue>;',
  '    /** @deprecated v32.2 Use `rowSelection.headerCheckbox` instead */',
  '    headerCheckboxSelection?: boolean;',
  '    /** @deprecated v31 Use `suppressHeaderMenuButton` instead */',
  '    suppressMenu?: boolean;',
  '    field?: string;',
  '}',
  'declare const colDefHelper: ColDef;',
  'export function ColDefFn(a: ColDef): void;',
  'export abstract class ColDefBase {',
  '}',
  '',
].join('\r\n');

/** 가짜 ag-grid-community 패키지 폴더를 만든다(package.json + d.ts 몇 개). */
export function writeFakeCommunity(pkgDir, version) {
  writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'ag-grid-community', version }, null, 2));
  const types = path.join(pkgDir, 'dist', 'types', 'src');
  writeFile(path.join(types, 'entities', 'gridOptions.d.ts'), DTS_GRID_OPTIONS);
  writeFile(path.join(types, 'entities', 'colDef.d.ts'), DTS_COL_DEF);
  writeFile(path.join(types, 'a', 'b.d.ts'), '/** 먼저 나와야 한다(성분별 정렬) */\nexport interface Ordered { ordered: 1 }\n');
  writeFile(path.join(types, 'a-c.d.ts'), '/** 나중에 나와야 한다 */\nexport interface Ordered { ordered: 2 }\n');
  writeFile(path.join(types, 'misc', 'Api.d.ts'), [
    '// 파일 첫 줄',
    '/**',
    ' * 그리드 API',
    ' */',
    'export declare class GridApi<TData = any> {',
    '    /** 한글 설명 줄 */',
    '    getRowNode(id: string): IRowNode<TData> | undefined;',
    '    destroy(): void;',
    '}',
    'export type FooType = string;',
    'export interface Foo$Bar { x: 1 }',
    'export declare const myConst: number;',
    'export declare function myFn(a: number): void;',
    'export abstract class AbstractThing {}',
    'declare type Local = 1;',
    'interface NotExported {',
    '    notExportedProp: 1',
    '}',
    '  indentedName: string;',
    'type Tpl<T> = T;',
    'a.b: weird;',
    '',
  ].join('\n'));
  writeFile(path.join(types, 'misc', 'not-dts.ts'), 'export interface NotDts {}\n');
  writeFile(path.join(types, 'misc', 'x.d.ts.bak'), 'export interface Bak {}\n');
}

function writeAuditExtras(front) {
  const w = (rel, content) => writeFile(path.join(front, rel), content);
  // 제외 폴더 안의 파일은 폴더 순회에서 빠진다
  w('m-fx/dist/bundle.ts', 'import { x } from "ag-grid-enterprise";\n');
  w('m-fx/build/out.tsx', 'import { x } from "ag-grid-enterprise";\n');
  w('m-fx/.next/page.tsx', 'import { x } from "ag-grid-enterprise";\n');
  w('m-fx/node_modules/pkg/index.ts', 'import { x } from "ag-grid-enterprise";\n');
  // 이름이 .ts 가 아닌 파일은 대상이 아니다
  w('m-fx/readme.md', 'import { x } from "ag-grid-enterprise";\n');
  w('m-fx/pages/sample.js', 'import { x } from "ag-grid-enterprise";\n');
  w('m-fx/pages/sample.jsx', 'import { x } from "ag-grid-enterprise";\nconst t = <table><thead/></table>;\nfetch("/api/auth/me");\n');
  w('m-fx/pages/dot.ts.tsx', 'import { x } from "ag-grid-enterprise";\n');
  // CRLF 변환본: 같은 규칙이 CRLF 파일에서도 같은 줄 번호로 걸려야 한다
  for (const rel of ['m-fx/pages/emptygrid/andRender.tsx', 'm-fx/pages/formstate/page.tsx', 'm-fx/pages/rowclick/page.tsx', 'm-fx/pages/mask/page.tsx', 'm-fx/pages/fixed/page.tsx', 'm-fx/pages/list3/types.ts']) {
    const src = fs.readFileSync(path.join(front, rel), 'utf8');
    const crlf = rel.replace(/(\.tsx?)$/, '.crlf$1');
    w(crlf, src.replace(/\n/g, '\r\n'));
  }
  // list3 의 CRLF 변환본은 types.ts 형제(types.ts 는 폴더당 하나)가 필요하다 → 폴더를 하나 더 둔다
  w('m-fx/pages/list5/page.tsx', 'import { searchBoards } from "./api";\r\nexport default function P() {\r\n  searchBoards({});\r\n  return <AgDataGrid />;\r\n}\r\n');
  w('m-fx/pages/list5/types.ts', 'export interface R {\r\n  id: string;\r\n  body: string;\r\n}\r\n');
  w('m-fx/pages/list5/api.ts', 'export function searchBoards(f) {\r\n  return 1;\r\n}\r\n');
  // BOM, 잘못된 UTF-8 바이트(errors="ignore" 로 버려진다), 이상한 한글 경로
  w('m-fx/pages/mask/bom.tsx', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('import { a } from \'ag-grid-enterprise\';\nfetch(\'/api/auth/me\');\n', 'utf8')]));
  w('m-fx/pages/mask/badbytes.tsx', Buffer.concat([
    Buffer.from('const a = "ok"; // ', 'utf8'), Buffer.from([0xff, 0xfe, 0xe3, 0x81]), Buffer.from('\nconst b = columnApi.x; fetch(\'/api/auth/me\');\n/* ', 'utf8'),
    Buffer.from([0xc0, 0xaf, 0xed, 0xa0, 0x80, 0xf5]), Buffer.from(' */ import { z } from "ag-grid-enterprise";\n', 'utf8'),
  ]));
  w('m-fx/pages/mask/한글 경로 공백/page.tsx', 'import { z } from "ag-grid-enterprise";\n');
}

/**
 * 시험 트리를 만든다. 모두 realpath 기준.
 *  audit : <tmp>/audit/src/frontend (픽스처 + 가짜 node_modules 직접 설치) — cwd 는 src/frontend
 *  pnpm  : <tmp>/pnpm/src/frontend/node_modules/.pnpm/ag-grid-community@{33.10.0,33.3.2,33.9.9(junction)} — cwd 는 src/deep/er
 *  none  : <tmp>/none (설치본 없음)
 */
export function buildTrees(tmp) {
  const audit = path.join(tmp, 'audit');
  const front = path.join(audit, 'src', 'frontend');
  copyTree(path.join(FIXTURES, 'audit'), audit);
  writeAuditExtras(front);
  writeFakeCommunity(path.join(front, 'node_modules', 'ag-grid-community'), '33.3.2');
  writeFile(path.join(front, 'node_modules', 'ag-grid-react', 'package.json'), JSON.stringify({ name: 'ag-grid-react', version: '33.3.1' }));
  writeFile(path.join(front, 'node_modules', 'ag-grid-enterprise', 'package.json'), JSON.stringify({ name: 'ag-grid-enterprise', version: '9.9.9' }));

  const pnpm = path.join(tmp, 'pnpm');
  const store = path.join(pnpm, 'src', 'frontend', 'node_modules', '.pnpm');
  writeFakeCommunity(path.join(store, 'ag-grid-community@33.10.0', 'node_modules', 'ag-grid-community'), '33.10.0');
  writeFakeCommunity(path.join(store, 'ag-grid-community@33.3.2', 'node_modules', 'ag-grid-community'), '33.3.2');
  writeFakeCommunity(path.join(pnpm, 'real-store', 'ag-grid-community'), '33.3.2'); // 폴더 이름(33.9.9)과 package.json 버전이 다르다
  fs.mkdirSync(path.join(store, 'ag-grid-community@33.9.9', 'node_modules'), { recursive: true });
  fs.symlinkSync(path.join(pnpm, 'real-store', 'ag-grid-community'), path.join(store, 'ag-grid-community@33.9.9', 'node_modules', 'ag-grid-community'), 'junction');
  fs.mkdirSync(path.join(store, 'ag-grid-community@broken'), { recursive: true });
  writeFile(path.join(store, 'ag-grid-react@33.3.2_react-dom@19.2.4_react@19.2.4__react@19.2.4', 'node_modules', 'ag-grid-react', 'package.json'), JSON.stringify({ name: 'ag-grid-react', version: '33.3.2' }));
  writeFile(path.join(store, 'ag-grid-react@33.10.0_react@19', 'node_modules', 'ag-grid-react', 'package.json'), JSON.stringify({ name: 'ag-grid-react', version: '33.10.0' }));
  fs.mkdirSync(path.join(pnpm, 'src', 'deep', 'er'), { recursive: true });

  const none = path.join(tmp, 'none');
  fs.mkdirSync(path.join(none, 'a', 'b'), { recursive: true });
  return { audit, front, pnpm, pnpmCwd: path.join(pnpm, 'src', 'deep', 'er'), none, noneCwd: path.join(none, 'a', 'b') };
}

// ── 캐시 준비 ────────────────────────────────────────────────────────────────────────────────────────
export function populateCache(cacheDir, spec) {
  for (const [rel, content] of Object.entries(spec.files ?? {})) {
    const file = path.join(cacheDir, rel);
    writeFile(file, content);
    const ageDays = spec.ages?.[rel] ?? 0;
    const when = new Date(Date.now() - ageDays * DAY);
    fs.utimesSync(file, when, when);
  }
}

// ── 실행·정규화 ──────────────────────────────────────────────────────────────────────────────────────
/** python 출력에만 적용하는 의도된 차이 정규화(l2-common.md) */
export function normalizePyOutput(s) {
  return s.replace(/python3 (\S*?)(\w+)\.py/g, 'node $1$2.mjs').replace(/(\w+_docs)\.py\b/g, '$1.mjs');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 임시 폴더 경로를 <T> 로 바꾼다 */
export function maskTmp(s, tmp) {
  let out = s;
  const aliases = new Set([tmp, os.tmpdir(), fs.realpathSync(os.tmpdir())]);
  for (const a of aliases) {
    if (a && a.length > 3 && a !== '/') out = out.replace(new RegExp(`${escapeRe(a)}[^\\s"'\`:)\\]]*`, 'g'), (m) => (m.startsWith(tmp) ? `<T>${m.slice(tmp.length)}` : m));
  }
  return out;
}

/** audit 출력은 파일 순서가 python 에서 파일시스템 순서라 파일 단위 묶음으로 정렬해 비교한다. */
export function canonAudit(text) {
  const lines = text.split('\n');
  const sumIdx = lines.length - 2; // 마지막은 빈 문자열, 그 앞이 요약
  const body = lines.slice(0, Math.max(0, sumIdx - 1)); // 요약 앞 빈 줄 제외
  const tail = lines.slice(Math.max(0, sumIdx - 1));
  const groups = new Map();
  let key = '';
  for (const ln of body) {
    const m = /^(.*?):\d+: /.exec(ln);
    if (m) key = m[1];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ln);
  }
  const ordered = [...groups.keys()].sort(compareCodePoint).flatMap((k) => groups.get(k));
  return [...ordered, ...tail].join('\n');
}

/**
 * 한 케이스를 한쪽(py|node)으로 실행한다.
 * c: {id, args, cwd(트리 키 또는 절대경로), cache?, env?, canon?, post?}
 * ctx: {tmp, trees, server, py}
 */
export function runSide(side, c, ctx) {
  const cacheDir = fs.mkdtempSync(path.join(ctx.tmp, 'cache-'));
  if (c.cache) populateCache(cacheDir, c.cache);
  if (c.prepare) c.prepare(cacheDir, ctx);
  const site = c.server ? `${ctx.server.base}/site` : DEAD;
  const agdev = c.server ? `${ctx.server.base}/agdev` : DEAD;
  const env = { AGGRID_DOCS_CACHE: cacheDir, AGGRID_DOCS_SITE: site, AGGRID_DOCS_AGDEV_RAW: agdev, ...resolveEnv(c.env, ctx.server) };
  const cwd = ctx.trees[c.cwd] ?? c.cwd ?? ctx.trees.none;
  const variant = c.variant ? ctx.variants[c.variant] : null;
  const args = c.args.map((a) => (typeof a === 'function' ? a(ctx) : a));
  let r;
  if (side === 'py') {
    r = runCommand(ctx.py, [DRIVER, variant ? variant.legacyDir : ctx.legacyDir, 'cli', ...args], { cwd, env: { ...PY_ENV, ...env }, input: c.input });
    r.stdout = normalizePyOutput(r.stdout);
    r.stderr = normalizePyOutput(r.stderr);
  } else {
    r = runNode(variant ? variant.script : SCRIPT, args, { cwd, env, input: c.input });
  }
  const mask = (t) => maskTmp(t, ctx.tmp).replace(/<T>\/cache-[A-Za-z0-9]{6}/g, '<CACHE>').replace(/127\.0\.0\.1:\d+/g, '<SERVER>');
  let stdout = mask(r.stdout);
  const stderr = mask(r.stderr);
  if (c.canon === 'audit') stdout = canonAudit(stdout);
  const out = { status: r.status, stdout, stderr };
  if (c.post) out.post = c.post(cacheDir, ctx);
  out.cache = listCache(cacheDir);
  return out;
}

/** 캐시 폴더에 남은 파일 → 내용 해시(파일 이름·바이트가 두 판에서 같은지 본다) */
export function listCache(dir) {
  const res = {};
  for (const f of walkSorted(dir)) res[path.relative(dir, f).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
  return res;
}

// ── 골든 케이스 표 ───────────────────────────────────────────────────────────────────────────────────
const AUDIT_DIRS = ['m-fx', 'm-mcm', 'm-mdm', 'shared'];

/** 사용 오류 케이스는 종료 코드와 빈 stdout 만 본다(argparse 문구는 _shared/node/args.mjs 규약). */
export const USAGE_CASES = [
  { id: 'usage-noargs', args: [] },
  { id: 'usage-badcmd', args: ['nope'] },
  { id: 'usage-search-noterms', args: ['search'] },
  { id: 'usage-search-badlimit', args: ['search', 'a', '--limit', 'x'] },
  { id: 'usage-get-noslug', args: ['get'] },
  { id: 'usage-get-badfw', args: ['get', 'x', '--framework', 'foo'] },
  { id: 'usage-get-unknown-opt', args: ['get', 'x', '--nope'] },
  { id: 'usage-types-noname', args: ['types'] },
  { id: 'usage-audit-nopaths', args: ['audit'] },
  { id: 'usage-version-extra', args: ['version', 'extra'] },
  { id: 'usage-section-noval', args: ['get', 'x', '--section'] },
];

export const CASES = [
  // ── version ──
  { id: 'version-direct', cwd: 'front', args: ['version'] },
  { id: 'version-pnpm', cwd: 'pnpmCwd', args: ['version'] },
  { id: 'version-none', cwd: 'noneCwd', args: ['version'] },
  // ── types ──
  { id: 'types-rowSelection', cwd: 'front', args: ['types', 'rowSelection'] },
  { id: 'types-ColDef', cwd: 'front', args: ['types', 'ColDef'] },
  { id: 'types-ColDef-after0', cwd: 'front', args: ['types', 'ColDef', '--after', '0'] },
  { id: 'types-ColDef-after-neg', cwd: 'front', args: ['types', 'ColDef', '--after', '-1'] },
  { id: 'types-ColDef-limit1', cwd: 'front', args: ['types', 'ColDef', '--limit', '1'] },
  { id: 'types-ColDef-limit0', cwd: 'front', args: ['types', 'ColDef', '--limit', '0'] },
  { id: 'types-Ordered', cwd: 'front', args: ['types', 'Ordered'] },
  { id: 'types-GridApi-pnpm', cwd: 'pnpmCwd', args: ['types', 'GridApi'] },
  { id: 'types-Ordered-pnpm', cwd: 'pnpmCwd', args: ['types', 'Ordered', '--after', '1'] },
  { id: 'types-dollar', cwd: 'front', args: ['types', 'Foo$Bar'] },
  { id: 'types-dot', cwd: 'front', args: ['types', 'a.b'] },
  { id: 'types-regex-chars', cwd: 'front', args: ['types', '(x|y)*'] },
  { id: 'types-hangul', cwd: 'front', args: ['types', '한글옵션'] },
  { id: 'types-missing', cwd: 'front', args: ['types', 'NoSuchThing'] },
  { id: 'types-empty-name', cwd: 'front', args: ['types', ''] },
  { id: 'types-keyword-prefix', cwd: 'front', args: ['types', 'myConst'] },
  { id: 'types-indented', cwd: 'front', args: ['types', 'indentedName'] },
  { id: 'types-none', cwd: 'noneCwd', args: ['types', 'ColDef'] },
  { id: 'types-notexported', cwd: 'front', args: ['types', 'notExportedProp'] },
  { id: 'types-Tpl', cwd: 'front', args: ['types', 'Tpl', '--after', '0'] },
  // ── refresh ──
  { id: 'refresh-existing', cwd: 'none', args: ['refresh'], cache: { files: { 'agdev/documentation-index.md': 'x', 'archive/1/react/a.txt': 'y' } }, post: (d) => fs.existsSync(d) },
  { id: 'refresh-missing-dir', cwd: 'none', args: ['refresh'], prepare: (d) => fs.rmdirSync(d), post: (d) => fs.existsSync(d) },
  // ── audit(경로 모양) ──
  { id: 'audit-fixtures', cwd: 'front', args: ['audit', ...AUDIT_DIRS], canon: 'audit' },
  { id: 'audit-dot', cwd: 'front', args: ['audit', '.'], canon: 'audit' },
  { id: 'audit-dotslash-trailing', cwd: 'front', args: ['audit', './m-fx/', 'shared//src/'], canon: 'audit' },
  { id: 'audit-dotdot', cwd: 'front', args: ['audit', 'm-fx/../m-fx/pages'], canon: 'audit' },
  { id: 'audit-absolute', cwd: 'none', args: ['audit', (ctx) => path.join(ctx.trees.front, 'm-mdm'), (ctx) => `${path.join(ctx.trees.front, 'm-mcm')}/`], canon: 'audit' },
  { id: 'audit-file', cwd: 'front', args: ['audit', 'm-fx/pages/fixed/page.tsx'] },
  { id: 'audit-file-nonts', cwd: 'front', args: ['audit', 'm-fx/readme.md', 'm-fx/pages/sample.js'] },
  { id: 'audit-twice', cwd: 'front', args: ['audit', 'm-fx/pages/auth', 'm-fx/pages/auth/page.tsx'], canon: 'audit' },
  { id: 'audit-missing-path', cwd: 'front', args: ['audit', 'nope/none'] },
  { id: 'audit-explicit-node-modules-file', cwd: 'front', args: ['audit', 'node_modules/ag-grid-community/dist/types/src/entities/gridOptions.d.ts'] },
  { id: 'audit-build-in-path', cwd: 'front', args: ['audit', 'm-fx/build'] },
  { id: 'audit-no-install', cwd: 'noneCwd', args: ['audit', '.'] },
  { id: 'audit-warn-only', cwd: 'front', args: ['audit', 'm-fx/pages/list1', 'm-fx/pages/list2', 'm-fx/pages/emptygrid'], canon: 'audit' },
  { id: 'audit-pnpm-install', cwd: 'pnpmCwd', args: ['audit', (ctx) => path.join(ctx.trees.front, 'm-fx/pages/deprec')], canon: 'audit' },
  // ── 검색·문서(가짜 서버) ──
  { id: 'search-column', server: true, cwd: 'none', args: ['search', 'column'] },
  { id: 'search-two-terms', server: true, cwd: 'none', args: ['search', 'column', 'definitions'] },
  { id: 'search-limit3', server: true, cwd: 'none', args: ['search', 'column', '--limit', '3'] },
  { id: 'search-limit-first', server: true, cwd: 'none', args: ['search', '--limit', '2', 'row', 'selection'] },
  { id: 'search-limit0', server: true, cwd: 'none', args: ['search', 'column', '--limit', '0'] },
  { id: 'search-limit-neg', server: true, cwd: 'none', args: ['search', 'column', '--limit', '-2'] },
  { id: 'search-nomatch', server: true, cwd: 'none', args: ['search', 'zzzqqq'] },
  { id: 'search-upper', server: true, cwd: 'none', args: ['search', 'COLUMN', 'Pinning'] },
  { id: 'search-hangul-term', server: true, cwd: 'none', args: ['search', '한글'] },
  { id: 'search-empty-term', server: true, cwd: 'none', args: ['search', ''] },
  { id: 'recommendations', server: true, cwd: 'none', args: ['recommendations'] },
  { id: 'get-colDef', server: true, cwd: 'none', args: ['get', 'column-definitions', '--version', '33.3.2'] },
  { id: 'get-rowSel', server: true, cwd: 'none', args: ['get', 'row-selection', '--version', '33.3.2'] },
  { id: 'get-rowSel-section', server: true, cwd: 'none', args: ['get', 'row-selection', '--version', '33.3.2', '--section', 'selection'] },
  { id: 'get-colDef-section-deep', server: true, cwd: 'none', args: ['get', 'column-definitions', '--version', '33.3.2', '--section', 'Column Types'] },
  { id: 'get-section-none', server: true, cwd: 'none', args: ['get', 'column-definitions', '--version', '33.3.2', '--section', 'zzzz'] },
  { id: 'get-section-empty', server: true, cwd: 'none', args: ['get', 'column-definitions', '--version', '33.3.2', '--section', ''] },
  { id: 'get-latest', server: true, cwd: 'none', args: ['get', 'column-definitions', '--latest'] },
  { id: 'get-latest-section', server: true, cwd: 'none', args: ['get', 'row-selection', '--latest', '--section', 'Selection'] },
  { id: 'get-latest-missing', server: true, cwd: 'none', args: ['get', 'no-such-slug', '--latest'] },
  { id: 'get-archive-missing', server: true, cwd: 'none', args: ['get', 'no-such-slug', '--version', '33.3.2'] },
  { id: 'get-fw-javascript-missing', server: true, cwd: 'none', args: ['get', 'column-definitions', '--version', '33.3.2', '--framework', 'javascript'] },
  { id: 'get-installed-version', server: true, cwd: 'front', args: ['get', 'row-selection'] },
  { id: 'get-installed-version-pnpm', server: true, cwd: 'pnpmCwd', args: ['get', 'row-selection'] },
  { id: 'get-no-install', server: true, cwd: 'noneCwd', args: ['get', 'row-selection'] },
  { id: 'get-syn-entities', server: true, cwd: 'none', args: ['get', 'syn-entities', '--version', '33.3.2'] },
  { id: 'get-syn-entities-crlf', server: true, cwd: 'none', args: ['get', 'syn-entities__crlf', '--version', '33.3.2'] },
  { id: 'get-syn-nomain', server: true, cwd: 'none', args: ['get', 'syn-nomain', '--version', '33.3.2'] },
  { id: 'get-syn-noh1', server: true, cwd: 'none', args: ['get', 'syn-noh1', '--version', '33.3.2'] },
  { id: 'get-syn-leading', server: true, cwd: 'none', args: ['get', 'syn-leading', '--version', '33.3.2'] },
  { id: 'get-syn-nested', server: true, cwd: 'none', args: ['get', 'syn-nested', '--version', '33.3.2'] },
  { id: 'get-syn-nested-crlf', server: true, cwd: 'none', args: ['get', 'syn-nested__crlf', '--version', '33.3.2'] },
  { id: 'get-syn-ent-only', server: true, cwd: 'none', args: ['get', 'syn-ent-only', '--version', '33.3.2'] },
  { id: 'get-redirect', server: true, cwd: 'none', args: ['get', '__redirect__', '--version', '33.3.2'] },
  { id: 'get-empty-204', server: true, cwd: 'none', args: ['get', '__empty__', '--version', '33.3.2'] },
  { id: 'get-http500-nocache', server: true, cwd: 'none', args: ['get', '__500__', '--version', '33.3.2'] },
  { id: 'get-http403-nocache', server: true, cwd: 'none', args: ['get', '__403__', '--version', '33.3.2'] },
  { id: 'get-http500-latest-nocache', server: true, cwd: 'none', args: ['get', '__500__', '--latest'] },
  {
    id: 'get-http500-stale-raw-html', server: true, cwd: 'none', args: ['get', '__500__', '--version', '33.3.2'],
    cache: { files: { 'raw.html': '<main><h1>Stale Raw</h1><p>old &amp; cached</p></main>', 'latest/react/__500__.md': '---\nenterprise: false\n---\n' }, ages: { 'raw.html': 30, 'latest/react/__500__.md': 0 } },
  },
  {
    id: 'get-http500-stale-latest', server: true, cwd: 'none', args: ['get', '__500__', '--latest'],
    cache: { files: { 'latest/react/__500__.md': '---\nenterprise: true\n---\n# Stale latest\n' }, ages: { 'latest/react/__500__.md': 30 } },
  },
  {
    id: 'search-http500-index-stale-cache', server: true, cwd: 'none', args: ['search', 'stale'],
    cache: { files: { 'agdev/documentation-index.md': '- 오래된 색인 `stale-slug`\n' }, ages: { 'agdev/documentation-index.md': 30 } },
    env: { AGGRID_DOCS_AGDEV_RAW: 'SERVER/agdev/__500__' },
  },
  // ── 예외 목록 변이(audit-exceptions.json 을 바꾼 사본) ──
  { id: 'variant-list1', variant: 'exc', cwd: 'front', args: ['audit', 'm-fx/pages/list1'], canon: 'audit' },
  { id: 'variant-list3-5', variant: 'exc', cwd: 'front', args: ['audit', 'm-fx/pages/list3', 'm-fx/pages/list5'], canon: 'audit' },
  { id: 'variant-widgets', variant: 'exc', cwd: 'front', args: ['audit', 'm-fx/widgets', 'm-fx/widget-types', 'shared/src/widget'], canon: 'audit' },
  { id: 'variant-all', variant: 'exc', cwd: 'front', args: ['audit', 'm-fx', 'm-mcm', 'm-mdm', 'shared'], canon: 'audit' },
  // ── 캐시만으로(네트워크 0) ──
  {
    id: 'cache-search', cwd: 'none', args: ['search', 'pinning'],
    cache: { files: { 'agdev/documentation-index.md': '# 색인\n- 컬럼 고정 `column-pinning`\n  - 들여쓴 줄 `row-pinning`\n-설명없음`nospace-slug`\n- 대문자 `Bad_Slug`\n- 끝 공백 `ok-slug`   \n일반 줄 `not-a-bullet`\n-  여러   설명 `a1-b2` \n' } },
  },
  {
    id: 'cache-recommendations', cwd: 'none', args: ['recommendations'],
    cache: { files: { 'agdev/recommendations.md': '# 권장사항\r\n한글 줄\r\n' } },
  },
  {
    id: 'cache-recommendations-missing-404', cwd: 'none', args: ['recommendations'], server: true,
    env: { AGGRID_DOCS_AGDEV_RAW: 'SERVER/agdev/none-here' },
  },
  {
    id: 'cache-get-archive-txt', cwd: 'none', args: ['get', 'my-slug', '--version', '1.2.3', '--section', 'B'],
    cache: {
      files: {
        'archive/1.2.3/react/my-slug.txt': '# A\n본문 A\n## B 제목\n내용 B\n### B1\n하위\n## C\n내용 C\n#heading-no-space\n# B 다시\n끝\r\n마지막',
        'latest/react/my-slug.md': '---\nproduct: "AG Grid"\nenterprise: true\n---\n본문\n',
      },
    },
  },
  {
    id: 'cache-get-archive-txt-community', cwd: 'none', args: ['get', 'my-slug', '--version', '1.2.3'],
    cache: {
      files: {
        'archive/1.2.3/react/my-slug.txt': '# A\n본문 A\n',
        'latest/react/my-slug.md': '---\nproduct: "AG Grid"\nenterprise:   false\n---\nenterprise: true\n',
      },
    },
  },
  {
    id: 'cache-get-enterprise-in-body-only', cwd: 'none', args: ['get', 'my-slug', '--version', '1.2.3'],
    cache: {
      files: {
        'archive/1.2.3/react/my-slug.txt': '# A\n',
        'latest/react/my-slug.md': 'no front matter\nenterprise: true\n',
      },
    },
  },
  {
    id: 'cache-get-enterprise-headline', cwd: 'none', args: ['get', 'my-slug', '--version', '1.2.3'],
    cache: {
      files: {
        'archive/1.2.3/react/my-slug.txt': '# A\n',
        'latest/react/my-slug.md': '---\nenterprise:true\n---\n',
      },
    },
  },
  {
    id: 'cache-get-latest', cwd: 'none', args: ['get', 'my-slug', '--latest', '--framework', 'vue'],
    cache: { files: { 'latest/vue/my-slug.md': '---\nenterprise: true\n---\n# T\n본문\n' } },
  },
];

/** 가짜 서버 주소가 필요한 환경 변수 치환(SERVER/…) */
export function resolveEnv(env, server) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) out[k] = typeof v === 'string' && server ? v.replace('SERVER', server.base) : v;
  return out;
}

// ── 함수 단위 비교 입력(python `call` 모드와 node 내보내기 함수) ─────────────────────────────────────────
/** html.unescape 입력 모음: 세미콜론 없는 이름, 숫자 참조 경계, 서로게이트·범위 밖, 긴 이름, 경계 문자 */
export const UNESCAPE_INPUTS = [
  '', 'plain', '&', '&&', '&amp', '&amp;', '&amp;amp;', '&ampx', '&amp x', '&AMP', '&AMPx', '&notit;', '&notin;', '&notin', '&not', '&noti',
  '&copy 2024', '&copy2024', '&copyright;', '&COPY;', '&Copy;', '&sup3', '&sup3;', '&sup2x', '&frac12y', '&frac34;', '&frac14', '&para', '&parallel;',
  '&#0;', '&#0', '&#1;', '&#8;', '&#9;', '&#10;', '&#11;', '&#12;', '&#13;', '&#14;', '&#31;', '&#32;', '&#127;', '&#128;', '&#129;', '&#130;', '&#141;', '&#150;', '&#159;', '&#160;',
  '&#x0;', '&#x80;', '&#x81;', '&#x8d;', '&#x8F;', '&#x90;', '&#x9f;', '&#X9F;', '&#xA0;', '&#x7f;', '&#xb;', '&#xB', '&#x1f;',
  '&#xD7FF;', '&#xD800;', '&#xDBFF;', '&#xDC00;', '&#xDFFF;', '&#xE000;', '&#xFDCF;', '&#xFDD0;', '&#xFDEF;', '&#xFDF0;', '&#xFFFE;', '&#xFFFF;', '&#x10000;', '&#x1FFFE;', '&#x1FFFF;',
  '&#x10FFFF;', '&#x110000;', '&#x10FFFE;', '&#1114111;', '&#1114112;', '&#99999999999999999999;', '&#xFFFFFFFFFFFFFFFFFFFF;', '&#65', '&#65;', '&#65a', '&#x41', '&#X41;', '&#xg;', '&#x;', '&#;', '&#', '&# 65;',
  '&#12345678901234567890123456789012345678901234567890;', '&#0000000000065;', '&#x000000041;',
  '&Afr;', '&Aopf;', '&fjlig;', '&NotEqualTilde;', '&thickapprox;', '&bne;', '&nvlt;', '&hellip;', '&hearts;', '&hearts', '&Hearts;', '&rarr;', '&larr', '&nbsp;', '&nbsp', '&NBSP', '&shy;', '&zwj;',
  '&unknown;', '&x;', '&;', '&abc', '&a;', '&a', '&ab', '&abc;', '&abcdefghijklmnopqrstuvwxyzabcdefgh;', '&abcdefghijklmnopqrstuvwxyzabcdefg;', '&abcdefghijklmnopqrstuvwxyzabcdefghi', '&amp'.repeat(40),
  '&a b;', '&a\tb;', '&a\nb;', '&a\fb;', '&a\rb;', '&a<b;', '&a&b;', '&a#b;', '&a;b;', '&amp<', '&amp;&lt;&gt;&quot;&apos;', '&lt&gt&quot&apos', '&apos', '&quot', '&QUOT;', '&reg', '&REG',
  '한글 &amp; 텍스트 &hellip 더 &#xAC00; &#44032;', '😀 &#x1F600; &#128512; &emoji;', 'a&amp;b&amp;&amp;c', '&&&amp;&&', '&amp;#65;', '&#38;#65;', '&AMP;lt;', '&amp;lt;',
  '&acE;', '&acd;', '&acirc', '&Aacute', '&aacute;x', '&aring', '&Aring;', '&ordf', '&ordm;', '&micro', '&middot;', '&iexcl', '&iquest;', '&times', '&divide;', '&curren', '&yen;',
  'x'.repeat(10) + '&amp' + 'y'.repeat(10),
  '&centerdot;', '&CenterDot;', '&bigstar;', '&starf;', '&lang;', '&langle;', '&lAarr;', '&Lleftarrow;', '&dollar', '&dollar;', '&lpar;', '&rpar;', '&num;', '&excl;',
];

/** mask_comments·match_close 입력(코드 모양 문자열) */
export const CODE_INPUTS = [
  '', 'a', '// c', '/* c */', 'x // c\ny', 'x /* a\nb */ y', "'a // b'", '"a // b"', '`a // ${b} // c`', "don't // c", "it's /* x */ fine", 'a /* unclosed', 'a // no newline',
  "'unterminated\nnext // c", '"unterminated\nnext // c', '`unterminated ${ x', '`a ${ b( } c`', '`a ${ `n ${ x }` } // c`', "a = 'x\\'y' // z", 'a = "x\\"y" // z', 'a = `x\\`y` // z',
  '/**/ x', '/* */*/', '/*/ x', '//*/ x', 'a//b//c', 'a/ /b', '(a (b) [c] {d})', '(a [b) c]', '((((', '))))', '{ a: [1, (2)], b: "}" }', "{ a: '}', b: `}` }", '{ `${ { a: 1 } }` }',
  '[ // ]\n]', '( /* ) */ )', "( ') ' )", '( "\n) )', '한글 // 주석\n한글2 /* 블록 */ 끝', '\r\n// c\r\nx', 'a // c b', 'a // c',
  'foo(\n  a,\n  b\n)', 'foo(a)(b)(c)', '<A b={1} c="}">', 'x ? (a) : (b)',
];

/** html_to_text 입력: 픽스처 HTML 전부(+CRLF 변환본) + 코드 모양 문자열을 <main> 에 넣은 것 */
export function htmlInputs() {
  const out = [];
  const dir = path.join(FIXTURES, 'site', 'archive', '33.3.2', 'react');
  for (const f of walkSorted(dir)) {
    let text;
    if (f.endsWith('.html.gz')) text = zlib.gunzipSync(fs.readFileSync(f)).toString('utf8');
    else if (f.endsWith('.html')) text = fs.readFileSync(f, 'utf8');
    else continue;
    const name = path.basename(f).replace(/\.html(\.gz)?$/, '');
    out.push([name, text]);
    if (!f.endsWith('.gz')) out.push([`${name}__crlf`, text.replace(/\r?\n/g, '\r\n')]);
  }
  for (const [i, c] of CODE_INPUTS.entries()) out.push([`code-${i}`, `<main><h1>T</h1><pre>${c}</pre><code>${c}</code><p>${c}</p></main>`]);
  for (const [i, c] of UNESCAPE_INPUTS.entries()) out.push([`ent-${i}`, `<main><h1>T</h1><p>${c}</p></main>`]);
  return out;
}

/** pyre 대조용 글 모음(BMP 만 — 위치를 UTF-16 과 코드포인트가 같게) */
export function pyreTexts() {
  const base = [...CODE_INPUTS, ...UNESCAPE_INPUTS.filter((x) => !/[\u{10000}-\u{10FFFF}]/u.test(x))];
  const extra = [
    'const [a, setA] = useState<Form>({});', 'const [한글Form, set한글Form] = useState({});', 'foo한글 bar', '한글foo', 'x.한글.y',
    ' \t\n\r\f\v\x1c\x1d\x1e\x1f\x85\xa0       　﻿᠎', 'a b　c﻿d\x85e\x1cf',
    'line1\nline2\n', 'line1\n\nline2', 'a\n', 'a\r\nb', 'a b c', 'enterprise: true\n', 'x\nenterprise:  true\ny', 'enterprise: truex',
    '    - 설명 `a-b`', '- 설명 `a-b`   ', '-설명`ab`', '- `slug`', '- x `A-b`', 'ab12 _x', 'ÀÉ ß ſ K', 'İstanbul', 'FORM form Form', 'Columns ROWDATA coldefs',
    'search한글(a)', 'a.searchFoo(', '$searchFoo(', 'searchFoo(x)', 'x.\nsearchFoo(x)', 'function searchFoo(x)', 'import searchFoo from',
    '<thead>', '<thead\n>', '<theadx', '<table><THEAD>', '{rows.length > 0 && (<AgDataGrid />)}', '.length === 0 ? (<p/>) : (<AgDataGrid/>)',
    'if (!kw) { return; }\nfoo()', '  if (!kw) return;\n  x()', 'return\n', 'visibilityState isActive isActives xisActive', 'onRowClicked={(e) => 1}',
    'const handleRowClick = useCallback((r) => { a(); }, [a]);', 'function chooseX(a) {}', 'const f = async (a: A): R => {', 'const g = (a) => b;', 'const h = x => y;',
    'rowSelection="multiple"', "rowSelection={'single'}", 'ag-grid-community/styles/ag-grid.css', "from 'ag-grid-enterprise'", 'from "@ag-grid-community/core"', 'columnApi 한글columnApi columnApi한글',
    'useSyncExternalStore(subscribe, getState)', 'useSyncExternalStore(sub, () => state.x)', 'useSyncExternalStore(\n s,\n g\n)',
    '"id: string"', 'CONTENT: string', '  readonly body?: string;\n  "cntn": string', 'contentType: string', 'content: string[]', 'bodyX : string', ' \n  content: string',
    'includeContent: false', 'includecontent : false', 'excludeBody:true', 'withBody": false',
    'set한글(', 'setFoo(', 'setErrorMessage(', 'setLoading(', 'setRoleOptions(r); setOpen(1);',
    'portal-tab-activated', "addEventListener('portal-tab-activated'", 'addEventListener( `portal-tab-activated`', 'fetch( "/x/auth/me" )', "fetch('/api/auth/meX')",
    'export default function Foo(', 'export default function (', 'export default Page;', 'function Page(', 'const Page = memo((',
    'data = { rows, foo }', 'data={ { a: 1 } }', 'on한글Change', 'onChange={', 'onChange = {',
    'window.setInterval(', 'setInterval (', 'obj.setInterval(', 'setTimeout(()=>1, 1)', 'xsetTimeout(',
    '@deprecated v32 Use `rowSelection.x` instead', '@deprecated  foo */', '/** doc */', '  /**', '   * line', 'foo?: string;', 'fooBar  ?  : x', '  한글옵션?: boolean;',
  ];
  return [...base, ...extra];
}

// ── 스냅샷(python 과 node 가 같은 모양으로 낸다) ─────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { buildFuzzTree, loadBases } from './_aggrid_fuzz.mjs';

export const RE_PROBE = path.join(HERE, 'golden', 'legacy', 'aggrid_re_probe.py');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** 모든 CASES·USAGE_CASES 를 돌린다. 반환 {cases:{id:out}, usage:{id:{status,stdout}}} */
export function snapshotCases(side, ctx) {
  const cases = {};
  for (const c of CASES) cases[c.id] = runSide(side, c, ctx);
  const usage = {};
  for (const c of USAGE_CASES) {
    const r = runSide(side, { ...c, cwd: 'none' }, ctx);
    usage[c.id] = { status: r.status, stdout: r.stdout };
  }
  return { cases, usage };
}

/** 함수 단위: html.unescape·html_to_text·mask_comments·match_close */
export async function snapshotCalls(side, ctx) {
  const unescapeInputs = UNESCAPE_INPUTS;
  const html = htmlInputs();
  const closeCalls = [];
  for (const [ci, s] of CODE_INPUTS.entries()) for (let i = 0; i < s.length; i++) if ('([{'.includes(s[i])) closeCalls.push([ci, i]);
  if (side === 'py') {
    const calls = [
      ...unescapeInputs.map((s) => ['html.unescape', [s]]),
      ...html.map(([, h]) => ['html_to_text', [h]]),
      ...CODE_INPUTS.map((s) => ['mask_comments', [s]]),
      ...closeCalls.map(([ci, i]) => ['match_close', [CODE_INPUTS[ci], i]]),
    ];
    const r = runCommand(ctx.py, [DRIVER, ctx.legacyDir, 'call'], { input: JSON.stringify(calls), env: PY_ENV });
    if (r.status !== 0) throw new Error(`python call 실패: ${r.stderr}`);
    const res = JSON.parse(r.stdout);
    let k = 0;
    const take = (n) => res.slice(k, (k += n));
    return { unescape: take(unescapeInputs.length), html: take(html.length), mask: take(CODE_INPUTS.length), close: take(closeCalls.length) };
  }
  const mod = await import(pathToFileURL(SCRIPT).href);
  return {
    unescape: unescapeInputs.map((s) => mod.html_unescape(s)),
    html: html.map(([, h]) => mod.html_to_text(h)),
    mask: CODE_INPUTS.map((s) => mod.mask_comments(s)),
    close: closeCalls.map(([ci, i]) => mod.match_close(CODE_INPUTS[ci], i)),
  };
}

/** python re 와 pyre 변환층 대조. 패턴 목록은 node 판이 컴파일한 것(+추가분). */
export async function snapshotPyre(side, ctx) {
  const mod = await import(pathToFileURL(SCRIPT).href);
  const extras = [
    ['\\bfoo\\b', ''], ['\\Bx', ''], ['^a$', 'm'], ['^a$', ''], ['a$', ''], ['\\Aa\\Z', ''], ['a.b', ''], ['a.b', 's'], ['(?i)x\\w+', ''], ['[\\w.$]+', ''],
    ['[^\\s]+', ''], ['\\S+', ''], ['\\W+', ''], ['\\d+', ''], ['\\D+', ''], ['[\\s\\S]+?x', ''], ['(?P<n>a)(?P=n)', ''], ['(a)\\1', ''], ['a{2}', ''], ['a{,2}b', ''],
    ['a{x', ''], ['a}', ''], ['[a-z0-9-]+', ''], ['\\"\\\'\\`', ''], ['\\&\\#\\~\\ ', ''], ['x\\.y', ''], ['[\\]]', ''], ['[]a]', ''], ['\\$\\^', ''], ['(?:a|b)+?c', 'i'],
  ];
  const htmlPatterns = [['<main.*?</main>', 's'], ['<(script|style|svg|nav|button)[^>]*>.*?</\\1>', 's'], ['<pre[^>]*>', ''], ['<h([1-6])[^>]*>', ''], ['<code[^>]*>', ''],
    ['<br\\s*/?>|</p>|</li>|</h[1-6]>|</tr>|</div>', ''], ['<li[^>]*>', ''], ['<[^>]+>', ''], ['```\\n`(.*?)`\\n```', 's'], ['\\n\\s*\\n+', ''], ['^# ', 'm'],
    ['&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\\t\\n\\f <&#;]{1,32};?)', '']];
  const patterns = [...mod.STATIC_PATTERNS, ...htmlPatterns, ...extras];
  const texts = pyreTexts();
  if (side === 'py') {
    const r = runCommand(ctx.py, [RE_PROBE], { input: JSON.stringify({ patterns, texts }), env: PY_ENV });
    if (r.status !== 0) throw new Error(`python re 대조 실패: ${r.stderr}`);
    return JSON.parse(r.stdout);
  }
  const out = {};
  for (const [pi, [src, flags]] of patterns.entries()) {
    const rx = mod.pyre(src, flags);
    const per = {};
    for (const [ti, text] of texts.entries()) {
      const rows = [];
      for (const m of rx.finditer(text)) rows.push([m.index, m.index + m[0].length, ...Array.from({ length: rx.groups }, (_, g) => m[g + 1] ?? null)]);
      if (rows.length) per[String(ti)] = rows;
    }
    if (Object.keys(per).length) out[String(pi)] = per;
  }
  return out;
}

/** 변이 퍼저 입력 트리를 만든다(py·node 가 같은 트리를 쓴다). withReal 이면 실제 화면 소스도 섞는다. */
export function prepareFuzz(ctx, { seed, count, withReal }) {
  let bases = loadBases(path.join(FIXTURES, 'audit'));
  if (withReal) bases = bases.concat(loadBases(REPO_FRONTEND, { maxBytes: 20000 }).filter((_, i) => i % 11 === 0).slice(0, 300));
  const root = fs.mkdtempSync(path.join(ctx.tmp, 'fz-'));
  buildFuzzTree(path.join(root, 'm-fz', 'pages'), { seed, count, bases });
  buildFuzzTree(path.join(root, 'shared', 'src'), { seed: seed + 1000, count: Math.floor(count / 3), bases });
  return root;
}

/** 퍼저 트리에 audit 을 돌린 정규화 결과. text 는 파일 단위로 정렬한 stdout, sha 는 그 해시. */
export function snapshotFuzz(side, ctx, root) {
  const args = ['audit', path.join(root, 'm-fz'), path.join(root, 'shared')];
  const r = runSide(side, { id: 'fuzz', args, cwd: 'front', canon: 'audit' }, ctx);
  const text = r.stdout.split(root).join('<FZ>').replace(/<T>\/fz-[A-Za-z0-9]{6}/g, '<FZ>');
  return { status: r.status, lines: text.split('\n').length, sha: sha(text), stderr: r.stderr, text };
}

/** 기대값 파일(tests/golden/expected/aggrid_docs.expected.json) 한 벌. 큰 항목은 해시로 줄인다. */
export const EXPECTED_FILE = path.join(HERE, 'golden', 'expected', 'aggrid_docs.expected.json');
export const FUZZ_SEEDS = [20261007, 7];
const h16 = (v) => sha(typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 16);

export async function snapshotAll(side, ctx) {
  const { cases, usage } = snapshotCases(side, ctx);
  const calls = await snapshotCalls(side, ctx);
  const html = {};
  for (const [i, [name]] of htmlInputs().entries()) html[name] = h16(calls.html[i]);
  const pyre = await snapshotPyre(side, ctx);
  const fuzz = FUZZ_SEEDS.map((seed) => {
    const root = prepareFuzz(ctx, { seed, count: 300, withReal: false });
    const r = snapshotFuzz(side, ctx, root);
    return { seed, status: r.status, lines: r.lines, sha: r.sha };
  });
  return {
    cases, usage,
    calls: { unescape: calls.unescape, mask: calls.mask, close: calls.close, html },
    pyre: { patterns: Object.keys(pyre).length, matches: Object.values(pyre).reduce((a, per) => a + Object.values(per).reduce((b, rows) => b + rows.length, 0), 0), sha: h16(pyre) },
    fuzz,
  };
}
