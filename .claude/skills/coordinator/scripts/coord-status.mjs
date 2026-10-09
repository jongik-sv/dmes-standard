// coord-status.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/coord-status.sh 에 퇴역 보관).
//   사용법: coord-status.mjs [--json]   읽기 전용. LANE · PC · UNLINKED · WINDOW 줄(또는 --json 의 객체 배열)을 낸다.
// 옮길 때 bash 판이 기준이었다. 다른 스크립트(ctx-usage.mjs · usage-band.mjs · heavy 스크립트)는 import 하지 않고 node 자식 프로세스로 부른다.
//   · jq 식은 같은 뜻으로 옮겼다(`// empty`, `tostring`, `tonumber? // .` — 입력 글 그대로의 숫자 꼴 보존). --json 은 jq-json.stringify 로 `jq -s .` 와 같은 바이트
//   · swap_mb: macOS `sysctl -n vm.swapusage`, 없으면 /proc/meminfo, 둘 다 없으면 `-` (윈도우 Git Bash 는 `-`)
//   · awk 계산(per_core · swap · 비교)은 awk 규칙대로(%d 는 0 쪽 버림, 문자열이면 문자열 비교)
// node 18.17 이상, 외부 패키지 없음.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, expand, functions as commonFns, hasRun, isoToEpoch, laneGet, nowEpoch, repo, sessionFile, stateFile, wtAbs } from './lib/common.mjs';
import { isWin, normPath, pidAlive } from './lib/compat.mjs';
import { arithVal, awkAtof, awkInt, awkNum, coordBgSignals, coordCpus, coordDefaultRepo, coordGit, coordHeavyScript, coordLoad1, fmtFixed, rawOut, runScriptFile, runSync, stripNl } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

/** 도움말(= bash 판 머리말 2~13줄, 이름만 .mjs). */
const HELP = `# 사용법: coord-status.mjs [--json]   (정본: ../references/contract.md §3.3, 설계 §3.c)
# 읽기 전용. 토큰을 쓰지 않고 한 화면짜리 상태표를 모은다. stdout(줄 형식은 계약 그대로):
#   LANE <레인> name=<세션> status=<busy|idle|gone> for=<분>m report=<HH:MM|-> commit=<HH:MM|-> ahead=<n|-> bg=<콤마목록|-> ctx=<n|->% hold=<사유|->
#   PC load1=<f> cpus=<n> per_core=<f> heavy=<held>/<waiting>/<K> swap_mb=<n|-> five=<n|-> week=<n|-> band=<띠>
#   UNLINKED <이름> pid=<pid> cwd=<경로>        cwd 가 이 리포(메인·워크트리)인 살아 있는 interactive 세션 중 레인·조정자가 아닌 것
#   WINDOW <kind> lane=<레인|-> until=<iso>
# --json 은 같은 정보를 객체 배열로 낸다(각 객체에 "type": lane|pc|unlinked|window).
# 세부: status·for 는 <sessions_dir>/<pid>.json 의 status·statusUpdatedAt(ms), pid 가 죽었거나 파일이 없으면 gone(for 는 알면 그 값, 모르면 -).
#   bg 는 lib coord_bg_signals(heavy RUN cwd·tasks 출력 mtime·워크트리 cwd 의 빌드·시험 프로세스). ctx 는 ctx-usage.mjs --lane.
#   heavy.script 가 없으면 heavy=-/-/-, 레인의 heavy 신호는 보지 않는다. 세션 이름의 공백은 _ 로 바꾼다.
#   closed 레인은 내지 않는다.
set -uo pipefail
`;
const HERE = dirname(fileURLToPath(import.meta.url));
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const readDocs = (file) => { const t = readText(file); return t === null ? [] : J.parseStreamPartial(t).values; };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const dash = (s) => (s !== undefined && s !== null && s !== '' && s !== 'null' ? s : '-');
const under = (s) => s.replace(/[ \t]/g, '_');

/** 입력 글 그대로의 숫자 꼴을 지키는 `def n: if . == "-" then null else (tonumber? // .) end` */
export function numOrStr(s) {
  if (s === '-') return null;
  const t = s.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
  if (/^[+-]?nan$/i.test(t)) return null;
  const inf = /^([+-]?)(?:inf|infinity)$/i.exec(t);   // jq 는 inf 를 double 최댓값으로 읽는다
  if (inf) return new J.JNum(`${inf[1] === '-' ? '-' : ''}1.7976931348623157E+308`);
  const m = /^([+-]?)(\d*\.?\d*)([eE][+-]?\d+)?$/.exec(t);
  if (m && /\d/.test(m[2])) {
    let ip = m[2];
    if (ip.startsWith('.')) ip = `0${ip}`;
    if (ip.endsWith('.')) ip = ip.slice(0, -1);
    return new J.JNum(`${m[1] === '-' ? '-' : ''}${ip}${m[3] ?? ''}`);
  }
  return s;
}
const strOrNull = (s) => (s === '-' ? null : s);
const hm = (c, e) => { const r = commonFns.coord_epoch_to_hm.run({ args: [e], env: c.env, cwd: c.cwd }); return { rc: r.rc ?? 0, out: stripNl(r.out ?? '') }; };
const hmOfIso = (c, iso) => {
  const e = stripNl(isoToEpoch(c, iso ?? ''));
  if (e === '') return '-';
  const r = hm(c, e);
  return r.rc === 0 ? r.out : '-';
};

/** main — 종료 코드. {env, cwd, now} 는 맥락 */
export async function main(argv, { env = process.env, cwd = process.cwd(), now } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const out = [];
  const flush = () => {
    if (c.errs.length) process.stderr.write(c.err);
    if (out.length) process.stdout.write(Buffer.from(out.join(''), 'utf8'));
  };
  try {
    coordDefaultRepo(c);
    const a0 = argv[0] ?? '';
    let JSONM = false;
    if (a0 === '--json') JSONM = true;
    else if (a0 === '-h' || a0 === '--help') {
      process.stderr.write(HELP);
      return 0;
    } else if (a0 !== '') throw new CoordDie(2, '사용법: coord-status.mjs [--json]');
    if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다(coord-state.mjs init 먼저)');
    const SF = stateFile(c, '');
    const REPO = repo(c) ?? '';
    const NOW = now ?? Number(nowEpoch());
    const docs = readDocs(SF);
    const raw1 = (fn) => { let o = ''; for (const d of docs) { try { const v = J.alt(fn(d), undefined); if (v !== undefined) o += `${rawOut(v)}\n`; } catch (e) { if (!(e instanceof J.JqError)) throw e; } } return stripNl(o); };
    const P = (d, ...ks) => { let v = d; for (const k of ks) v = J.index(v, k); return v; };
    let IB = raw1((d) => P(d, 'run', 'integration_branch'));
    if (IB === '') IB = cfgSub(c, '.integration_branch');

    let SNAP = '', HEAVY_ON = false;
    const hs = coordHeavyScript(c);
    if (hs.out) { HEAVY_ON = true; SNAP = stripNl(runSync('bash', [hs.out, 'snapshot'], { env: c.env, cwd: c.cwd }).out.toString('utf8')); }

    const items = [];   // --json 객체들(Map)
    const line = (s) => out.push(`${s}\n`);

    // ---------- 레인 ----------
    const laneKeys = [];
    for (const d of docs) {
      try {
        const ls = J.index(d, 'lanes');
        let ents;
        if (ls instanceof Map) ents = [...ls.entries()];
        else if (Array.isArray(ls)) ents = ls.map((v, i) => [String(i), v]);
        else throw new J.JqError('lanes has no keys', 5);
        for (const [k, v] of ents) if (J.alt(J.index(v, 'state'), 'active') !== 'closed') laneKeys.push(k);
      } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    }
    for (const L of laneKeys.join('\n').split(/[ \t\n]+/).filter((s) => s !== '')) {
      let row = [];
      for (const d of docs) {
        try {
          const x = P(d, 'lanes', L);
          const g = (v, dflt) => J.tostring(J.alt(v, dflt));
          row = [g(P(x, 'session', 'name'), ''), g(P(x, 'session', 'session_id'), ''), g(P(x, 'session', 'pid'), 0), g(P(x, 'worktree'), ''), g(P(x, 'branch'), ''), g(P(x, 'last_report_at'), ''), g(P(x, 'hold', 'reason'), '')];
          break;
        } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      const parts = row.join('\u001f').split('\n')[0].split('\u001f');
      while (parts.length < 7) parts.push('');
      let [name, sid, pid, wt, branch, rep, hold] = parts;
      const sfile = sessionFile(c, pid, sid) ?? '';
      let status = 'gone', upd = '';
      if (sfile !== '') {
        const sd = readDocs(sfile);
        const sraw = (fn) => { let o = ''; for (const d of sd) { try { const v = J.alt(fn(d), undefined); if (v !== undefined) o += `${rawOut(v)}\n`; } catch (e) { if (!(e instanceof J.JqError)) throw e; } } return stripNl(o); };
        const spid = sraw((d) => J.index(d, 'pid'));
        const s = sraw((d) => J.index(d, 'status'));
        for (const d of sd) {
          try {
            const v = J.alt(J.alt(J.index(d, 'statusUpdatedAt'), J.index(d, 'updatedAt')), undefined);
            if (v === undefined) continue;
            if (!(typeof v === 'number' || v instanceof J.JNum)) throw new J.JqError('cannot be divided', 5);
            upd += `${J.numberText(Math.floor(Number(v) / 1000))}\n`;
          } catch (e) { if (!(e instanceof J.JqError)) throw e; }
        }
        upd = stripNl(upd);
        if (name === '') name = sraw((d) => J.index(d, 'name'));
        if (sid === '') sid = sraw((d) => J.index(d, 'sessionId'));
        if (pidAlive(spid, c.env)) status = s === 'idle' ? 'idle' : 'busy';
      }
      let forM;
      if (upd !== '') {
        let v = (BigInt(NOW) - arithVal(upd)) / 60n;
        if (v < 0n) v = 0n;
        forM = String(v);
      } else forM = '-';
      name = under(dash(name));
      const report = hmOfIso(c, rep);
      let commit = '-', ahead = '-';
      if (branch !== '') {
        const ct = stripNl(coordGit(c, ['-C', REPO, 'log', '-1', '--format=%ct', branch, '--']).out.toString('utf8'));
        if (ct !== '') commit = hm(c, ct).out;
        const ar = coordGit(c, ['-C', REPO, 'rev-list', '--count', `${IB}..${branch}`]);
        const a = stripNl(ar.out.toString('utf8'));
        if (ar.rc === 0 && a !== '') ahead = a;
      }
      const wta = wtAbs(c, wt);
      const bg = dash(stripNl(coordBgSignals(c, wta, sid, SNAP).out));
      let ctx = '-';
      if (sid !== '') {
        const co = stripNl(runScriptFile(join(HERE, 'ctx-usage.mjs'), ['--lane', L], { env: c.env, cwd: c.cwd }).out.toString('utf8'));
        if (co.includes(' pct=')) ctx = co.split('\n').map((l) => { const m = /^.* pct=([0-9]*).*$/.exec(l); return m ? m[1] : l; }).join('\n');
      }
      hold = under(dash(hold));
      if (JSONM) {
        items.push(new Map([['type', 'lane'], ['lane', L], ['name', strOrNull(name)], ['session_id', sid === '' ? null : sid], ['status', status],
          ['for_min', numOrStr(forM)], ['report', strOrNull(report)], ['commit', strOrNull(commit)], ['ahead', numOrStr(ahead)],
          ['bg', bg === '-' ? [] : bg.split(',')], ['ctx_pct', numOrStr(ctx)], ['hold', strOrNull(hold)]]));
      } else line(`LANE ${L} name=${name} status=${status} for=${forM}m report=${report} commit=${commit} ahead=${ahead} bg=${bg} ctx=${ctx}% hold=${hold}`);
    }

    // ---------- PC ----------
    let load1 = stripNl(Buffer.from(coordLoad1(c).out ?? '').toString('latin1'));
    const cpus = stripNl(Buffer.from(coordCpus(c).out ?? '').toString('latin1'));
    let perCore;
    if (load1 !== '') {
      const pos = awkNum(cpus) !== null ? awkNum(cpus) > 0 : Buffer.compare(Buffer.from(cpus), Buffer.from('0')) > 0;
      if (!pos) perCore = fmtFixed(0, 2);
      else if (awkAtof(cpus) === 0) perCore = '';   // awk: division by zero → 출력 없음
      else {
        const q = awkAtof(load1) / awkAtof(cpus);
        perCore = Number.isNaN(q) ? 'nan' : q === Infinity ? 'inf' : q === -Infinity ? '-inf' : fmtFixed(q, 2);   // awk printf %.2f 는 nan·inf 를 글로 낸다
      }
    } else { load1 = '-'; perCore = '-'; }
    let heavy = '-/-/-';
    if (HEAVY_ON) {
      for (const l of `${SNAP}\n`.split('\n').slice(0, -1)) {
        const f = l.split('\t');
        if (f[0] === 'PC') { const pcl = `${f[2] ?? ''}/${f[3] ?? ''}/${f[1] ?? ''}`; if (pcl !== '') heavy = pcl; break; }
      }
    }
    let swap = '-';
    const sr = runSync('sysctl', ['-n', 'vm.swapusage'], { env: c.env, cwd: c.cwd });
    const su = stripNl(sr.out.toString('utf8'));
    if (sr.rc === 0 && su !== '') {
      const m = /^.*used = *([0-9.]*)([MG]).*$/.exec(su.split('\n').find((l) => /used = *[0-9.]*[MG]/.test(l)) ?? '');
      swap = m ? awkInt(m[2] === 'G' ? awkAtof(m[1]) * 1024 : awkAtof(m[1])) : '';
    } else if (existsSync('/proc/meminfo')) {
      let t = '', f = '';
      for (const l of readFileSync('/proc/meminfo', 'latin1').split('\n')) {
        const w = l.trim().split(/\s+/);
        if (/^SwapTotal:/.test(l)) t = w[1] ?? '';
        if (/^SwapFree:/.test(l)) f = w[1] ?? '';
      }
      swap = t !== '' ? awkInt((awkAtof(t) - awkAtof(f)) / 1024) : '';
    }
    swap = dash(swap);
    const ub = stripNl(runScriptFile(join(HERE, 'usage-band.mjs'), [], { env: c.env, cwd: c.cwd }).out.toString('utf8'));
    let band = ub.split('\n').map((l) => l.trim().split(/\s+/)[1] ?? '').join('\n');
    if (band === '') band = 'UNKNOWN';
    const grab = (name) => { const o = []; for (const l of ub.split('\n')) { const m = new RegExp(`^.* ${name}=([^ ]*).*$`).exec(l); if (m) o.push(m[1]); } return dash(o.join('\n')); };
    const five = grab('five'), week = grab('week');
    if (JSONM) {
      const hv = heavy.split('/');
      items.push(new Map([['type', 'pc'], ['load1', numOrStr(load1)], ['cpus', numOrStr(cpus)], ['per_core', numOrStr(perCore)],
        ['heavy', new Map([['held', numOrStr(hv[0] ?? '-')], ['waiting', numOrStr(hv[1] ?? '-')], ['slots', numOrStr(hv[2] ?? '-')]])],
        ['swap_mb', numOrStr(swap)], ['five', numOrStr(five)], ['week', numOrStr(week)], ['band', band]]));
    } else line(`PC load1=${load1} cpus=${cpus} per_core=${perCore} heavy=${heavy} swap_mb=${swap} five=${five} week=${week} band=${band}`);

    // ---------- UNLINKED ----------
    const wl = coordGit(c, ['-C', REPO, 'worktree', 'list', '--porcelain']);
    let wts = wl.out.toString('latin1').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
    if (wts.length === 0 || wts.join('') === '') wts = [REPO];
    const win = isWin(c.env);
    if (win) wts = wts.filter((w) => w !== '').map((w) => normPath(w.replace(/\/$/, ''), c.env));
    let known = '';
    for (const d of docs) {
      try {
        const lanes = P(d, 'lanes');
        const els = [P(d, 'run', 'coordinator')];
        const lv = lanes instanceof Map ? [...lanes.values()] : Array.isArray(lanes) ? lanes : (() => { throw new J.JqError('Cannot iterate', 5); })();
        for (const x of lv) els.push(J.index(x, 'session'));
        const toks = [];
        for (const e of els) {
          if (e === null) continue;
          toks.push(rawOut(J.alt(J.index(e, 'session_id'), '')));
          toks.push(J.tostring(J.alt(J.index(e, 'pid'), 0)));
        }
        for (const t of toks) if (t !== '' && t !== '0') known += `${t}\n`;
      } catch (e) { if (!(e instanceof J.JqError)) throw e; known = ''; }
    }
    const knownSet = new Set(known.split('\n').filter((l) => l !== ''));
    const sdir = expand(cfgSub(c, '.sessions_dir'), c.env);
    let names = [];
    try { names = readdirSync(sdir).filter((n) => !n.startsWith('.') && n.endsWith('.json')).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))); } catch { names = []; }
    for (const n of names) {
      const f = `${sdir}/${n}`;
      if (!isFile(f)) continue;
      let rowS = '';
      for (const d of readDocs(f)) {
        try {
          if (J.index(d, 'kind') !== 'interactive') continue;
          const g = (k, dflt) => J.tostring(J.alt(J.index(d, k), dflt));
          rowS += `${[g('pid', 0), g('sessionId', ''), g('cwd', ''), g('name', '')].join('\u001f')}\n`;
        } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      rowS = stripNl(rowS);
      if (rowS === '') continue;
      const p4 = rowS.split('\n')[0].split('\u001f');
      while (p4.length < 4) p4.push('');
      let [upid, usid, ucwd, uname] = p4;
      if (!pidAlive(upid, c.env)) continue;
      let ucwdN = ucwd.replace(/\/$/, '');
      if (win) ucwdN = normPath(ucwdN, c.env);
      let inrepo = false;
      for (let w of wts) {
        if (w === '') continue;
        w = w.replace(/\/$/, '');
        if (`${ucwdN}/`.startsWith(`${w}/`)) { inrepo = true; break; }
      }
      if (!inrepo) continue;
      if (knownSet.has(upid) || knownSet.has(usid !== '' ? usid : '@none@')) continue;
      uname = under(dash(uname));
      if (JSONM) {
        const pn = numOrStr(upid);
        if (!(pn instanceof J.JNum)) continue;   // tonumber 오류: jq 가 빈 줄을 내고 `jq -s .` 가 건너뛴다
        items.push(new Map([['type', 'unlinked'], ['name', uname], ['pid', pn], ['session_id', usid], ['cwd', ucwd]]));
      } else line(`UNLINKED ${uname} pid=${upid} cwd=${ucwd}`);
    }

    // ---------- WINDOW ----------
    const wrows = [];
    for (const d of docs) {
      try {
        const w = J.index(d, 'windows');
        const els = Array.isArray(w) ? w : w instanceof Map ? [...w.values()] : [];
        for (const e of els) wrows.push([J.tostring(J.alt(J.index(e, 'kind'), '-')), J.tostring(J.alt(J.index(e, 'lane'), '-')), J.tostring(J.alt(J.index(e, 'until'), '-'))].join('\u001f'));
      } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    }
    for (const r of wrows.join('\n').split('\n')) {
      const p3 = r.split('\u001f');
      while (p3.length < 3) p3.push('');
      const [wk, wlane, wu] = p3;
      if (wk === '') continue;
      if (JSONM) items.push(new Map([['type', 'window'], ['kind', wk], ['lane', wlane === '-' ? null : wlane], ['until', wu === '-' ? null : wu]]));
      else line(`WINDOW ${wk} lane=${wlane} until=${wu}`);
    }

    if (JSONM) out.push(`${J.stringify(items, { indent: 2 })}\n`);
    flush();
    return 0;
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
