// scripts/prompt-watch.sh 의 node 판(스위치 COORD_JS_PROMPT_WATCH — js-bridge.sh _jsb_exec).
//   사용법: prompt-watch.mjs <레인> | --handle <h> | --lanes a,b,c  [--follow <초>] [--every <초>]
//   레인 터미널 화면 끝에서 확인 창·선택 창·사용 한도 창(그리고 interrupted)을 판정한다. 판정만 하고 응답하지 않는다.
// bash 판이 정답이다. 다른 스크립트는 import 하지 않는다.
//   · 화면 캐시(lib/screen-cache.mjs scSig·scLoad), 창 지문(lib/console-input.mjs fullSha), 터미널(lib/term.mjs)은 import 한다(W1-a 이식분).
//   · 화면은 latin1 글(바이트 그대로)로 다루고 출력도 latin1 바이트로 낸다. awk 두 개(발췌)는 같은 규칙으로 옮겼다.
//   · 시계·환경·cwd 는 main 인자(now 는 시험용으로 고정할 수 있다).
// node 18.17 이상, 외부 패키지 없음.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoordDie, Ctx, cfgSub, hasRun, laneGet, nowEpoch, screenPromptKind } from './lib/common.mjs';
import { fullSha } from './lib/console-input.mjs';
import { scLoad, scNowMs, scSig, scTtl } from './lib/screen-cache.mjs';
import { functions as termFns } from './lib/term.mjs';
import { stripNl } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lat = (s) => Buffer.from(s, 'utf8').toString('latin1');
const BOX = lat('─');
const ARC = lat('╭');
const INTERRUPTED = lat('Interrupted · What should Claude do instead?');
const ARC_LINE = new RegExp(`^[ \\t\\n\\v\\f\\r]*${ARC}`);
const ws = /^[ \t\n\v\f\r]*$/;

/** 마지막 30줄에 「Interrupted · What should Claude do instead?」 가 있으면 interrupted */
export function interruptedKind(screen) {
  const lines = `${screen}\n`.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-30).some((l) => l.includes(INTERRUPTED)) ? 'interrupted' : '';
}

/** 화면 발췌(latin1 글 → latin1 글). permission 이면 질문 줄 위쪽 마지막 가로줄부터, 앞뒤 빈 줄은 걷어 낸다. */
export function excerpt(kind, screen) {
  let lines = `${screen}\n`.split('\n');
  lines.pop();
  if (kind === 'permission') {
    let q = 0;
    lines.forEach((l, i) => { if (/Do you want to proceed\?|will automatically deny this request/.test(l)) q = i + 1; });
    let s = 1;
    if (q) {
      for (let i = q; i >= 1; i--) {
        const l = lines[i - 1];
        const n = l.split(BOX).length - 1;
        const rest = l.split(BOX).join('');
        if ((n >= 10 && ws.test(rest)) || ARC_LINE.test(l)) { s = i; break; }
      }
    }
    lines = lines.slice(s - 1);
  }
  let start = lines.findIndex((l) => /[^ \t\n]/.test(l));
  if (start < 0) return '';
  const buf = lines.slice(start);
  let n = buf.length;
  while (n > 0 && ws.test(buf[n - 1])) n--;
  return buf.slice(0, n).map((l) => `${l}\n`).join('');
}

/** main — 종료 코드. */
export async function main(argv, { env = process.env, cwd = process.cwd(), now } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const out = (s) => process.stdout.write(s);                                   // 레인·핸들·안내 글(UTF-8)
  const outBytes = (...parts) => process.stdout.write(Buffer.concat(parts));
  const flushErr = () => { if (c.errs.length) { process.stderr.write(c.err); c.errs.length = 0; } };
  const clock = () => (now ?? (() => Number(nowEpoch())))();
  try {
    let lane = '', h = '', follow = '0', every = '', lanes = '';
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      const val = (d = '') => (i + 1 < argv.length ? argv[++i] : d);   // 값이 빠지면 bash `${2:-}` 처럼 빈 값(set -u 로 죽지 않는다)
      if (a === '--handle') h = val();
      else if (a === '--follow') { const v = val('0'); follow = v === '' ? '0' : v; }
      else if (a === '--every') every = val();
      else if (a === '--lanes') lanes = val();
      else if (a === '-h' || a === '--help') {
        const ls = readFileSync(join(HERE, 'prompt-watch.sh'), 'latin1').split('\n').slice(1, 19);
        process.stdout.write(Buffer.from(`${ls.join('\n')}\n`, 'latin1'));
        return 0;
      } else if (a.startsWith('-')) throw new CoordDie(2, `모르는 옵션: ${a}`);
      else lane = a;
    }
    if (follow === '' || /[^0-9]/.test(follow)) throw new CoordDie(2, '--follow 는 초(정수)');
    if (every === '') every = cfgSub(c, '.approvals.watch_every_s');
    if (every === '' || /[^0-9]/.test(every) || every === '0') every = '10';
    if (lanes !== '') {
      if (h !== '' || lane !== '') throw new CoordDie(2, '--lanes 는 <레인>·--handle 과 함께 쓰지 않는다');
      if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다');
    } else if (h === '') {
      if (lane === '') throw new CoordDie(2, '사용법: prompt-watch.sh <레인> | --handle <h> [--follow <초>]');
      if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다');
      h = stripNl(laneGet(c, lane, '.session.handle').out ?? '');
      if (h === '') throw new CoordDie(3, `레인 ${lane} 의 handle 이 상태에 없다`);
    }

    const ttl = scTtl(c.env, c.cwd);
    c.env.SC_TTL = ttl;
    const SC_TTL = Number(ttl);
    const readScreen = (hh, n) => {
      const r = termFns.term_read_screen.run({ args: [hh, String(n)], env: c.env, cwd: c.cwd });
      return { rc: r.rc ?? 0, screen: stripNl(Buffer.from(r.out ?? '').toString('latin1')) };
    };
    const pwFull = (screen) => {
      const r = fullSha(Buffer.from(`${screen}\n`, 'latin1'), c.env);
      return r.rc === 0 ? stripNl(r.out ?? '') : '';
    };

    /** check_once — {rc, kind, full}. st(상태): {csig, cat, prev, prevf}. 반환 rc: 0 알림, 1 창 없음, 2 읽기 실패(MULTI), 3 이미 알린 상태 그대로 */
    const checkOnce = (hh, pfx, st, multi) => {
      let sig = '', cached = false, screen, full = '';
      if (SC_TTL > 0) {
        const sg = scSig(hh, c.env);
        sig = sg.rc ? '' : stripNl(sg.out ?? '');
        if (sig !== '' && sig === st.csig && Number(scNowMs()) - st.cat <= SC_TTL * 1000) return { rc: 3, kind: '', full: '' };
      }
      st.csig = '';
      let sl = null;
      if (sig !== '') { sl = scLoad(hh, c.env, c.cwd); if (sl.rc !== 0) sl = null; }
      if (sl) {
        screen = Buffer.from(sl.globals.SC_SCREEN, 'utf8').toString('latin1');
        st.csig = sig; st.cat = Number(sl.globals.SC_AT); cached = true; full = sl.globals.SC_FULL;
      } else {
        const r = readScreen(hh, 40);
        if (r.rc !== 0) {
          if (multi) return { rc: 2, kind: '', full: '' };
          throw new CoordDie(4, r.rc === 3 ? `터미널 handle 이 낡았다(stale): ${hh}` : `화면 읽기 실패: ${hh}`);
        }
        screen = r.screen;
      }
      let kind = screenPromptKind(Buffer.from(`${screen}\n`, 'latin1'));
      if (kind === '') kind = interruptedKind(screen);
      if (kind === '') return { rc: 1, kind: '', full: '' };
      if (multi) {
        if (!cached) full = pwFull(screen);
        if (kind === st.prev && (full === '' || st.prevf === '' || full === st.prevf)) return { rc: 3, kind, full };
      }
      if (kind === 'permission') {
        const m = readScreen(hh, 120);
        if (m.rc === 0 && m.screen !== '') {
          const mk = screenPromptKind(Buffer.from(`${m.screen}\n`, 'latin1'));
          if (mk === 'permission') screen = m.screen;
        }
      }
      outBytes(Buffer.from(`${pfx}PROMPT ${hh} ${kind}\n---\n`, 'utf8'), Buffer.from(excerpt(kind, screen), 'latin1'), Buffer.from('---\n'));
      return { rc: 0, kind, full };
    };

    const end = clock() + Number(follow);
    if (lanes !== '') {
      const names = [], hs = [], seen = [], seenf = [], dead = [], st = [];
      for (const l of lanes.split('\n')[0].split(',')) {
        if (l === '') continue;
        const hh = stripNl(laneGet(c, l, '.session.handle').out ?? '');
        names.push(l); hs.push(hh); seen.push(''); seenf.push(''); dead.push(false); st.push({ csig: '', cat: 0, prev: '', prevf: '' });
        if (hh === '') { out(`${l} GONE handle 이 상태에 없다\n`); dead[names.length - 1] = true; }
      }
      if (names.length === 0) throw new CoordDie(2, '--lanes 에 레인이 없다');
      for (;;) {
        for (let i = 0; i < names.length; i++) {
          if (dead[i]) continue;
          st[i].prev = seen[i]; st[i].prevf = seenf[i];
          const r = checkOnce(hs[i], `${names[i]} `, st[i], true);
          if (r.rc === 0) { seen[i] = r.kind; seenf[i] = r.full; }
          else if (r.rc === 1) { seen[i] = ''; seenf[i] = ''; }
          else if (r.rc === 3) { if (r.full !== '') seenf[i] = r.full; }
          else { out(`${names[i]} GONE 화면 읽기 실패(낡은 handle)\n`); dead[i] = true; }
        }
        if (!(clock() < end)) break;
        await sleep(Number(every) * 1000);
      }
      for (let i = 0; i < names.length; i++) if (!dead[i]) out(`${names[i]} NONE ${hs[i]}\n`);
      flushErr();
      return 0;
    }
    const st = { csig: '', cat: 0, prev: '', prevf: '' };
    for (;;) {
      const r = checkOnce(h, '', st, false);
      if (r.rc === 0) { flushErr(); return 0; }
      if (!(clock() < end)) break;
      await sleep(Number(every) * 1000);
    }
    out(`NONE ${h}\n`);
    flushErr();
    return 0;
  } catch (e) {
    flushErr();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
