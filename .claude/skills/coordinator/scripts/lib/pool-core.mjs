// lib/pool-core.mjs — 조정자 lib(node). 비-Claude 워커 풀의 판정 함수와 묶음 기록 파일 I/O(설계 2026-10-10 §4).
//   풀 폴더: items/<id>.json(묶음 기록) · cool.json(종류별 쉬는 시각·벌점) · log.jsonl(끝난 묶음 한 줄씩)
// node 18.17 이상, 외부 패키지 없음.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const RATE_RE = /\b429\b|rate[ _-]?limit|quota|too many requests|usage limit/i;

/** opencode 지시문(`!`·`/`·`@` 금지). 묶음 파일은 작업 폴더의 .pool/<id>.md */
export function promptFor(id) {
  return `작업 지시 파일 .pool 폴더의 ${id}.md 를 읽고 그대로 진행해`;
}

export function fillArgs(tmpl, prompt) {
  if (Array.isArray(tmpl)) return tmpl.map((a) => (a === '{prompt}' ? prompt : String(a).split('{prompt}').join(prompt)));
  return String(tmpl).trim().split(/\s+/).map((a) => (a === '{prompt}' ? prompt : a.split('{prompt}').join(prompt)));
}

export function classify({ rc, timedOut, outTail, reportExists }) {
  if (timedOut) return 'timeout';
  if (RATE_RE.test(outTail || '') && (rc !== 0 || !reportExists)) return 'ratelimit';
  if (rc !== 0) return 'fail';
  if (!reportExists) return 'fail';
  return 'ok';
}

export function effectiveMax(kind, cfgMax, cool, nowMs) {
  const max = Number(cfgMax) || 0;
  if (max <= 0) return 0;
  const c = cool[kind];
  if (!c) return max;
  if (Date.parse(c.until) > nowMs) return 0;
  return Math.max(1, max - (Number(c.penalty) || 0));
}

export function pickKind({ order, max, running, cool, nowMs, want = 'auto' }) {
  const kinds = want === 'auto' ? order : [want];
  for (const k of kinds) {
    if ((running[k] || 0) < effectiveMax(k, max[k] || 0, cool, nowMs)) return k;
  }
  return null;
}

export function hasAnyWorker({ order, max, cool, nowMs, want = 'auto' }) {
  const kinds = want === 'auto' ? order : [want];
  return kinds.some((k) => effectiveMax(k, max[k] || 0, cool, nowMs) > 0);
}

export function coolAfterRatelimit(cool, kind, nowMs, cooldownMin) {
  const prev = cool[kind] || { penalty: 0 };
  const prevUntil = Date.parse(prev.until);
  const cooling = Number.isFinite(prevUntil) && prevUntil > nowMs;
  const newUntil = nowMs + Number(cooldownMin) * 60000;
  const until = new Date(cooling ? Math.max(prevUntil, newUntil) : newUntil).toISOString();
  // 이미 쉬는 중이면 같은 한도 사건의 동시 실패로 보고 벌점은 올리지 않는다.
  const penalty = (Number(prev.penalty) || 0) + (cooling ? 0 : 1);
  return { ...cool, [kind]: { until, penalty } };
}

export function reapStale(records, isAlive, nowIso) {
  const reaped = [];
  for (const r of records) {
    if (r.state === 'running' && !isAlive(r.pid)) {
      Object.assign(r, { state: 'done', result: 'fail', reason: 'lost', fallback: true, ended_at: nowIso });
      reaped.push(r);
    }
  }
  return reaped;
}

export function logEntry(r) {
  return {
    id: r.id, lane: r.lane ?? '-', kind: r.kind || '-', size: r.size ?? '-',
    submitted_at: r.submitted_at ?? null, started_at: r.started_at ?? null, ended_at: r.ended_at ?? null,
    result: r.result ?? null, reason: r.reason ?? null, fallback: !!r.fallback,
    findings: Number(r.findings) || 0, lines: Number(r.lines) || 0,
  };
}

const itemsDir = (dir) => join(dir, 'items');
const atomic = (file, text) => { const tmp = `${file}.tmp.${process.pid}`; writeFileSync(tmp, text); renameSync(tmp, file); };

export function readItems(dir) {
  const d = itemsDir(dir);
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    try { out.push(JSON.parse(readFileSync(join(d, f), 'utf8'))); } catch { /* 쓰는 중인 파일은 건너뜀 */ }
  }
  return out.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
}

export function readItem(dir, id) {
  const f = join(itemsDir(dir), `${id}.json`);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

export function writeItem(dir, rec) {
  mkdirSync(itemsDir(dir), { recursive: true });
  atomic(join(itemsDir(dir), `${rec.id}.json`), `${JSON.stringify(rec, null, 2)}\n`);
}

export function readCool(dir) {
  const f = join(dir, 'cool.json');
  if (!existsSync(f)) return {};
  try {
    const v = JSON.parse(readFileSync(f, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function writeCool(dir, cool) {
  mkdirSync(dir, { recursive: true });
  atomic(join(dir, 'cool.json'), `${JSON.stringify(cool, null, 2)}\n`);
}

export function appendLog(dir, entry) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'log.jsonl'), `${JSON.stringify(entry)}\n`);
}
