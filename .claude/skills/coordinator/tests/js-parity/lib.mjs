// bash 판과 mjs 판의 함수를 같은 입력으로 돌려 stdout 바이트·종료 코드(·남긴 파일)가 같은지 대조하는 하니스의 몸체.
// 사용법·명세 형식은 README.md. node 18.17 이상, 외부 패키지 없음.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, lstatSync, readFileSync, readlinkSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COORD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');   // .claude/skills/coordinator
const IS_WIN = process.platform === 'win32';

// ---------- 시드 고정 난수 ----------
// 사례 i 의 난수는 (시드, i) 만으로 정해진다 — 병렬 실행·재실행(--index)에서도 같은 사례가 나온다.
export function makeRng(seed, index = 0) {
  let x = (createHash('sha1').update(`${seed}:${index}`).digest().readUInt32LE(0) >>> 0) || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  return {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),            // a..b 포함
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

// ---------- 한 번 실행 ----------
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function snapshot(root) {
  // 파일 상태 지문: 상대 경로 → {종류, 권한(윈도우 제외), 크기, sha1}. 시계(mtime)는 넣지 않는다.
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name), rel = relative(root, p).split(sep).join('/');
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out[rel] = { type: 'link', to: readlinkSync(p) };
      else if (st.isDirectory()) { out[rel] = { type: 'dir', mode: IS_WIN ? 0 : st.mode & 0o777 }; walk(p); }
      else out[rel] = { type: 'file', mode: IS_WIN ? 0 : st.mode & 0o777, size: st.size, sha: createHash('sha1').update(readFileSync(p)).digest('hex') };
    }
  };
  walk(root);
  return out;
}

const prefixed = (pre, m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [`${pre}/${k}`, v]));
const parseGlobals = (buf, names) => {
  const m = Object.fromEntries(names.map((n) => [n, '']));
  for (const kv of buf.toString('utf8').split('\0')) { const i = kv.indexOf('='); if (i > 0 && kv.slice(0, i) in m) m[kv.slice(0, i)] = kv.slice(i + 1); }
  return m;
};

function run(cmd, args, { cwd, env, stdin, timeoutMs }) {
  return new Promise((res) => {
    const c = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const so = [], se = [];
    let done = false, timedOut = false;
    const t = setTimeout(() => { timedOut = true; c.kill('SIGKILL'); }, timeoutMs);
    c.stdout.on('data', (d) => so.push(d));
    c.stderr.on('data', (d) => se.push(d));
    c.stdin.on('error', () => {});
    c.on('error', (e) => { if (done) return; done = true; clearTimeout(t); res({ rc: -1, out: Buffer.alloc(0), err: Buffer.from(String(e)), timedOut }); });
    c.on('close', (rc, sig) => { if (done) return; done = true; clearTimeout(t); res({ rc: rc === null ? 128 + (sig === 'SIGKILL' ? 9 : 15) : rc, out: Buffer.concat(so), err: Buffer.concat(se), timedOut }); });
    c.stdin.end(stdin);
  });
}

/** 한 사례를 한쪽(sh|js)에서 돌려 {rc, out, err, files} 를 돌려준다. 사례마다 새 임시 폴더(HOME·작업 폴더·TMPDIR)에서 돈다. */
export async function runSide(spec, fnName, fnSpec, c, side, opts = {}) {
  const base = mkdtempSync(join(tmpdir(), `jsparity-${side}-`));
  const work = join(base, 'work'), home = join(base, 'home'), tmp = join(base, 'tmp');
  for (const d of [work, home, tmp]) mkdirSync(d, { recursive: true });
  try {
    // 사례가 준 파일을 작업 폴더에 둔다(상대 경로; {data, mode} 도 가능). 홈 아래는 'home/…' 로 쓴다.
    for (const [rel, v] of Object.entries(c.files || {})) {
      const p = rel.startsWith('home/') ? join(home, rel.slice(5)) : join(work, rel);
      mkdirSync(dirname(p), { recursive: true });
      const data = v && typeof v === 'object' && !Buffer.isBuffer(v) ? v.data : v;
      writeFileSync(p, data);
      if (v && typeof v === 'object' && !Buffer.isBuffer(v) && v.mode != null && !IS_WIN) chmodSync(p, v.mode);
    }
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TZ: 'UTC', ...(spec.env || {}), ...(fnSpec.env || {}), ...(c.env || {}) };
    delete env.ORCA_TAB_ID;
    // 자리표시자: 환경 변수·인자 안의 <WORK>(작업 폴더)·<HOME>(홈)·<TMP> 를 이 사례의 실제 경로로 바꾼다(예: PATH 앞에 <WORK>/bin 을 두어 가짜 orca 를 쓴다)
    const sub = (v) => (typeof v === 'string' ? v.split('<WORK>').join(work).split('<HOME>').join(home).split('<TMP>').join(tmp) : v);
    for (const k of Object.keys(env)) env[k] = sub(env[k]);
    const subArgs = (a) => a.map(sub);
    if (spec.switchEnv) env[spec.switchEnv] = '0';   // bash 쪽이 정답이므로 스위치는 항상 끈다(node 판은 CLI 로 직접 부른다)
    let r;
    const gnames = fnSpec.globals || [];
    const gfile = join(tmp, 'globals.bin');
    if (side === 'sh' || side === 'swon') {
      // sh: 스위치 꺼짐(bash 본문이 정답). swon: 스위치 켜짐(bash 함수가 js-bridge 로 node 판을 부른다 — 「스위치 끔·켬 동일」 대조)
      if (side === 'swon') env[spec.switchEnv] = '1';
      const pre = (spec.source || []).map((p) => `. ${shq(join(COORD_ROOT, p))}`).join('\n');
      const dump = gnames.length ? `for n in ${gnames.join(' ')}; do printf '%s=%s\\0' "$n" "\${!n}"; done > ${shq(gfile)}` : ':';
      const args = subArgs(fnSpec.shArgs ? fnSpec.shArgs(c) : c.args || []);
      // spec.kind === 'script' 이면 sh 는 source 하지 않고 스크립트를 그대로 실행한다(bash <sh> 인자…). 이때 mjs 도 같은 인자로 직접 실행한다.
      const script = `${pre}\n. ${shq(join(COORD_ROOT, spec.sh))}\nfn=$1; shift\n"$fn" "$@"\nrc=$?\n${dump}\nexit $rc`;
      r = spec.kind === 'script'
        ? await run('bash', [join(COORD_ROOT, spec.sh), ...args], { cwd: work, env, stdin: c.stdin ?? '', timeoutMs: opts.timeoutMs || 30000 })
        : await run('bash', ['-c', script, '_', fnName, ...args], { cwd: work, env, stdin: c.stdin ?? '', timeoutMs: opts.timeoutMs || 30000 });
    } else {
      const args = subArgs(fnSpec.jsArgs ? fnSpec.jsArgs(c) : spec.kind === 'script' ? (fnSpec.shArgs ? fnSpec.shArgs(c) : c.args || []) : [...(fnSpec.js || []), ...(c.args || [])]);
      r = await run(process.execPath, [join(COORD_ROOT, spec.mjs), ...args], { cwd: work, env: { ...env, COORD_JS_GLOBALS_FILE: gfile }, stdin: c.stdin ?? '', timeoutMs: opts.timeoutMs || 30000 });
    }
    let globals = '';
    if (gnames.length) { try { globals = JSON.stringify(parseGlobals(readFileSync(gfile), gnames)); } catch { globals = JSON.stringify(parseGlobals(Buffer.alloc(0), gnames)); } }
    const files = fnSpec.compareFiles === false ? {} : { ...prefixed('work', snapshot(work)), ...prefixed('home', snapshot(home)) };
    // 임시 폴더 이름이 출력에 새어 들어가는 경우를 위해 base 경로를 고정 문자열로 바꿔 비교한다
    const norm = (b) => Buffer.from(b.toString('latin1').split(base).join('<BASE>'), 'latin1');
    let out = norm(r.out);
    if (spec.normalize) out = spec.normalize(out, side, c);
    if (fnSpec.normalize) out = fnSpec.normalize(out, side, c);
    return { rc: r.rc, out, err: norm(r.err), files, globals, timedOut: r.timedOut };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const eqFiles = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** sh·js 를 모두 돌려 차이 설명(없으면 null)을 돌려준다. */
export async function compareCase(spec, fnName, fnSpec, c, opts = {}) {
  const [s, j] = await Promise.all([runSide(spec, fnName, fnSpec, c, 'sh', opts), runSide(spec, fnName, fnSpec, c, opts.viaSwitch ? 'swon' : 'js', opts)]);
  const why = [];
  if (s.timedOut || j.timedOut) why.push(`시간 초과 sh=${s.timedOut} js=${j.timedOut}`);
  if (s.rc !== j.rc) why.push(`종료 코드 sh=${s.rc} js=${j.rc}`);
  if (Buffer.compare(s.out, j.out) !== 0) why.push('stdout 바이트 다름');
  if (opts.compareStderr && Buffer.compare(s.err, j.err) !== 0) why.push('stderr 다름');
  if (!eqFiles(s.files, j.files)) why.push('남긴 파일 다름');
  if (s.globals !== j.globals) why.push('전역 변수 다름');
  if (!why.length) return null;
  return { why, sh: s, js: j };
}

const preview = (b, n = 240) => JSON.stringify(b.toString('latin1').slice(0, n)) + (b.length > n ? `…(${b.length}바이트)` : '');

export function describeDiff(fnName, index, c, d) {
  const lines = [`✖ ${fnName} #${index}: ${d.why.join(' · ')}`];
  lines.push(`  args  ${JSON.stringify(c.args || [])}`);
  lines.push(`  stdin ${preview(Buffer.from(c.stdin ?? ''))}`);
  lines.push(`  sh  rc=${d.sh.rc} out=${preview(d.sh.out)}`);
  lines.push(`  js  rc=${d.js.rc} out=${preview(d.js.out)}`);
  if (!eqFiles(d.sh.files, d.js.files)) {
    const keys = [...new Set([...Object.keys(d.sh.files), ...Object.keys(d.js.files)])].sort();
    for (const k of keys) if (JSON.stringify(d.sh.files[k]) !== JSON.stringify(d.js.files[k])) lines.push(`  파일 ${k}: sh=${JSON.stringify(d.sh.files[k])} js=${JSON.stringify(d.js.files[k])}`);
  }
  if (d.sh.globals !== d.js.globals) { lines.push(`  전역 sh=${d.sh.globals}`); lines.push(`  전역 js=${d.js.globals}`); }
  if (d.js.err.length && d.js.rc !== 0) lines.push(`  js stderr ${preview(d.js.err, 200)}`);
  return lines.join('\n');
}

export async function loadSpec(moduleName) {
  const p = join(COORD_ROOT, 'tests', 'js-parity', 'specs', `${moduleName}.mjs`);
  return (await import(pathToFileURL(p).href)).default;
}

async function pool(n, jobs, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: jobs }, async () => { for (;;) { const i = next++; if (i >= n) return; await fn(i); } }));
}

/**
 * 한 모듈의 함수들을 대조한다. 반환 {total, diffs:[설명], perFn:{이름:{cases, diffs}}}.
 * opts: functions(배열, 기본 전부), cases(함수당 사례 수), seed, jobs, index(그 사례 하나만), maxReport, compareStderr,
 *       viaSwitch(true 면 js 쪽을 CLI 가 아니라 「스위치 켠 bash 함수」로 돌려 스위치 끔·켬을 대조)
 */
export async function runParity(spec, opts = {}) {
  const seed = opts.seed ?? 20261009, cases = opts.cases ?? 200, jobs = opts.jobs ?? 6, maxReport = opts.maxReport ?? 5;
  const names = opts.functions && opts.functions.length ? opts.functions : Object.keys(spec.functions);
  const report = { total: 0, diffs: [], perFn: {} };
  for (const name of names) {
    const fnSpec = spec.functions[name];
    if (!fnSpec) throw new Error(`명세에 함수가 없다: ${spec.module}.${name} (있는 함수: ${Object.keys(spec.functions).join(', ')})`);
    const n = opts.index != null ? 1 : cases;
    const stat = { cases: n, diffs: 0 };
    report.perFn[name] = stat;
    await pool(n, jobs, async (k) => {
      const i = opts.index != null ? opts.index : k;
      const rng = makeRng(`${seed}:${spec.module}:${name}`, i);
      const c = await fnSpec.gen(rng, i);
      const d = await compareCase(spec, name, fnSpec, c, opts);
      report.total++;
      if (d) { stat.diffs++; if (report.diffs.length < maxReport) report.diffs.push(describeDiff(name, i, c, d) + `\n  재현: node tests/js-parity/run.mjs ${spec.module} ${name} --seed ${seed} --index ${i}${opts.viaSwitch ? ' --switch' : ''}`); }
    });
  }
  return report;
}
