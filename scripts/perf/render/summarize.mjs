#!/usr/bin/env node
/**
 * 측정 결과 요약 — `measure-screens.mjs` 가 쓴 `$PERF_OUT/results.json` 을 읽어 중앙값을 낸다.
 *
 * 규칙은 `scripts/perf/frontend/README.md` 와 같다.
 *   - keep=1 인 회차만 쓴다(load 초과로 버린 회차는 제외).
 *   - 1회 값으로 결론 내지 않는다. 중앙값으로 낸다.
 *   - 회차가 3회 미만이면 경고만 하고 숫자는 그대로 낸다(결론 근거로 쓰지 말 것).
 *
 * 사용법
 *   node scripts/perf/render/summarize.mjs            # 마크다운 표를 표준 출력으로
 *   node scripts/perf/render/summarize.mjs --json     # JSON 으로
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const OUT = process.env.PERF_OUT ?? path.join(process.env.TMPDIR ?? "/tmp", "dmes-perf", "render");
const MIN_ROUNDS = Number(process.env.RENDER_MIN_ROUNDS ?? 3);

/** 중앙값. 짝수 개면 가운데 두 값의 평균. 빈 배열이면 null. */
function median(nums) {
  const v = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const round1 = (n) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

/**
 * 중앙값을 낼 숫자 지표 목록. ★첫 항목이 주 지표다.★
 * 지시 2-1: 본 지표는 `searchToRowMs`, 0건 화면은 `searchResponseToEmptyMs`.
 * `shellReadyMs` 는 함께 내고 `clickToRowMs` 는 참고값이다 — 그래서 뒤쪽에 두고 이름에 (참고) 를 붙였다.
 */
const METRICS = [
  ["inPageSearchToRowMutMs", "★주 지표·조회→첫 행, 페이지 안 시계(ms)", "search"],
  ["searchTtfbMs", "조회 TTFB, BFF 기준(ms)", "search"],
  ["searchEncodedBytes", "조회 응답 크기(B)", "search"],
  ["searchRows", "조회 응답 행 수", "search"],
  ["searchTotalCount", "조회 전체 건수(totalCount)", "search"],
  ["searchQueueMs", "조회 큐 대기(ms)", "search"],
  ["fullViewInPageMs", "[전체 보기] 클릭→안내 띠 사라짐(ms)", "full"],
  ["fullViewTtfbMs", "[전체 보기] TTFB(ms)", "full"],
  ["fullViewEncodedBytes", "[전체 보기] 응답 크기(B)", "full"],
  ["fullViewRows", "[전체 보기] 응답 행 수", "full"],
  ["apiAfterMenuClick", "메뉴 클릭 뒤 진입 호출 수"],
  ["authMeAfterMenuClick", "그중 /api/auth/me"],
  ["authMeAll", "페이지 전체 /api/auth/me"],
  ["searchToRowMs", "(순위용·폴링 격자) 조회→첫 행(ms)", "search"],
  ["searchResponseToEmptyMs", "★주 지표(0건)·조회응답→빈 상태(ms)", "search"],
  ["shellReadyMs", "shell 준비(ms)"],
  ["clickToRowMs", "(참고) 메뉴클릭→첫행(ms)"],
  ["searchToEmptyMs", "(참고) 조회클릭→빈 상태(ms)", "search"],
  ["longTaskCount", "long task 수"],
  ["longTaskSumMs", "long task 합(ms)"],
  ["longTaskMaxMs", "long task 최대(ms)"],
  ["scriptMs", "스크립트(ms)"],
  ["taskMs", "태스크 총(ms)"],
  ["layoutMs", "레이아웃(ms)"],
  ["recalcStyleMs", "스타일재계산(ms)"],
  ["layoutCount", "레이아웃 횟수"],
  ["recalcStyleCount", "스타일재계산 횟수"],
  ["nodeDelta", "DOM 노드 증감"],
  ["heapDeltaMB", "힙 증감(MB)"],
  ["apiCount", "API 호출 수"],
  ["apiTotalMs", "API 합계(ms)"],
  ["apiSlowestMs", "API 최장(ms)"],
  ["renderCommits", "렌더 커밋 수"],
  ["renderCommitMs", "렌더 커밋 합(ms)"],
];

function main() {
  const file = path.join(OUT, "results.json");
  if (!fs.existsSync(file)) {
    console.error(`[render-perf] 결과 파일이 없다: ${file}\n  → measure-screens.mjs 를 먼저 돌린다.`);
    process.exit(1);
  }
  const all = JSON.parse(fs.readFileSync(file, "utf8"));
  const kept = all.filter((r) => r.keep === 1 && r.rc === 0);

  // 화면별 × 탭 상태별 로 묶는다(cold/warm 은 섞지 않는다 — 다른 비용이다).
  const groups = new Map();
  for (const r of kept) {
    const key = `${r.screen}\u0000${r.tab_state ?? "cold"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const out = { out_dir: OUT, min_rounds: MIN_ROUNDS, screens: [] };

  for (const [key, rows] of [...groups].sort()) {
    const [id, tab] = key.split("\u0000");
    const entry = {
      screen: id,
      label: rows[0].label ?? id,
      tab_state: tab,
      rounds_kept: rows.length,
      enough: rows.length >= MIN_ROUNDS,
      metrics: {},
    };
    // ★조회 지표는 유효한 회차만★(검증 §4 결함 11) — [조회] 가 요청을 내지 않았거나(invalidSearch, searchAfterClick=0)
    //   진입 자동 조회 화면(screens.mjs autoSearchAtEntry, layoutConfirm)의 회차,
    //   (searchBeforeClick 은 optionsOnly 진입 호출도 세므로 판정에 쓰지 않는다) cold 인데 진입 때 이미 행이 있던(row-at-entry) 회차는
    //   "조회 대기" 를 재지 않았으므로 조회 지표 중앙값에서 뺀다. 진입·호출 수 지표는 모든 회차를 쓴다.
    const validSearch = rows.filter(
      (r) =>
        r.invalidSearch !== 1 &&
        r.searchAfterClick !== 0 &&
        r.autoSearchAtEntry !== 1 &&
        !(tab === "cold" && r.row_mode === "row-at-entry")
    );
    entry.rounds_valid_search = validSearch.length;
    for (const [k, , scope] of METRICS) {
      const src = scope ? validSearch : rows;
      const vals = src.map((r) => (typeof r[k] === "number" ? r[k] : NaN)).filter(Number.isFinite);
      entry.metrics[k] = round1(median(vals));
    }
    // ★어느 주 지표를 썼는지 명시한다 — 0건 화면과 1건 이상 화면을 같은 표에서 읽으면 안 된다.★
    const modes = [...new Set(rows.map((r) => r.row_mode).filter(Boolean))];
    entry.row_mode = modes.join("+") || "(미기록)";
    entry.primary_metric = rows.find((r) => r.primaryMetric)?.primaryMetric ?? "searchToRowMs";
    // 가장 느린 API — 중앙값 대신 "가장 흔한 최장 호출" 을 한 번 본다.
    const worst = rows.map((r) => r.apiSlowestUrl).filter(Boolean);
    entry.apiSlowestUrl = worst.length ? worst.sort((a, b) => a.localeCompare(b))[0] : "";
    out.screens.push(entry);
  }

  const dropped = all.filter((r) => r.keep === 0);
  const byReason = {};
  for (const r of dropped) {
    const k = r.rc !== 0 ? `실패(rc=${r.rc})` : r.warmup === 1 ? "예열 회차" : "load 초과로 버림";
    byReason[k] = (byReason[k] ?? 0) + 1;
  }
  out.dropped = { total: dropped.length, by_reason: byReason, rows: dropped.map((r) => ({ round: r.round, screen: r.screen, error: r.error ?? "" })) };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`# MDM 화면 렌더링 측정 요약`);
  console.log(`\n결과 폴더: \`${OUT}\`\n`);
  if (out.dropped.total) {
    console.log(`버린 회차 ${out.dropped.total}건 — ${JSON.stringify(out.dropped.by_reason)}`);
    for (const d of out.dropped.rows) console.log(`  - r${d.round} ${d.screen}${d.error ? `: ${d.error}` : ""}`);
    console.log("");
  }

  for (const s of out.screens) {
    const flag = s.enough ? "" : `  ⚠ kept ${s.rounds_kept}회 (< ${MIN_ROUNDS}) — 결론 근거로 쓰지 말 것`;
    console.log(`## ${s.label} (\`${s.screen}\`) · tab_state=${s.tab_state}${flag}`);
    console.log(`\n주 지표: \`inPageSearchToRowMutMs\` · row_mode=${s.row_mode} · 조회 지표 유효 회차 ${s.rounds_valid_search}/${s.rounds_kept}`);
    if (s.rounds_valid_search < s.rounds_kept) {
      console.log(`\n> **조회 지표에서 뺀 회차가 있다**(진입 자동 조회·클릭 뒤 조회 없음·row-at-entry). 진입·호출 수 지표는 모든 회차 값이다.`);
    }
    if (s.row_mode.includes("empty")) {
      console.log(`\n> **이 화면은 조회 결과가 0건이었다.** 주 지표는 "조회 응답 → 빈 상태 표시" 이다.`);
      console.log(`> "조회 → 첫 행" 과 다른 비용(데이터 렌더 없음)이므로 다른 화면과 같은 선으로 비교하지 말 것.`);
    }
    if (s.row_mode.includes("timeout")) {
      console.log(`\n> **일부 회차가 timeout 이었다.** 도착 신호를 못 잡은 회차가 있어 값이 낮게 나올 수 있다.`);
    }
    console.log(`\n| 지표 | 중앙값 |`);
    console.log(`|---|---|`);
    for (const [k, label] of METRICS) {
      const v = s.metrics[k];
      if (v === null) continue;
      console.log(`| ${label} | ${v} |`);
    }
    if (s.apiSlowestUrl) console.log(`\n가장 느린 API: \`${s.apiSlowestUrl}\``);
    console.log("");
  }
}

main();
