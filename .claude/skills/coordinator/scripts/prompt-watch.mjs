// prompt-watch.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/prompt-watch.sh 에 퇴역 보관).
//   사용법: prompt-watch.mjs <레인> | --handle <h> | --lanes a,b,c  [--follow <초>] [--every <초>]
//   레인 터미널 화면 끝에서 확인 창·선택 창·사용 한도 창(그리고 interrupted)을 판정한다. 판정만 하고 응답하지 않는다.
// 옮길 때 bash 판이 기준이었다. 다른 스크립트는 import 하지 않는다.
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

/** 도움말(= bash 판 머리말 2~19줄, 이름만 .mjs). */
const HELP = `# 사용법: prompt-watch.mjs <레인> | --handle <h> | --lanes a,b,c  [--follow <초>] [--every <초>]
#   레인 터미널 화면 끝에서 확인 창·선택 창·사용 한도 창을 판정한다(설계 §3.l). 판정만 하고 응답하지 않는다.
#   stdout: \`NONE <h>\` 또는 \`PROMPT <h> <permission|choice|question|usage-limit>\` 다음 줄부터 \`---\` 로 감싼 화면 발췌.
#   permission 이면 명령 전문이 잘리지 않게 120줄을 다시 읽어 확인 창 시작(위쪽 가로줄)부터 낸다.
#   --follow <초>: 감지될 때까지 --every 간격으로 최대 <초> 반복(끝까지 없으면 NONE).
#   --every <초>: 읽기 간격. 기본은 설정 approvals.watch_every_s(10). 읽을 때마다 orca terminal read 가 CPU 를 쓰므로 3초보다 길게 둔다.
#   화면 캐시: 콘솔 폴러가 레인 화면을 읽으면 $DFLOW_CONSOLE_DIR/screen/ 에 남긴다. 신선한(설정 approvals.screen_cache_s, 기본 20초; 0 이면 끔)·
#     믿을 수 있는(현재 사용자 소유·권한 700/600) 캐시가 있으면 orca 를 부르지 않고 그 화면(마지막 40줄)으로 판정한다. 없거나 낡았거나 깨졌으면 조용히 직접 읽는다.
#     --follow 에서는 신선한 캐시가 있는 동안 캐시 json 의 내용(읽은 시각이 바뀐다)만 보고, 바뀐 때만 새로 판정한다(폴러가 꺼져 캐시가 낡으면 그때부터 직접 읽는다).
#     permission 의 120줄 재읽기는 늘 직접 읽는다(그 화면에 권한 창이 없으면 — 창이 사라졌다 — 이미 읽은 40줄 화면으로 발췌한다). 자동 응답(auto-answer.mjs·term-send-safe.mjs)은 이 캐시를 쓰지 않는다 — 여기서는 「창이 떴는가」 감지뿐이다.
#   --lanes a,b,c: 한 프로세스에서 레인을 차례로 본다. 줄 형식은 같고 줄 앞에 \`<레인> \` 이 붙는다(\`<레인> PROMPT <h> <kind>\`).
#     창이 새로 뜨거나 종류가 바뀐 레인마다 한 번 블록을 내고 끝나지 않고 계속 본다(창이 사라지면 그 레인은 다시 새로 뜨는 것으로 센다).
#     같은 종류의 창이 사이에 「창 없음」 표본 없이 이어져도 창 지문(full — 캐시 json 의 값, 직접 읽은 화면은 lib/console-input.sh 로 같은 방식으로 계산)이
#     바뀌면 새 창으로 다시 알린다. 상태줄 숫자만 바뀐 같은 창은 지문이 같아 다시 알리지 않는다. 지문이 없는 창(머리를 못 찾음)은 종류로만 비교한다(한계).
#     --follow 시간이 다하면 레인마다 \`<레인> NONE <h>\` 를 낸다. 핸들이 없거나 낡은 레인은 \`<레인> GONE <사유>\` 한 줄을 내고 이후 건너뛴다.
#   interrupted: 창은 아니지만 자동 거부·Esc 뒤 화면 끝에 \`Interrupted · What should Claude do instead?\` 가 남아 사람의 지시를 기다리는 상태다(\`PROMPT <h> interrupted\`). 다른 종류가 없을 때만 낸다.
set -uo pipefail
_SD="\${0%/*}"; [ "$_SD" != "$0" ] || _SD=.
`;
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
        process.stdout.write(HELP);
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
      if (lane === '') throw new CoordDie(2, '사용법: prompt-watch.mjs <레인> | --handle <h> [--follow <초>]');
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
