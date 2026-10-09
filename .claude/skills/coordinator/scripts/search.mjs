// scripts/search.sh 의 node 판(스위치 COORD_JS_SEARCH — js-bridge.sh _jsb_exec).
//   사용법: search.mjs [--tab|--print] [--cwd <폴더>] [--timeout <초>] [--worker <agy|opencode>] <질의…>
//   검색 워커(기본 agy → opencode)에 질의를 한 번 보내고 답을 파일로 남긴다. stdout 한 줄: `SEARCH ok <파일> <초> worker=<이름>` 또는 `SEARCH fail <사유> …`.
// bash 판이 정답이다. 옮기며 같게 만든 것:
//   · --print: 템플릿을 공백으로 나눈 인자 배열로 셸 없이 실행, 제한 시간이 넘으면 자기 자식 트리만 끝낸다(compat killTree)
//   · --tab: orca 로 새 탭을 만들고 줄을 보낸 뒤 답 파일(또는 opencode 의 .done)을 5초마다 기다린다(term.mjs 어댑터)
//   · 답 파일 이름 `<폴더>/<날짜-시각>-<pid>-<워커>.md` 의 pid 는 프로세스마다 달라 대조 때 지운다
//   · 이벤트 JSON 의 q 는 앞 200글자(코드포인트), 숫자는 --argjson 그대로
// 안전: 시험에서는 가짜 orca·agy·opencode 만 쓴다. 실제 검색 워커·실제 탭 생성은 부르지 않는다.
// node 18.17 이상, 외부 패키지 없음.
import { accessSync, closeSync, constants as FC, existsSync, mkdirSync, openSync, readFileSync, statSync, rmSync } from 'node:fs';
import { constants as OC } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgLoad, cfgSub, hasRun, nowEpoch, repo, runDir } from './lib/common.mjs';
import { epochFmt, killTree, whichSync } from './lib/compat.mjs';
import { functions as termFns } from './lib/term.mjs';
import { cmpInt, coordStateCall, rawOut, runSync, stripNl } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const size = (p) => { try { return statSync(p).size; } catch { return 0; } };

/** 셸 따옴표 하나로 감싼다(끝 줄바꿈은 $(…) 처럼 떨어진다) */
export function shq(s) { return `'${stripNl(s.replace(/'/g, "'\\''"))}'`; }
/** 한 줄 `command -v` 에 해당: 경로면 실행 가능한 파일, 아니면 PATH 검색 */
function haveCmd(name, env, cwd) {
  if (name === '') return false;
  if (name.includes('/')) {
    try { const p = join(cwd, name); accessSync(p, FC.X_OK); return statSync(p).isFile(); } catch { return false; }
  }
  return whichSync(name, env) !== '';
}
/** `${tmpl%% *}` — 첫 공백 앞 */
const firstWord = (t) => { const i = t.indexOf(' '); return i < 0 ? t : t.slice(0, i); };
const sliceCp = (s, n) => Array.from(s).slice(0, n).join('');

/** 템플릿 → 인자 배열(`read -r -a` 는 첫 줄만 공백·탭으로 나눈다) */
export function buildArgs(tmpl, prompt, timeout) {
  const first = tmpl.split('\n')[0];
  const parts = first.trim() === '' ? [] : first.trim().split(/[ \t]+/);
  return parts.map((p) => (p === '{prompt}' ? prompt : p.includes('{timeout}') ? p.split('{timeout}').join(timeout) : p));
}

/** `coord_cfg_json '.search.workers // empty' | jq -r '.[]?' | tr '\n' ' '` 를 낱말로 나눈 목록 */
function searchWorkers(c) {
  let text = '';
  for (const d of cfgLoad(c).docs().values) {
    try {
      const v = J.alt(J.index(J.index(d, 'search'), 'workers'), undefined);
      if (v === undefined) continue;
      const els = Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : [];
      for (const e of els) text += `${rawOut(e)}\n`;
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return text.split(/[ \t\n]+/).filter((x) => x !== '');
}

function findHandle(v) {
  if (v instanceof Map) {
    const h = v.get('handle');
    if (typeof h === 'string' && h.startsWith('term_')) return h;
    for (const x of v.values()) { const r = findHandle(x); if (r) return r; }
  } else if (Array.isArray(v)) for (const x of v) { const r = findHandle(x); if (r) return r; }
  return '';
}

/** main — 종료 코드 */
export async function main(argv, { env = process.env, cwd: cwd0 = process.cwd() } = {}) {
  const c = new Ctx({ ...env }, cwd0);
  const flush = () => { if (c.errs.length) process.stderr.write(c.err); };
  const outLine = (s) => { flush(); process.stdout.write(`${s}\n`); return 0; };
  try {
    let cwd = '', timeout = '', mode = '', only = '';
    let i = 0;
    for (; i < argv.length; i++) {
      const a = argv[i];
      const need = () => { if (i + 1 >= argv.length) { process.stderr.write(`search.sh: $2: unbound variable\n`); throw new CoordDie(1, ''); } return argv[++i]; };
      if (a === '--tab') mode = 'tab';
      else if (a === '--print') mode = 'print';
      else if (a === '--cwd') cwd = need();
      else if (a === '--timeout') timeout = need();
      else if (a === '--worker') only = need();
      else if (a === '-h' || a === '--help') {
        const ls = readFileSync(join(HERE, 'search.sh'), 'latin1').split('\n').slice(1, 15);
        process.stdout.write(Buffer.from(`${ls.join('\n')}\n`, 'latin1'));
        return 0;
      } else if (a === '--') { i++; break; } else break;
    }
    const rest = argv.slice(i);
    if (rest.length === 0) throw new CoordDie(2, '질의가 없다');
    const query = rest.join(' ');
    if (timeout === '') timeout = cfgSub(c, '.search.timeout_s');
    if (timeout === '') timeout = '240';
    if (mode === '') mode = cfgSub(c, '.search.mode');
    if (mode === '') mode = 'print';
    const run = hasRun(c);
    const dir = run ? `${runDir(c, '')}/searches` : `${c.env.TMPDIR ? c.env.TMPDIR : '/tmp'}/coord-searches`;
    try { mkdirSync(dir, { recursive: true }); } catch { /* 무시 */ }

    let workers;
    if (only !== '') workers = [only];
    else {
      workers = searchWorkers(c);
      if (workers.length === 0) workers = ['agy', 'opencode'];
    }
    const nowS = () => Number(nowEpoch());

    const runWorker = async (w) => {
      let tmpl, ttmpl;
      if (w === 'agy') { tmpl = cfgSub(c, '.search.command'); ttmpl = cfgSub(c, '.search.tab_command'); if (ttmpl === '') ttmpl = 'agy -i {prompt}'; }
      else if (w === 'opencode') {
        tmpl = cfgSub(c, '.search.opencode.command'); if (tmpl === '') tmpl = 'opencode run --standalone {prompt}';
        ttmpl = cfgSub(c, '.search.opencode.tab_command'); if (ttmpl === '') ttmpl = 'opencode run --standalone {prompt} 2>&1 | tee {out}';
      } else return { rc: 1, line: `SEARCH fail no-command 모르는 검색 워커 ${w}` };
      if (tmpl === '') return { rc: 1, line: `SEARCH fail no-command ${w} 명령 미설정` };
      const bin = firstWord(tmpl);
      if (!haveCmd(bin, c.env, c.cwd)) return { rc: 1, line: `SEARCH fail no-command ${bin} 없음` };

      const q = w === 'opencode' ? query.replace(/[!@]/g, '') : query;
      const prompt = `저장소 파일을 수정하지 말고 읽기만 하라. 답은 근거 파일 경로(줄 번호)와 함께 짧게 낸다. 질의: ${q}`;
      const start = nowS();
      const out = `${dir}/${stripNl(epochFmt(String(start), '%Y%m%d-%H%M%S', false, c.env) ?? '')}-${process.pid}-${w}.md`;
      const event = (secs, tab) => {
        if (!run) return;
        const m = new Map([['q', sliceCp(query, 200)], ['file', out], ['secs', secs]]);
        if (tab) m.set('mode', 'tab');
        m.set('worker', w);
        coordStateCall(c, ['event', 'search', '-', J.stringify(m, { indent: 0 })]);
      };

      if (mode === 'tab' && whichSync('orca', c.env) !== '') {
        const title = `search-${w}-${stripNl(epochFmt(String(nowS()), '%H%M%S', false, c.env) ?? '')}`;
        const cr = runSync('orca', ['terminal', 'create', '--worktree', 'active', '--title', title, '--json'], { env: c.env, cwd: c.cwd });
        let th = '';
        try { for (const d of J.parseStreamPartial(cr.out.toString('utf8')).values) { th = findHandle(d); if (th) break; } } catch { th = ''; }
        if (th) {
          let line, waitFor;
          const cdDir = cwd !== '' ? cwd : (repo(c) ?? '');
          if (w === 'opencode') {
            line = ttmpl.split('{prompt}').join(shq(prompt)).split('{out}').join(shq(out));
            line = `cd ${shq(cdDir)} && ( set -o pipefail; ${line} ; echo $? > ${shq(`${out}.done`)} )`;
            waitFor = `${out}.done`;
          } else {
            const tprompt = `${prompt} 답을 다 쓰면 그 내용을 파일 ${out} 에 저장하라(이 파일 하나만 만든다).`;
            line = `cd ${shq(cdDir)} && ${ttmpl.split('{prompt}').join(shq(tprompt))}`;
            waitFor = out;
          }
          termFns.term_send.run({ args: [th, line, '--enter'], env: c.env, cwd: c.cwd });
          c.log(`검색 탭 ${th}(${w})에서 진행 중(사용자가 화면에서 볼 수 있다)`);
          while (!existsSync(waitFor) && (w === 'opencode' || size(waitFor) === 0) && cmpInt(String(nowS() - start), timeout, 'lt')) await sleep(5000);
          await sleep(2000);
          termFns.term_close.run({ args: [th], env: c.env, cwd: c.cwd });
          const secs = nowS() - start;
          let doneOk = true;
          if (w === 'opencode') {
            if (!existsSync(`${out}.done`)) return { rc: 1, line: `SEARCH fail timeout ${w} 탭 검색이 ${timeout}초 안에 끝나지 않음` };
            if (readFileSync(`${out}.done`, 'latin1').replace(/[ \t\n\v\f\r]/g, '') !== '0') doneOk = false;
            try { rmSync(`${out}.done`, { force: true }); } catch { /* 무시 */ }
          }
          if (!doneOk) return { rc: 1, line: `SEARCH fail error ${w} 종료 코드가 0 이 아님` };
          if (size(out) > 0) { event(secs, true); return { rc: 0, line: `SEARCH ok ${out} ${secs} worker=${w}` }; }
          return { rc: 1, line: `SEARCH fail timeout ${w} 탭 검색이 ${timeout}초 안에 답 파일을 쓰지 않음` };
        }
        c.log(`검색 탭을 띄우지 못해 ${w} 를 --print 로 진행`);
      }

      // 화면 없는 단발 실행
      const args = buildArgs(tmpl, prompt, timeout);
      const fo = openSync(out, 'w'), fe = openSync(`${out}.err`, 'w');
      let exited = false, code = null, sig = null, spawnErr = null;
      let child;
      try {
        let runCwd = c.cwd;
        if (cwd !== '') { if (isDir(join(c.cwd, cwd))) runCwd = join(c.cwd, cwd); else c.log(`bash: cd: ${cwd}: No such file or directory`); }
        child = spawn(args[0] ?? '', args.slice(1), { cwd: runCwd, env: c.env, stdio: ['ignore', fo, fe], windowsHide: true });
        child.on('error', (e) => { spawnErr = e; exited = true; });
        child.on('close', (cd, sg) => { exited = true; code = cd; sig = sg; });
      } finally { closeSync(fo); closeSync(fe); }
      while (!exited && cmpInt(String(nowS() - start), timeout, 'lt')) await sleep(100);
      if (!exited) {
        killTree(String(child.pid), c.env);
        for (let t = 0; t < 50 && !exited; t++) await sleep(100);
        return { rc: 1, line: `SEARCH fail timeout ${w} ${timeout}초 안에 끝나지 않음` };
      }
      let rc = code ?? (sig ? 128 + (OC.signals[sig] ?? 0) : 1);
      if (spawnErr) rc = 127;
      const secs = nowS() - start;
      if (rc !== 0) {
        const reason = cmpInt(String(secs), timeout, 'ge') ? 'timeout' : 'error';
        let last = '';
        try { const t = readFileSync(`${out}.err`, 'latin1'); const ls = t.split('\n'); if (ls[ls.length - 1] === '') ls.pop(); last = ls.length ? ls[ls.length - 1] : ''; } catch { last = ''; }
        const utf8 = /utf-?8/i.test(c.env.LC_ALL || c.env.LC_CTYPE || c.env.LANG || '');
        const lb = Buffer.from(last, 'latin1');
        const cut = utf8 ? Buffer.from(sliceCp(lb.toString('utf8'), 120), 'utf8') : lb.subarray(0, 120);
        return { rc: 1, line: `SEARCH fail ${reason} ${w} rc=${rc} ${cut.toString('utf8')}` };
      }
      try { rmSync(`${out}.err`, { force: true }); } catch { /* 무시 */ }
      if (size(out) === 0) return { rc: 1, line: `SEARCH fail empty ${w} 답 없음` };
      event(secs, false);
      return { rc: 0, line: `SEARCH ok ${out} ${secs} worker=${w}` };
    };

    let last = '';
    for (const w of workers) {
      const r = await runWorker(w);
      last = r.line;
      if (r.rc === 0) return outLine(r.line);
      c.log(`검색 워커 ${w} 실패: ${r.line}`);
    }
    return outLine(last !== '' ? last : 'SEARCH fail no-command 검색 워커 없음');
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { if (e.message) process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
