// lib/session-log.mjs — 조정자 lib(node). Claude Code 세션 로그(jsonl)에서 사용량·도구 결과를 읽는 함수.
//   run-metrics.mjs 가 쓴다. 파일 찾기(findSessionFiles) 말고는 순수 함수다.
// node 18.17 이상, 외부 패키지 없음.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** assistant 줄 → 사용량 행. 같은 message.id+requestId 는 seen 으로 한 번만 센다(스트리밍 중복 줄). */
export function parseUsageLines(text, seen = new Set()) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant') continue;
    const m = o.message || {};
    const u = m.usage || {};
    const key = `${m.id ?? ''}|${o.requestId ?? ''}`;
    if (key !== '|') {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const cc = u.cache_creation || {};
    rows.push({
      ts: o.timestamp || '', model: m.model || '', sid: o.sessionId || '',
      inp: u.input_tokens || 0, out: u.output_tokens || 0,
      cc: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0,
      cc1h: cc.ephemeral_1h_input_tokens || 0, cc5m: cc.ephemeral_5m_input_tokens || 0,
    });
  }
  return rows;
}

/** tool_result 블록 수와 is_error 수. */
export function parseToolResults(text) {
  let total = 0;
  let errors = 0;
  for (const line of text.split('\n')) {
    if (!line.includes('"tool_result"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const c = o.message && o.message.content;
    if (!Array.isArray(c)) continue;
    for (const x of c) {
      if (x && x.type === 'tool_result') { total += 1; if (x.is_error) errors += 1; }
    }
  }
  return { total, errors };
}

/** 캐시 쓰기 몫(달러). TTL 칸이 없으면 cc 전체를 1시간 단가로 본다. */
export function cacheWriteCostOf(r, prices) {
  const p = prices[r.model];
  if (!p) return 0;
  const rest = Math.max(0, r.cc - r.cc1h - r.cc5m);
  return ((r.cc1h + rest) * p[0] * 2 + r.cc5m * p[0] * 1.25) / 1e6;
}

/** 한 행의 비용(달러). 단가가 없는 모델(glm 등)은 0. */
export function costOf(r, prices) {
  const p = prices[r.model];
  if (!p) return 0;
  return (r.inp * p[0] + r.out * p[1] + r.cr * p[2]) / 1e6 + cacheWriteCostOf(r, prices);
}

/** 이어진 메시지 간격(gapMin 이하)만 더한 활동 시간(시간). */
export function activeHours(tsList, gapMin = 15) {
  const t = tsList.map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  let sum = 0;
  for (let k = 1; k < t.length; k += 1) {
    const d = (t[k] - t[k - 1]) / 60000;
    if (d <= gapMin) sum += d;
  }
  return sum / 60;
}

export function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function inWindow(ts, sinceMs, untilMs) {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return false;
  return t >= sinceMs && t <= untilMs;
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** 모든 프로젝트 폴더에서 세션 sid 의 메인·서브에이전트·Workflow 로그를 찾는다. */
export function findSessionFiles(projectsDir, sid) {
  const res = { main: [], sub: [], wf: [] };
  if (!sid || !isDir(projectsDir)) return res;
  for (const d of readdirSync(projectsDir)) {
    const base = join(projectsDir, d);
    if (!isDir(base)) continue;
    const f = join(base, `${sid}.jsonl`);
    if (existsSync(f)) res.main.push(f);
    const sd = join(base, sid, 'subagents');
    if (!isDir(sd)) continue;
    for (const e of readdirSync(sd)) {
      const p = join(sd, e);
      if (e.endsWith('.jsonl')) res.sub.push(p);
      else if (e === 'workflows' && isDir(p)) {
        for (const w of readdirSync(p)) {
          const wp = join(p, w);
          if (!isDir(wp)) continue;
          for (const a of readdirSync(wp)) if (a.endsWith('.jsonl')) res.wf.push(join(wp, a));
        }
      }
    }
  }
  return res;
}
