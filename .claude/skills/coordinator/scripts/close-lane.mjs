// close-lane.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/close-lane.sh 에 퇴역 보관).
//   사용법: close-lane.mjs <레인> | --handle <h>  [--force-report] [--dry-run]
//   끝난 레인·워커 세션의 탭을 닫고 사라졌는지 확인한다: bg 실행 확인 → 보고 확인 → 워크트리·브랜치 경고 → terminal close → 사라짐 확인(최대 15초) → 상태·이벤트.
//   stdout: `CLOSED <레인> handle=<h>` · `CLOSE_REFUSED <레인> <사유>` · `DRY CLOSED <레인> handle=<h>`.
// 옮길 때 bash 판이 기준이었다. 다른 스크립트(coord-state.mjs · office.mjs · heavy 스크립트)는 import 하지 않고 node 자식 프로세스로 부른다.
//   · 프로세스 표는 compat.mjs 의 psTable(윈도우는 /proc 스캔), 작업 폴더는 pidCwd, 터미널은 term.mjs 의 어댑터를 쓴다
//   · awk 가 줄을 다시 조립하는 규칙(필드 사이 공백 하나, 앞 칸 비움)을 그대로 따라 bg 목록 글을 만든다(stderr 에만 나가지만 맞춰 둔다)
//   · 레인 이름에 `"`·`\` 가 있으면 bash 판은 jq 컴파일 오류 → 「상태에 없는 레인」과 같게 취급(보간 `\(…)` 추적은 안 함: 의심 목록)
// node 18.17 이상, 외부 패키지 없음.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, expand, hasRun, laneGet, nowEpoch, repo, stateFile } from './lib/common.mjs';
import { pidAlive, pidCwd, psTable } from './lib/compat.mjs';
import { functions as termFns } from './lib/term.mjs';
import { coordGit, coordHeavyScript, coordStateCall, laneType, rawOut, runScriptFile, runSync, scriptsDir, stripNl } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

/** 도움말(= bash 판 머리말 2~10줄, 이름만 .mjs). */
const HELP = `# 사용법: close-lane.mjs <레인> | --handle <h>  [--force-report] [--dry-run]
#   끝난 레인·워커 세션의 탭을 닫고 사라졌는지 확인한다(설계 §3.e 정리 절차, Q7 결정).
#   Q7 순서 중 정본 메모 완료 갱신·산출물 복사는 조정자가 먼저 한다. 이 스크립트는 그 뒤의 기계적 부분:
#   bg 실행 확인 → 보고 확인 → 워크트리·브랜치 남음 경고 → orca terminal close --tab → handle·세션 파일 사라짐 확인(최대 15초)
#   → state lanes.<l>.state=closed · 이벤트.
#   거부: bg-running(세션 자손이나 레인 워크트리에서 도는 빌드·시험, heavy.sh RUN cwd 가 레인 워크트리)
#         · not-reported(last_report_at 없음, --force-report 로 통과). worktree·branch 가 남은 것은 stderr 경고만.
#   stdout: \`CLOSED <레인> handle=<h>\` 또는 \`CLOSE_REFUSED <레인> <사유>\`.
#   --dry-run: 판정은 실제로, 닫기 직전에 멈추고 \`DRY CLOSED <레인> handle=<h>\`.
`;
const HERE = dirname(fileURLToPath(import.meta.url));
const HEAVY_RE = /GradleWrapperMain|gradlew|vitest|playwright (test|show-report)|\/tsc( |$)|tsup|heavy\.sh|jest|npm (run|test|exec vite)/;
const readDocs = (file) => { try { return J.parseStreamPartial(readFileSync(file, 'utf8')).values; } catch { return []; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const underWt = (cwd, ...roots) => roots.some((w) => w !== '' && (cwd === w || cwd.startsWith(`${w}/`)));
/** awk 기본 필드 나눔(앞뒤 공백 무시) */
const fields = (line) => (line.trim() === '' ? [] : line.trim().split(/[ \t]+/));

/** (가) 세션 pid 의 자손 중 무거운 명령. awk 가 `$1=""; $2=""; c=$0` 로 만든 글 `"  " + 나머지 필드` 를 그대로 쓴다 */
export function descendantsHeavy(psAll, root) {
  const rows = psAll.split('\n').map((l) => { const f = fields(l); return { p: f[0] ?? '', pp: f[1] ?? '', c: ['', '', ...f.slice(2)].join(' ') }; });
  const keep = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows) if (keep.has(r.pp) && !keep.has(r.p)) { keep.add(r.p); changed = true; }
  }
  const out = [];
  for (const r of rows) {
    if (!keep.has(r.p) || r.p === root || r.p === '') continue;
    if (/mcp/i.test(r.c)) continue;
    if (HEAVY_RE.test(r.c)) out.push(`pid=${r.p}${r.c.slice(0, 120)}`);
  }
  return out;
}

/** (나) 레인 워크트리를 cwd 로 둔 무거운 명령. awk `{ $2 = ""; print }` 뒤 grep -E · grep -v grep · read -r hp hc */
export function heavyByCwd(c, psAll, wtCheck) {
  const out = [];
  for (const line of psAll.split('\n')) {
    const f = fields(line);
    if (f.length === 0) continue;
    const t = f.length >= 2 ? [f[0], '', ...f.slice(2)].join(' ') : f[0];
    if (!HEAVY_RE.test(t) || t.includes('grep')) continue;
    const hp = f[0];
    const hc = f.slice(2).join(' ');
    if (hp === '') continue;
    if (/mcp/i.test(hc)) continue;
    const cwd = pidCwd(hp, c.env);
    if (underWt(cwd, wtCheck)) out.push(`pid=${hp} cwd=${cwd} ${hc.slice(0, 100)}`);
  }
  return out;
}

/** main — 종료 코드. {env, cwd} 는 맥락 */
export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const out = [];
  const flush = () => {
    if (c.errs.length) process.stderr.write(c.err);
    if (out.length) process.stdout.write(`${out.join('\n')}\n`);
  };
  try {
    let lane = '', h = '', forceReport = false, dry = false;
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--handle') { h = argv[i + 1] ?? ''; i++; }
      else if (a === '--force-report') forceReport = true;
      else if (a === '--dry-run') dry = true;
      else if (a === '-h' || a === '--help') {
        process.stdout.write(HELP);
        return 0;
      } else if (a.startsWith('-')) throw new CoordDie(2, `모르는 옵션: ${a}`);
      else lane = a;
    }
    if (lane === '' && h === '') throw new CoordDie(2, '사용법: close-lane.mjs <레인> | --handle <h> [--force-report] [--dry-run]');
    if (dry) c.env.COORD_DRY = '1';
    return await body();

    async function body() {
      const run = hasRun(c);
      if (lane !== '') {
        if (!run) throw new CoordDie(3, '현재 회차가 없다');
        const typ = /["\\]/.test(lane) ? '' : laneType(readDocs(stateFile(c, '')), lane);
        if (typ !== 'object') throw new CoordDie(2, `상태에 없는 레인: ${lane}`);
        if (h === '') h = stripNl(laneGet(c, lane, '.session.handle').out ?? '');
        if (h === '') throw new CoordDie(3, `레인 ${lane} 의 handle 이 상태에 없다`);
      } else if (run) {
        let first = '';
        for (const d of readDocs(stateFile(c, ''))) {
          try {
            const ls = J.index(d, 'lanes');
            let entries;
            if (ls instanceof Map) entries = [...ls.entries()];
            else if (Array.isArray(ls)) entries = ls.map((v, i) => [String(i), v]);
            else throw new J.JqError('lanes has no keys', 5);
            for (const [k, v] of entries) if (J.index(J.index(v, 'session'), 'handle') === h) { first = k; break; }
          } catch (e) { if (!(e instanceof J.JqError)) throw e; }
          if (first !== '') break;
        }
        lane = first;
      }
      const label = lane !== '' ? lane : '-';
      let pid = '', wt = '', br = '', rep = '';
      if (lane !== '') {
        const lg = (sub) => stripNl(laneGet(c, lane, sub).out ?? '');
        pid = lg('.session.pid'); if (pid === '0') pid = '';
        wt = lg('.worktree'); br = lg('.branch'); rep = lg('.last_report_at');
      }
      const refuse = (reason, msg) => { out.push(`CLOSE_REFUSED ${label} ${reason}`); if (msg) c.log(msg); flush(); return 0; };

      // 레인 워크트리가 메인 체크아웃이면 cwd 대조를 하지 않는다
      const mainRepo = repo(c) ?? '';
      let wtCheck = '';
      if (wt !== '' && isDir(resolve(c.cwd, wt))) {
        let wtReal = '', mainReal = '';
        try { wtReal = realpathSync(resolve(c.cwd, wt)); } catch { wtReal = ''; }
        if (mainRepo !== '') { try { mainReal = realpathSync(resolve(c.cwd, mainRepo)); } catch { mainReal = ''; } }
        if (wtReal !== mainReal) wtCheck = wtReal;
      }

      // 1. 백그라운드 실행
      const bg = [];
      const psAll = psTable(c.env);
      if (pid !== '' && pidAlive(pid, c.env)) bg.push(...descendantsHeavy(psAll, pid));
      if (wtCheck !== '') {
        bg.push(...heavyByCwd(c, psAll, wtCheck));
        const hs = coordHeavyScript(c);
        if (hs.out) {
          const snap = runSync('bash', [hs.out, 'snapshot'], { env: c.env, cwd: c.cwd }).out.toString('latin1');
          for (const line of snap.split('\n')) {
            if (line === '') continue;
            const cols = line.replace(/^\t+/, '').split(/\t+/);   // IFS 탭 읽기: 연속 탭은 하나로
            if (cols[0] !== 'RUN') continue;
            const cwdc = cols[4] ?? '';
            const cmd = cols.length > 5 ? cols.slice(5).join('\t') : '';
            if (underWt(cwdc, wtCheck, wt)) bg.push(`heavy RUN cwd=${cwdc} ${cmd.slice(0, 100)}`);
          }
        }
      }
      if (bg.length > 0) {
        c.log('도는 백그라운드:');
        for (const b of bg) c.errs.push(`  ${b}\n`);
        return refuse('bg-running');
      }

      // 2. 보고
      if (lane !== '' && rep === '' && !forceReport) return refuse('not-reported', '마지막 보고(last_report_at)가 없다 — 산출물을 받았으면 --force-report');

      // 3. 워크트리·브랜치 남음(경고만)
      if (wtCheck !== '') {
        const wl = coordGit(c, ['worktree', 'list', '--porcelain']);
        if (wl.rc === 0 && wl.out.toString('latin1').split('\n').includes(`worktree ${wtCheck}`)) c.log(`경고: 워크트리가 남아 있다: ${wtCheck} (worktree-left — 레인이 정리했는지 확인)`);
      }
      if (br !== '' && br !== cfgSub(c, '.integration_branch')) {
        const bl = stripNl(coordGit(c, ['branch', '--list', br]).out.toString('utf8'));
        if (bl !== '') c.log(`경고: 브랜치가 남아 있다: ${br} (branch-left — squash 로 -d 거부면 사용자 결정 목록에)`);
      }

      // 4. 닫기
      const inList = () => {
        const r = termFns.term_list.run({ args: [], env: c.env, cwd: c.cwd });
        const text = Buffer.from(r.out ?? '').toString('latin1');
        return text.split('\n').some((l) => (l.includes('\t') ? l.slice(0, l.indexOf('\t')) : l) === h);
      };
      let goneAlready = 0;
      if (!inList()) { c.log(`터미널 목록에 이미 없다: ${h} (닫기 생략, 상태만 갱신)`); goneAlready = 1; }
      const wake = () => cfgSub(c, '.wake_targets');
      if (dry) {
        if (goneAlready === 0) c.log(`DRY orca terminal close --terminal ${h} --tab`);
        c.log(`DRY 확인: term_list 에서 ${h} 사라짐 · ${pid !== '' ? `${expand(cfgSub(c, '.sessions_dir'), c.env)}/${pid}.json 없어짐 ` : ''}(최대 15초)`);
        if (lane !== '') coordStateCall(c, ['set', `.lanes["${lane}"].state`, '"closed"']);
        if (wake() !== '') c.log(`wake_targets(${wake()}) 갱신 필요`);
        out.push(`DRY CLOSED ${label} handle=${h}`);
        flush();
        return 0;
      }
      if (goneAlready === 0) {
        const r = stripNl(Buffer.from(termFns.term_close.run({ args: [h], env: c.env, cwd: c.cwd }).out ?? '').toString('utf8'));
        if (r !== 'closed' && r !== 'stale') throw new CoordDie(4, `terminal close 실패: ${r}`);
      }
      const sf = pid !== '' ? `${expand(cfgSub(c, '.sessions_dir'), c.env)}/${pid}.json` : '';
      const nowS = () => Number(nowEpoch());
      const end = nowS() + 15;
      let ok = 0;
      while (nowS() <= end) {
        if (!inList() && (sf === '' || !existsSync(sf) || !statSync(sf).isFile())) { ok = 1; break; }
        await sleep(1000);
      }
      if (ok !== 1) c.log(`경고: 15초 안에 사라짐을 확인하지 못했다(handle 또는 ${sf}) — 다시 확인할 것`);
      if (lane !== '') {
        coordStateCall(c, ['set', `.lanes["${lane}"].state`, '"closed"']);
        coordStateCall(c, ['event', 'lane-closed', lane, J.stringify(new Map([['handle', h], ['verified', ok === 1]]), { indent: 0 })]);
        runScriptFile(join(scriptsDir(), 'office.mjs'), ['lane-down', lane], { env: c.env, cwd: c.cwd });   // 에이전트 오피스에서 내린다(실패해도 무시)
      }
      if (wake() !== '') c.log(`wake_targets(${wake()}) 갱신 필요 — 닫은 세션을 빼라`);
      out.push(`CLOSED ${label} handle=${h}`);
      flush();
      return 0;
    }
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
