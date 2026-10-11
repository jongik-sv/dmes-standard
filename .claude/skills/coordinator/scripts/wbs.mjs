#!/usr/bin/env node
// wbs.mjs — 회차 WBS(<회차 폴더>/WBS.md) 생성·열기. 정본: ../references/contract.md §3.3·§2.1(.wbs)
// 사용법: node wbs.mjs [--open] [--print] [--quiet] [--ahead] [-h]
//   state.json 의 레인·항목·.wbs(조정자 단계·이슈)와 브랜치 커밋 수로 WBS.md 를 만들고 한 줄 `WBS <pct>% <경로>` 를 낸다.
//   --open   OS 기본 앱으로 WBS.md 를 연다(설정 wbs.auto_open=false 면 열지 않음). 연 시각을 .wbs.opened_at 에 기록
//   --print  WBS.md 본문을 한 줄 뒤에 그대로 낸다
//   --quiet  stdout 에 아무것도 내지 않는다(init·틱·마감이 안에서 부를 때)
//   --ahead  한 줄 뒤에 전체 진도 줄·레인별 진행 한 줄·`## 앞으로` 절(남은 항목·머지·마감 단계·사용자 결정)을 낸다(「진행 상황·앞으로 할 것」 답)
//   항목이 0개인 레인 = <회차>/lanes/<레인>/brief.md 「## 할 일」 로 추정(표시함). 한 줄 끝 ` (…)` = 추정·미등록이 있을 때만 붙는 덧말
// 회차 = COORD_RUN → <state_dir>/current (coord-state.mjs 와 같다). 내용이 시각 줄만 다르면 파일을 다시 쓰지 않는다.
// 설정: wbs.auto_open(기본 true) · wbs.metrics_cmd(문자열 또는 argv 배열 — stdout 마크다운을 `## 지표` 아래에 붙임, 실패해도 치명 아님)
// 환경: COORD_WBS_OPENER=<명령 …> 가 있으면 OS 기본 앱 대신 그 명령에 경로를 붙여 실행(`none` = 아무것도 안 함. 시험·특수 PC용)
//       COORD_WBS_AUTO=0 이면 init·틱·마감·항목 완료가 WBS 를 자동으로 만들지 않는다(수동 호출은 그대로)
// node 18.17 이상, 외부 패키지 없음. 윈도우: cmd /c start, 경로는 node:path.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { CoordDie, Ctx, cfgJson, cfgSub, hasRun, nowIso, repo, runDir } from './lib/common.mjs';
import { coordDefaultRepo, coordStateCall, runSync } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { laneView, renderAhead } from './lib/wbs-ahead.mjs';

const HELP = `# 사용법: wbs.mjs [--open] [--print] [--quiet] [--ahead]
#   <회차 폴더>/WBS.md 를 만들고 \`WBS <pct>% <경로>\` 한 줄을 낸다. 정본: ../references/contract.md §3.3
#   --open   OS 기본 앱으로 연다(darwin open · win32 cmd /c start · linux xdg-open). 설정 wbs.auto_open=false 면 열지 않는다
#   --print  본문도 낸다   --quiet  아무것도 내지 않는다
#   --ahead  진도 줄·레인별 한 줄·\`## 앞으로\`(남은 항목·머지·마감 단계·사용자 결정)를 낸다
`;

const DEFAULT_GROUP = '레인';
const KIND_LABEL = { claude: 'Claude', glm: 'GLM', opencode: 'opencode', agy: 'agy', worker: 'worker' };
const bar = (p) => { const n = Math.max(0, Math.min(10, Math.round(p / 10))); return '█'.repeat(n) + '░'.repeat(10 - n); };
const weightOf = (it) => (typeof it?.weight === 'number' && Number.isFinite(it.weight) ? it.weight : 1);
/** 항목 목록 → {d, t, p} (coord-state progress 와 같은 가중치·내림) */
export function tally(items) {
  const list = Array.isArray(items) ? items : [];
  let t = 0, d = 0;
  for (const it of list) { const w = weightOf(it); t += w; if (it?.done === true) d += w; }
  return { d, t, p: t > 0 ? Math.floor((d * 100) / t) : 0 };
}
const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 레인 실행 주체 글: lane.runner 가 있으면 그것, 없으면 세션 kind·model·effort */
export function runnerOf(lane) {
  if (typeof lane?.runner === 'string' && lane.runner !== '') return lane.runner;
  const s = isObj(lane?.session) ? lane.session : {};
  if (!s.kind) return '-';
  let r = KIND_LABEL[s.kind] ?? String(s.kind);
  if (s.model) r += ` ${s.model}`;
  if (s.effort) r += `·${s.effort}`;
  return r;
}

/**
 * state(JSON 객체) → WBS 글.
 * info = {now: 'YYYY-MM-DD HH:MM', commits(branch) → 수|null, branchState(branch) → {gone, merged}, metrics: string|null,
 *         ahead?: {files: {<레인>: {brief, reports, memo}}, events: [{kind, data}], runFiles: {runReport, metrics}}}
 * 항목이 0개인 레인은 brief.md 「할 일」 로 추정한 항목을 보여 주고(표시함), 전체 줄에 등록 기준·추정 포함 진도를 나눠 적는다.
 * 반환 {text, pct(등록 항목 기준 — coord-state progress 와 같은 셈), estPct(추정 포함), est(추정 항목 수), unknown(항목·brief 없는 레인 수), ahead(`## 앞으로` 글), summary(레인별 한 줄)}
 */
export function renderWbs(st, info) {
  const run = isObj(st?.run) ? st.run : {};
  const lanes = isObj(st?.lanes) ? st.lanes : {};
  const wbs = isObj(st?.wbs) ? st.wbs : {};
  const phases = Array.isArray(wbs.phases) ? wbs.phases : [];
  const issues = Array.isArray(wbs.issues) ? wbs.issues : [];
  const ah = isObj(info?.ahead) ? info.ahead : {};
  const afiles = isObj(ah.files) ? ah.files : {};
  const mergedLanes = new Set((Array.isArray(st?.merge?.history) ? st.merge.history : []).map((h) => h?.lane).filter(Boolean));

  const groups = new Map();
  const views = new Map();
  for (const [name, lane] of Object.entries(lanes)) {
    const g = typeof lane?.group === 'string' && lane.group !== '' ? lane.group : DEFAULT_GROUP;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([name, lane]);
    views.set(name, laneView(lane, isObj(afiles[name]) ? afiles[name] : {}, mergedLanes.has(name)));
  }
  let regT = 0, regD = 0, estT = 0, estD = 0;
  const estLanes = [], noneLanes = [], summary = [];

  const body = [];
  for (const [g, list] of groups) {
    const gi = list.flatMap(([n]) => views.get(n).items);
    const gt = tally(gi);
    body.push(`## ${g} — ${gt.t > 0 ? `${gt.p}%` : '-'}`, '', '| lane | runner | progress | commits | state | items |', '|---|---|---|---|---|---|');
    for (const [name, lane] of list) {
      const v = views.get(name);
      const x = tally(v.items);
      if (v.mode === 'brief') { estT += x.t; estD += x.d; estLanes.push(name); } else { regT += x.t; regD += x.d; }
      if (v.mode === 'none') noneLanes.push(name);
      const br = typeof lane?.branch === 'string' ? lane.branch : '';
      const bs = br !== '' ? info.branchState(br) : { gone: false, merged: false };
      const done = v.mode === 'items' && v.items.every((i) => i.done);
      const state = done && br !== '' && (bs.gone || bs.merged) ? 'merged' : (lane?.state ?? '-');
      const cm = br !== '' ? info.commits(br) : null;
      const its = v.items.map((i) => `${i.done ? '☑' : '☐'} ${cell(i.id)}.${cell(i.title)}`);
      if (v.mode === 'brief') its.unshift('(brief 추정)');
      const prog = v.mode === 'items' ? `${bar(x.p)} ${x.p}%` : v.mode === 'brief' ? `추정 ${bar(x.p)} ${x.p}%` : '항목 미등록';
      body.push(`| ${cell(name)} | ${cell(runnerOf(lane))} | ${prog} | ${cm === null ? '-' : cm} | ${cell(state)} | ${its.join('<br>')} |`);
      summary.push(`- ${name}: ${v.mode === 'none' ? '항목 미등록' : `${v.mode === 'brief' ? '추정 ' : ''}${x.p}% (끝난 항목 ${v.items.filter((i) => i.done).length}/${v.items.length})`} · ${state}`);
    }
    body.push('');
  }
  for (const ph of phases) {
    const items = Array.isArray(ph?.items) ? ph.items : [];
    const x = tally(items);
    regT += x.t; regD += x.d;
    body.push(`## ${cell(ph?.name)} — ${x.p}%`, '', ...items.map((i) => `- ${i?.done === true ? '☑' : '☐'} ${cell(i?.title)}${i?.note ? ` — ${cell(i.note)}` : ''}`), '');
  }
  const all = regT > 0 ? Math.floor((regD * 100) / regT) : 0;
  const allE = regT + estT > 0 ? Math.floor(((regD + estD) * 100) / (regT + estT)) : 0;
  let head = regT > 0
    ? `**전체 ${bar(all)} ${all}%** (가중치 S=1·M=2·L=3 또는 항목 weight, 완료 ${regD}/${regT})`
    : `**전체 ${bar(0)} -** (등록 항목 0개 — 진도 계산 불가)`;
  if (estLanes.length) head += ` · 추정 포함 ${allE}% (brief 추정 가중치 ${estD}/${estT} — 항목 미등록 레인 ${estLanes.join(', ')})`;
  if (noneLanes.length) head += ` · 항목·brief 모두 없음: ${noneLanes.join(', ')}`;
  const ahead = renderAhead(st, views, ah);
  const out = [
    `# WBS — ${run.id ?? ''}`, '',
    `- 목표: ${run.goal ? cell(run.goal) : '-'}`,
    `- 갱신: ${info.now}`, '',
    head, '',
    ...body,
  ];
  if (issues.length) out.push('## 이슈·결정', '', ...issues.map((s) => `- ${cell(s)}`), '');
  out.push(...ahead);
  if (info.metrics) out.push('## 지표', '', info.metrics.replace(/\s+$/, ''), '');
  return {
    text: `${out.join('\n').replace(/\n+$/, '')}\n`, pct: all, reg: regT, estPct: allE, est: estLanes.length, unknown: noneLanes.length,
    ahead: `${ahead.join('\n').replace(/\n+$/, '')}\n`, summary: summary.join('\n'), head,
  };
}

/** 공백으로 가르되 따옴표('…'·"…") 안은 한 칸. 셸 없이 실행할 argv 를 만든다 */
export function splitArgv(s) {
  const out = []; let cur = '', q = '', has = false;
  for (const ch of String(s)) {
    if (q) { if (ch === q) q = ''; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (has || cur !== '') { out.push(cur); cur = ''; has = false; } }
    else cur += ch;
  }
  if (has || cur !== '') out.push(cur);
  return out;
}

/** wbs.metrics_cmd 실행 → 마크다운 글 또는 한 줄 알림. 설정 없음 = null */
function metricsOf(c, cwd) {
  let spec = null;
  try { const r = cfgJson(c, '.wbs.metrics_cmd'); spec = JSON.parse(String(r.out).trim() || 'null'); } catch { spec = null; }
  const argv = Array.isArray(spec) ? spec.map(String) : typeof spec === 'string' ? splitArgv(spec) : [];
  if (argv.length === 0 || argv[0] === '') return null;
  const cmd = argv[0] === 'node' ? process.execPath : argv[0];
  try {
    const r = spawnSync(cmd, argv.slice(1), { cwd, env: c.env, encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 1 << 24 });
    if (r.error) return `> 지표 명령 실행 실패: ${r.error.code ?? r.error.message}`;
    if (r.status !== 0) return `> 지표 명령 실패: 종료 코드 ${r.status ?? r.signal}`;
    return r.stdout.trim() === '' ? '> 지표 명령 출력 없음' : r.stdout;
  } catch (e) { return `> 지표 명령 실패: ${e?.message ?? e}`; }
}

/** 열기: 설정·환경으로 막지 않았을 때만. 분리 실행·오류 무시. 실제로 열었으면 true */
export function openFile(c, file) {
  let auto = true;
  try { const v = JSON.parse(String(cfgJson(c, '.wbs.auto_open').out).trim() || 'null'); if (v === false || v === 'false' || v === 0) auto = false; } catch { /* 기본 true */ }
  if (!auto) return false;
  const custom = c.env.COORD_WBS_OPENER;
  let cmd, args;
  if (custom !== undefined && custom !== '') {
    if (custom === 'none') return false;
    const a = splitArgv(custom);
    cmd = a[0] === 'node' ? process.execPath : a[0]; args = [...a.slice(1), file];
  } else if (process.platform === 'darwin') { cmd = 'open'; args = [file]; }
  else if (process.platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '', file]; }
  else { cmd = 'xdg-open'; args = [file]; }
  try {
    const ch = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, env: c.env });
    ch.on('error', () => { /* 열기 실패는 무시 */ });
    ch.unref();
    return true;
  } catch { return false; }
}

function readText(f) { try { return readFileSync(f, 'utf8'); } catch { return null; } }

/** 「앞으로」 입력: 레인별 brief·reports·memo 글, 마감 판정용 이벤트(window-close·close-step), 마감 산출물 유무 */
function aheadInfo(dir, st) {
  const files = {};
  for (const [name, lane] of Object.entries(isObj(st?.lanes) ? st.lanes : {})) {
    const ld = path.join(dir, 'lanes', name);
    const memoPath = typeof lane?.memo === 'string' && lane.memo !== '' ? lane.memo : path.join(ld, 'memo.md');
    files[name] = { brief: readText(path.join(ld, 'brief.md')), reports: readText(path.join(ld, 'reports.md')), memo: readText(memoPath) };
  }
  const events = [];
  for (const ln of (readText(path.join(dir, 'events.jsonl')) ?? '').split('\n')) {
    if (!ln.includes('"close-step"') && !ln.includes('"window-close"')) continue;
    try { const e = JSON.parse(ln); if (e?.kind === 'close-step' || e?.kind === 'window-close') events.push({ kind: e.kind, data: e.data }); } catch { /* 깨진 줄 무시 */ }
  }
  return { files, events, runFiles: { runReport: existsSync(path.join(dir, 'run-report.md')), metrics: existsSync(path.join(dir, 'metrics.md')) } };
}
const stampRe = /^- 갱신: .*$/m;

export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  const c = new Ctx({ ...env }, cwd);
  let open = false, print = false, quiet = false, aheadOut = false;
  for (const a of argv) {
    if (a === '--open') open = true;
    else if (a === '--print') print = true;
    else if (a === '--quiet') quiet = true;
    else if (a === '--ahead') aheadOut = true;
    else if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    else { process.stderr.write(`사용법: wbs.mjs [--open] [--print] [--quiet] [--ahead]\n`); return 2; }
  }
  try {
    coordDefaultRepo(c);
    if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다');
    const dir = runDir(c);
    let st;
    try { st = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')); }
    catch (e) { throw new CoordDie(3, `state.json 을 읽지 못했다: ${e.message}`); }

    const root = repo(c) || cwd;
    const git = cfgSub(c, '.git_bin') || 'git';
    const integ = (isObj(st.run) && st.run.integration_branch) || cfgSub(c, '.integration_branch') || 'dev';
    const g = (...a) => runSync(git, ['-C', root, ...a], { env: c.env, cwd: root });
    const info = {
      now: nowIso(c).slice(0, 16).replace('T', ' '),
      commits: (br) => { const r = g('rev-list', '--count', `${integ}..${br}`); const n = Number(r.out.toString('utf8').trim()); return r.rc === 0 && Number.isInteger(n) ? n : null; },
      branchState: (br) => ({
        gone: g('rev-parse', '--verify', '-q', br).rc !== 0,
        merged: g('branch', '--merged', integ, '--list', br).out.toString('utf8').trim() !== '',
      }),
      metrics: metricsOf(c, root),
      ahead: aheadInfo(dir, st),
    };
    const r = renderWbs(st, info);
    const { text, pct } = r;
    const file = path.join(dir, 'WBS.md');
    const prev = readText(file);
    const same = prev !== null && prev.replace(stampRe, '') === text.replace(stampRe, '');
    if (!same) {
      const tmp = `${file}.tmp.${process.pid}`;
      try { writeFileSync(tmp, text); renameSync(tmp, file); }
      catch (e) { try { rmSync(tmp, { force: true }); } catch { /* 없음 */ } throw new CoordDie(4, `WBS.md 쓰기 실패: ${e.message}`); }
    }
    if (open && openFile(c, file)) coordStateCall(c, ['set', '.wbs.opened_at', JSON.stringify(nowIso(c))]);
    if (!quiet) {
      const note = [r.reg === 0 && Object.keys(st.lanes ?? {}).length > 0 ? '등록 항목 0개' : '', r.est ? `추정 포함 ${r.estPct}%` : '', r.unknown ? `항목 미등록 레인 ${r.unknown}개` : ''].filter(Boolean).join(' · ');
      process.stdout.write(`WBS ${pct}% ${file}${note ? ` (${note})` : ''}\n${print ? text : ''}${aheadOut ? `\n${r.head}\n\n## 진행\n\n${r.summary || '- 레인 없음'}\n\n${r.ahead}` : ''}`);
    }
    if (c.errs.length) process.stderr.write(c.errs.join(''));
    return 0;
  } catch (e) {
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}

if (isMain(import.meta.url)) scriptMain(main);
