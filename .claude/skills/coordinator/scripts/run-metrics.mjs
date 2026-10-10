// run-metrics.mjs — 조정자 스크립트(node). 회차 하나의 Claude 비용·속도·풀·결정 지표를 잰다(설계 2026-10-10 §7).
//   사용법: run-metrics.mjs [--run <id>] [--stdout] [--no-csv] [--since <iso>] [--until <iso>] [--dry-run]
//   입력: state(조정·레인 세션 ID, 레인 브랜치, decisions), ~/.claude/projects 세션 로그, git 머지, <회차>/pool/log.jsonl
//   stdout: `METRICS <run> cost=<$> per1k=<$|-> coord=<%> lines=<n> file=<metrics.md|->`
//   파일: <회차>/metrics.md, <state_dir>/<metrics.csv> 에 한 줄(헤더는 새 파일일 때만)
// node 18.17 이상, 외부 패키지 없음.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CoordDie, Ctx, cfgAll, cfgSub, expand, runDir, stateFile, stateRoot } from './lib/common.mjs';
import { runSync } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { activeHours, cacheWriteCostOf, costOf, findSessionFiles, inWindow, median, parseToolResults, parseUsageLines } from './lib/session-log.mjs';

const HELP = `# 사용법: run-metrics.mjs [--run <id>] [--stdout] [--no-csv] [--since <iso>] [--until <iso>] [--dry-run]
#   회차의 Claude 비용(API 단가 환산)·활동 시간·변경 줄·풀·결정 지표를 잰다. 단가·제외 패턴 = 설정 metrics.*
#   --stdout: metrics.md 내용을 stdout 에 쓰고 파일은 만들지 않음 · --no-csv: 누적 CSV 에 쓰지 않음
#   stdout 끝 줄: METRICS <run> cost=<$> per1k=<$|-> coord=<%> lines=<n> file=<경로|->
`;

export const CSV_HEADER = 'run,mode,created_at,closed_at,cost,cost_coord,cost_lanes,cost_sub,cost_wf,active_h,session_h,lines,per1k,coord_share,coord_ctx_median,wf_runs,wf_agents_median,wf_opus_share,wf_cw_share,pool_total,pool_fallback,pool_lines,pool_findings,decisions,decisions_esc,decisions_rev,tool_retry';

/** 순수 계산. input = {projectsDir, prices, gapMin, sinceMs, untilMs, sessions:[{sid,role,lane?}], git, pool, decisions, run} */
export function collectMetrics(input) {
  const { projectsDir, prices, gapMin, sinceMs, untilMs, sessions, git, pool, decisions, run } = input;
  const seen = new Set();
  const m = {
    run: run.id, mode: run.mode || '', createdAt: run.created_at || '', closedAt: run.closed_at || '',
    cost: 0, costCoord: 0, costLanes: 0, costSub: 0, costWf: 0, wfCw: 0,
    activeHours: 0, sessionHours: 0, coordCtxMedian: 0,
    wfRuns: 0, wfAgentsMedian: 0, wfOpusShare: 0, wfCwShare: 0,
    lines: git.lines, merges: git.merges, files: git.files, per1k: null, coordShare: 0,
    poolTotal: pool.length, poolFallback: pool.filter((p) => p.fallback).length,
    poolLines: pool.reduce((s, p) => s + (Number(p.lines) || 0), 0),
    poolFindings: pool.reduce((s, p) => s + (Number(p.findings) || 0), 0),
    poolByKind: {},
    decisions: decisions.length, decisionsEsc: decisions.filter((d) => d.esc).length, decisionsRev: decisions.filter((d) => d.reverse).length,
    toolTotal: 0, toolErrors: 0, toolRetry: 0,
  };
  for (const p of pool) m.poolByKind[p.kind] = (m.poolByKind[p.kind] || 0) + 1;
  const allTs = [];
  const coordCtx = [];
  const wfAgents = new Map();
  let wfCalls = 0;
  let wfOpus = 0;
  for (const s of sessions) {
    const f = findSessionFiles(projectsDir, s.sid);
    const mine = [];
    for (const [kind, list] of [['main', f.main], ['sub', f.sub], ['wf', f.wf]]) {
      for (const path of list) {
        const text = readFileSync(path, 'utf8');
        const tr = parseToolResults(text);
        m.toolTotal += tr.total; m.toolErrors += tr.errors;
        for (const r of parseUsageLines(text, seen)) {
          if (!inWindow(r.ts, sinceMs, untilMs)) continue;
          const v = costOf(r, prices);
          m.cost += v; allTs.push(r.ts); mine.push(r.ts);
          if (kind === 'main') {
            if (s.role === 'coord') { m.costCoord += v; coordCtx.push(r.inp + r.cc + r.cr); } else m.costLanes += v;
          } else if (kind === 'sub') m.costSub += v;
          else {
            m.costWf += v; m.wfCw += cacheWriteCostOf(r, prices); wfCalls += 1;
            if (r.model.includes('opus')) wfOpus += 1;
            const wf = basename(dirname(path));
            if (!wfAgents.has(wf)) wfAgents.set(wf, new Set());
            wfAgents.get(wf).add(path);
          }
        }
      }
    }
    m.sessionHours += activeHours(mine, gapMin);
  }
  m.activeHours = activeHours(allTs, gapMin);
  m.coordCtxMedian = median(coordCtx);
  m.wfRuns = wfAgents.size;
  m.wfAgentsMedian = median([...wfAgents.values()].map((x) => x.size));
  m.wfOpusShare = wfCalls ? (wfOpus / wfCalls) * 100 : 0;
  m.wfCwShare = m.costWf ? (m.wfCw / m.costWf) * 100 : 0;
  m.coordShare = m.cost ? (m.costCoord / m.cost) * 100 : 0;
  m.per1k = m.lines > 0 ? (m.cost / m.lines) * 1000 : null;
  m.toolRetry = m.toolTotal ? (m.toolErrors / m.toolTotal) * 100 : 0;
  return m;
}

const f2 = (n) => n.toFixed(2);
const f1 = (n) => n.toFixed(1);
const f0 = (n) => n.toFixed(0);

export function renderMarkdown(m) {
  const per1k = m.per1k === null ? '-' : `$${f1(m.per1k)}`;
  const kinds = Object.entries(m.poolByKind).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  return [
    `# 회차 지표 — ${m.run}`,
    '',
    `- 모드: ${m.mode || '-'} · 기간: ${m.createdAt || '-'} ~ ${m.closedAt || '진행 중'}`,
    '- 비용은 Claude 사용량을 API 단가로 환산한 값이다. 비-Claude 워커 토큰은 넣지 않는다.',
    '',
    '| 항목 | 값 |',
    '|---|---|',
    `| Claude 비용 | $${f2(m.cost)} |`,
    `| 조정 세션 / 레인 세션 / 서브에이전트 / Workflow | $${f2(m.costCoord)} / $${f2(m.costLanes)} / $${f2(m.costSub)} / $${f2(m.costWf)} |`,
    `| 조정 세션 비중 | ${f0(m.coordShare)}% |`,
    `| 조정 세션 컨텍스트 중앙값 | ${f0(m.coordCtxMedian / 1000)}K |`,
    `| 활동 시간 (세션 시간 합) | ${f1(m.activeHours)}h (${f1(m.sessionHours)}h) |`,
    `| 변경 줄 (머지 ${m.merges}건, 제외 패턴 적용) | ${m.lines} |`,
    `| 1천 줄당 Claude 비용 | ${per1k} |`,
    `| Workflow 회수 · 회당 agent 중앙값 | ${m.wfRuns} · ${m.wfAgentsMedian} |`,
    `| Workflow opus 비중 · 캐시 쓰기 비중 | ${f0(m.wfOpusShare)}% · ${f0(m.wfCwShare)}% |`,
    `| 풀 묶음 (종류별) | ${m.poolTotal} (${kinds}) |`,
    `| 풀 → Claude 넘김 · 리뷰 지적 · 풀 변경 줄 | ${m.poolFallback} · ${m.poolFindings} · ${m.poolLines} |`,
    `| 결정 · 판단 올리기 · 뒤집음 | ${m.decisions} · ${m.decisionsEsc} · ${m.decisionsRev} |`,
    `| 도구 재시도율 | ${f1(m.toolRetry)}% (${m.toolErrors}/${m.toolTotal}) |`,
    '',
  ].join('\n');
}

export function csvRow(m) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  return [m.run, m.mode, m.createdAt, m.closedAt, f2(m.cost), f2(m.costCoord), f2(m.costLanes), f2(m.costSub), f2(m.costWf),
    f2(m.activeHours), f2(m.sessionHours), m.lines, m.per1k === null ? '' : f2(m.per1k), f1(m.coordShare), f0(m.coordCtxMedian),
    m.wfRuns, m.wfAgentsMedian, f1(m.wfOpusShare), f1(m.wfCwShare), m.poolTotal, m.poolFallback, m.poolLines, m.poolFindings,
    m.decisions, m.decisionsEsc, m.decisionsRev, f1(m.toolRetry)].map(q).join(',');
}

const outText = (r) => String(r && r.out !== undefined ? r.out : '');

/** 레인 브랜치 머지 커밋의 변경 줄(제외 패턴 적용). */
function gitLines(c, st, cfg, since, until) {
  const repo = c.env.COORD_REPO || outText(runSync('git', ['rev-parse', '--show-toplevel'], { env: c.env, cwd: c.cwd })).trim();
  const git = cfgSub(c, '.git_bin') || 'git';
  const branch = (st.run && st.run.integration_branch) || cfgSub(c, '.integration_branch') || 'dev';
  const laneBranches = Object.values(st.lanes || {}).map((l) => l && l.branch).filter(Boolean);
  const shas = new Set(((st.merge && st.merge.history) || []).map((h) => h && (h.commit || h.sha)).filter(Boolean));
  const lg = runSync(git, ['log', '--first-parent', '--merges', `--since=${since}`, `--until=${until}`, '--format=%H%x09%s', branch], { env: c.env, cwd: repo });
  for (const line of outText(lg).split('\n')) {
    const [sha, subj = ''] = line.split('\t');
    if (sha && laneBranches.some((b) => subj.includes(`'${b}'`))) shas.add(sha);
  }
  const ex = ((cfg.metrics && cfg.metrics.exclude) || []).map((p) => `:(exclude,glob)**/${p}`);
  let add = 0; let del = 0; let files = 0;
  for (const sha of shas) {
    const r = runSync(git, ['diff', '--numstat', `${sha}^1`, sha, '--', '.', ...ex], { env: c.env, cwd: repo });
    for (const l of outText(r).split('\n')) {
      const [a, d] = l.split('\t');
      if (/^\d+$/.test(a || '') && /^\d+$/.test(d || '')) { add += Number(a); del += Number(d); files += 1; }
    }
  }
  return { merges: shas.size, files, add, del, lines: add + del };
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

export async function main(argv, { env, cwd }) {
  const o = { run: '', stdout: false, csv: true, since: '', until: '', dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    if (a === '--run') o.run = argv[++i] ?? '';
    else if (a === '--stdout') o.stdout = true;
    else if (a === '--no-csv') o.csv = false;
    else if (a === '--since') o.since = argv[++i] ?? '';
    else if (a === '--until') o.until = argv[++i] ?? '';
    else if (a === '--dry-run') o.dry = true;
    else { process.stderr.write(`알 수 없는 인자: ${a}\n${HELP}`); return 2; }
  }
  const c = new Ctx(o.run ? { ...env, COORD_RUN: o.run } : env, cwd);
  try {
    const dir = runDir(c);
    if (!existsSync(stateFile(c))) throw new CoordDie(3, `회차 state 가 없다: ${o.run || '(현재)'}`);
    const st = JSON.parse(readFileSync(stateFile(c), 'utf8'));
    const cfg = JSON.parse(cfgAll(c));
    const mc = cfg.metrics || {};
    const since = o.since || (st.run && st.run.created_at) || '1970-01-01T00:00:00Z';
    const until = o.until || (st.run && st.run.closed_at) || new Date().toISOString();
    const sessions = [];
    const csid = st.run && st.run.coordinator && st.run.coordinator.session_id;
    if (csid) sessions.push({ sid: csid, role: 'coord' });
    for (const [name, l] of Object.entries(st.lanes || {})) {
      const sid = l && l.session && l.session.session_id;
      if (sid) sessions.push({ sid, role: 'lane', lane: name });
    }
    const m = collectMetrics({
      projectsDir: expand(cfgSub(c, '.claude_projects_dir') || '~/.claude/projects', c.env),
      prices: mc.prices || {}, gapMin: Number(mc.gap_min ?? 15),
      sinceMs: Date.parse(since), untilMs: Date.parse(until),
      sessions, git: gitLines(c, st, cfg, since, until),
      // 같은 묶음 id 가 여러 줄(완료 줄 + pool.mjs note 보정 줄)이면 마지막 줄만
      pool: [...new Map(readJsonl(join(dir, 'pool', 'log.jsonl')).map((r) => [r.id, r])).values()],
      decisions: st.decisions || [],
      run: { ...(st.run || {}), mode: (st.run && st.run.mode) || cfgSub(c, '.mode.default') },
    });
    const md = renderMarkdown(m);
    const per1k = m.per1k === null ? '-' : f1(m.per1k);
    const head = `cost=${f2(m.cost)} per1k=${per1k} coord=${f0(m.coordShare)}% lines=${m.lines}`;
    if (o.dry) { process.stderr.write('DRY metrics.md·CSV 를 쓰지 않음\n'); process.stdout.write(`DRY METRICS ${m.run} ${head} file=-\n`); return 0; }
    let file = '-';
    if (o.stdout) process.stdout.write(md);
    else { file = join(dir, 'metrics.md'); writeFileSync(file, md); }
    if (o.csv) {
      const csv = join(stateRoot(c), mc.csv || 'metrics.csv');
      if (!existsSync(csv)) writeFileSync(csv, `${CSV_HEADER}\n`);
      appendFileSync(csv, `${csvRow(m)}\n`);
    }
    process.stdout.write(`METRICS ${m.run} ${head} file=${file}\n`);
    return 0;
  } catch (e) {
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc ?? 3; }
    throw e;
  }
}

if (isMain(import.meta.url)) scriptMain(main);
