// screen-cache.sh 의 node 판. 공개 12함수만 CLI·스위치, _sc_trusted 는 안에만 둔다.
// 계약: tests/js-parity/README.md, brief 8.3. 정답은 bash 판.
//   · 의존: coord_expand·coord_cfg·coord_screen_prompt_kind → common.mjs, compat_stat_info → compat.mjs.
//   · 파일에 쓰는 JSON 은 jq-json.mjs 로 jq 바이트와 같게(compact·키 순서·끝 줄바꿈).
//   · 시간 의존: sc_now_ms(Date.now) 출력은 명세 normalize 로 N 으로 바꾼다. 경계 근처 시각은 만들지 않는다.
//   · 전역: sc_store → SC_STORED_KIND, sc_load → SC_SCREEN·SC_KIND·SC_AT·SC_FULL(실패하면 빈 값).
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ctx, cfgSub, expand, screenPromptKind } from './common.mjs';
import { statInfo } from './compat.mjs';
import * as J from './jq-json.mjs';
import { cliMain, isMain } from './js-cli.mjs';

// ---------- 읽기 ----------
export function scDir(env = process.env) {
  // bash `${DFLOW_CONSOLE_DIR:-…}` — 빈 값도 기본값으로 간다.
  const raw = env.DFLOW_CONSOLE_DIR;
  const base = (raw === '' || raw == null) ? `${env.HOME ?? ''}/.dflow/console` : raw;
  return `${expand(base, env)}/screen`;
}
export function scTtl(env = process.env, cwd = process.cwd()) {
  const c = new Ctx(env, cwd);
  const t = cfgSub(c, '.approvals.screen_cache_s');
  return /^[0-9]+$/.test(t) ? t : '20';
}
export function scKey(h) {
  h = h ?? '';
  if (h === '' || h.startsWith('.')) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(h)) return null;
  if (h.length > 100) return null;
  return h.replaceAll(':', '=');
}
export function scNowMs() { return String(Date.now()); }
export function scStat(file) { return statInfo(file); }

// ---------- 쓰기 ----------
export function scDrop(handle, env = process.env) {
  const key = scKey(handle ?? '');
  if (key == null) return 0;
  const d = scDir(env);
  for (const f of [`${d}/${key}.txt`, `${d}/${key}.json`]) {
    try { unlinkSync(f); } catch { /* 없음 */ }
  }
  return 0;
}
export function scClear(env = process.env) {
  const d = scDir(env);
  try {
    if (!statSync(d).isDirectory()) return 0;
    if (lstatSync(d).isSymbolicLink()) return 0;
  } catch { return 0; }
  let names;
  try { names = readdirSync(d); } catch { return 0; }
  for (const n of names) {
    const p = `${d}/${n}`;
    try { if (!lstatSync(p).isFile()) continue; } catch { continue; }
    try { unlinkSync(p); } catch { /* 무시 */ }
  }
  return 0;
}
/** awk 'END{print NR}' — 마지막 줄바꿈 없는 줄도 센다 */
function awkNR(buf) {
  if (buf.length === 0) return 0;
  let n = 0;
  for (const b of buf) if (b === 0x0a) n++;
  return buf[buf.length - 1] === 0x0a ? n : n + 1;
}
export function scStore(handle, scr, at, full = '', env = process.env) {
  if (scKey(handle ?? '') == null) return { rc: 1, globals: { SC_STORED_KIND: '' } };
  const key = scKey(handle);
  let stamp = at ?? '';
  if (!/^[0-9]+$/.test(stamp)) stamp = scNowMs();
  const d = scDir(env);
  try { mkdirSync(d, { recursive: true, mode: 0o700 }); } catch { return { rc: 1, globals: { SC_STORED_KIND: '' } }; }
  try {
    if (!statSync(d).isDirectory() || lstatSync(d).isSymbolicLink()) return { rc: 1, globals: { SC_STORED_KIND: '' } };
  } catch { return { rc: 1, globals: { SC_STORED_KIND: '' } }; }
  try { chmodSync(d, 0o700); } catch { /* 무시 */ }
  const pid = env.COORD_JS_CALLER_PID || String(process.pid);
  const t1 = `${d}/.${key}.txt.${pid}`, t2 = `${d}/.${key}.json.${pid}`;
  const fail = () => {
    for (const f of [t1, t2, `${d}/${key}.txt`, `${d}/${key}.json`]) {
      try { unlinkSync(f); } catch { /* 무시 */ }
    }
    return { rc: 1, globals: { SC_STORED_KIND: '' } };
  };
  let scrBuf;
  try { scrBuf = readFileSync(scr); } catch { return fail(); }
  const c = new Ctx(env, process.cwd());
  const kind = screenPromptKind(scrBuf);
  const lines = awkNR(scrBuf);
  const doc = new Map([
    ['kind', kind === '' ? null : kind],
    ['read_at_ms', Number(stamp)],
    ['lines', lines],
  ]);
  if (full !== '') doc.set('full', full);
  try {
    writeFileSync(t1, scrBuf, { mode: 0o600 });
    try { chmodSync(t1, 0o600); } catch { /* 무시 */ }
    writeFileSync(t2, J.tojson(doc) + '\n', { mode: 0o600 });
    try { chmodSync(t2, 0o600); } catch { /* 무시 */ }
    renameSync(t1, `${d}/${key}.txt`);
    renameSync(t2, `${d}/${key}.json`);
  } catch { return fail(); }
  return { rc: 0, globals: { SC_STORED_KIND: kind } };
}
export function scPrune(mins = '10', env = process.env) {
  const d = scDir(env);
  const m = (mins ?? '') === '' ? '10' : mins;
  // find -mmin "+m" 실측(BSD·GNU 동일): 나이(초 내림) > m*60 이면 삭제.
  // 초 경계 레이스가 있어 m=0+방금 파일은 양쪽이 갈릴 수 있다 — 명세에서 0은 뺀다(단위 시험이 본다).
  if (!/^-?[0-9]+$/.test(m)) return 0;
  try {
    if (!statSync(d).isDirectory()) return 0;
    if (lstatSync(d).isSymbolicLink()) return 0;
  } catch { return 0; }
  let names;
  try { names = readdirSync(d); } catch { return 0; }
  const nowSec = Math.floor(Date.now() / 1000);
  for (const n of names) {
    const p = `${d}/${n}`;
    let st;
    try { st = lstatSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    if (nowSec - Math.floor(st.mtimeMs / 1000) > Number(m) * 60) {
      try { unlinkSync(p); } catch { /* 무시 */ }
    }
  }
  return 0;
}

// ---------- 읽기 쪽 ----------
function uidOf(env) {
  // bash `me="$(id -u)"` 와 같게 외부 명령으로 읽는다(process.getuid가 아니다).
  // 시험이 `id` 함수 가짜로 소유자를 바꿀 때 그 가짜가 보여야 해서 bash 경유로 부른다(export -f 전파).
  const r = spawnSync('bash', ['-c', 'id -u'], { env, encoding: 'utf8', windowsHide: true });
  if (r.status === 0) return (r.stdout || '').trim();
  return '';
}
function isWin(env) {
  if (env.COMPAT_FORCE_OS === 'windows') return true;
  if (env.COMPAT_FORCE_OS === 'unix') return false;
  return /^(msys|cygwin|mingw)/.test(env.OSTYPE || '') || process.platform === 'win32';
}
/** 폴더·파일이 믿을 만한가. Git Bash 는 링크·종류 검사까지만. */
export function scTrusted(file, env = process.env) {
  const d = scDir(env);
  try {
    if (!statSync(d).isDirectory()) return false;
    if (lstatSync(d).isSymbolicLink()) return false;
    if (lstatSync(file).isSymbolicLink()) return false;
    if (!statSync(file).isFile()) return false;
  } catch { return false; }
  if (isWin(env)) return true;
  const me = uidOf(env);
  const dst = statInfo(d);
  if (!dst || dst.split(' ')[0] !== me) return false;
  if (dst.split(' ')[1] !== '700') return false;
  const fst = statInfo(file);
  if (!fst || fst.split(' ')[0] !== me) return false;
  if (fst.split(' ')[1] !== '600') return false;
  return true;
}
export function scSig(handle, env = process.env) {
  const key = scKey(handle ?? '');
  if (key == null) return { rc: 1 };
  const f = `${scDir(env)}/${key}.json`;
  if (!scTrusted(f, env)) return { rc: 1 };
  const st = statInfo(f);
  if (!st || Number(st.split(' ')[3]) > 4096) return { rc: 1 };
  let content;
  try { content = readFileSync(f, 'utf8'); } catch { return { rc: 1 }; }
  // `c="$(< "$f")"` — 명령 치환이 끝 줄바꿈을 모두 뗀다. 그것만 든 파일은 빈 값으로 rc 1.
  content = content.replace(/\n+$/, '');
  if (!content) return { rc: 1 };
  return { out: content };
}
function tail40(buf) {
  // 바이트 단위로 마지막 40줄. 끝 줄바꿈은 뗀다(bash `$(tail -n 40)` 과 같게).
  // 전역 변수 전송(js-cli)은 UTF-8 문자열이라 UTF-8으로 푼다 — 화면은 UTF-8 텍스트다.
  const parts = buf.toString('latin1').split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  const bytes = Buffer.from(parts.slice(-40).join('\n'), 'latin1');
  return { screen: bytes.toString('utf8'), bytes };
}
export function scLoad(handle, env = process.env, cwd = process.cwd()) {
  const noglobals = { SC_SCREEN: '', SC_KIND: '', SC_AT: '', SC_FULL: '' };
  const c = new Ctx(env, cwd);
  const ttlRaw = env.SC_TTL ?? '';
  const ttl = ttlRaw !== '' ? ttlRaw : scTtl(env, cwd);
  if (!/^[0-9]+$/.test(ttl) || Number(ttl) <= 0) return { rc: 1, globals: noglobals };
  const key = scKey(handle ?? '');
  if (key == null) return { rc: 1, globals: noglobals };
  const d = scDir(env);
  const jf = `${d}/${key}.json`, tf = `${d}/${key}.txt`;
  if (!scTrusted(jf, env) || !scTrusted(tf, env)) return { rc: 1, globals: noglobals };
  let doc;
  try { doc = J.parse(readFileSync(jf, 'utf8')); } catch { return { rc: 1, globals: noglobals }; }
  const rawAt = doc instanceof Map ? J.alt(J.index(doc, 'read_at_ms'), undefined) : undefined;
  const rawLines = doc instanceof Map ? J.alt(J.index(doc, 'lines'), undefined) : undefined;
  const at = (typeof rawAt === 'number' || rawAt instanceof J.JNum) ? String(Math.floor(J.toNumber(rawAt))) : null;
  const jl = (typeof rawLines === 'number' || rawLines instanceof J.JNum) ? String(Math.floor(J.toNumber(rawLines))) : null;
  if (at == null || !/^[0-9]+$/.test(at)) return { rc: 1, globals: noglobals };
  if (jl == null || !/^[0-9]+$/.test(jl)) return { rc: 1, globals: noglobals };
  let jk = 'null';
  try {
    if (doc instanceof Map) {
      const k = J.alt(J.index(doc, 'kind'), null);
      jk = k === null ? 'null' : typeof k === 'string' ? k : J.tojson(k);
    }
  } catch { return { rc: 1, globals: noglobals }; }
  if (!['null', 'permission', 'choice', 'question', 'usage-limit', 'trust'].includes(jk)) return { rc: 1, globals: noglobals };
  let full = '';
  try {
    if (doc instanceof Map) {
      const f = J.alt(J.index(doc, 'full'), undefined);
      if (typeof f === 'string' && /^[0-9a-f]{64}$/.test(f)) full = f;
    }
  } catch { return { rc: 1, globals: noglobals }; }
  const now = Number(scNowMs());
  if (!(Number(at) <= now + 2000) || !(now - Number(at) <= Number(ttl) * 1000)) return { rc: 1, globals: noglobals };
  let tfBuf;
  try { tfBuf = readFileSync(tf); } catch { return { rc: 1, globals: noglobals }; }
  if (tfBuf.length > 1048576) return { rc: 1, globals: noglobals };
  if (String(awkNR(tfBuf)) !== jl) return { rc: 1, globals: noglobals };
  const { screen, bytes } = tail40(tfBuf);
  const kind = screenPromptKind(Buffer.concat([bytes, Buffer.from([0x0a])]));
  if ((kind === '' ? 'null' : kind) !== jk) return { rc: 1, globals: noglobals };
  return { rc: 0, globals: { SC_SCREEN: screen, SC_KIND: kind, SC_AT: at, SC_FULL: full } };
}

// ---------- CLI ----------
export const functions = {
  sc_dir: { run: ({ env }) => ({ out: scDir(env) }) },
  sc_ttl: { run: ({ env, cwd }) => ({ out: scTtl(env, cwd) }) },
  sc_key: { run: ({ args }) => { const k = scKey(args[0] ?? ''); return k == null ? { rc: 1 } : { out: k }; } },
  sc_now_ms: { run: () => ({ out: scNowMs() }) },
  sc_stat: { run: ({ args }) => { const v = scStat(args[0] ?? ''); return v == null ? { rc: 1 } : { out: v }; } },
  sc_drop: { run: ({ args, env }) => ({ rc: scDrop(args[0] ?? '', env) }) },
  sc_clear: { run: ({ env }) => ({ rc: scClear(env) }) },
  sc_store: { run: ({ args, env }) => scStore(args[0] ?? '', args[1] ?? '', args[2] ?? '', args[3] ?? '', env) },
  sc_prune: { run: ({ args, env }) => ({ rc: scPrune(args[0] ?? '10', env) }) },
  sc_sig: { run: ({ args, env }) => scSig(args[0] ?? '', env) },
  sc_load: { run: ({ args, env, cwd }) => scLoad(args[0] ?? '', env, cwd) },
};
if (isMain(import.meta.url)) cliMain(functions);
