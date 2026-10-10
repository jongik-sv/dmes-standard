import assert from "node:assert/strict";
import test from "node:test";
import {
  GROUP_LIMIT,
  WRITE_TEXT_LIMIT,
  clock,
  formatChangesText,
  formatClaimText,
  formatResolveErrors,
  formatWriteResult,
} from "../lib/results.mjs";
import { APPLIED_13, CONFLICT_REJECTION, DELTA_ME_13, DELTA_UI_11, MODEL, VIEW } from "./fixtures/erd-view.mjs";

const KST = { offsetMin: 540 };
const UPDATE = [{ op: "updateColumn", id: "c-m3", set: { logical: "메뉴이름" } }];
const ctx = (over = {}) => ({ op: "apply", commands: UPDATE, view: VIEW, baseRev: 10, dryRun: false, session: "claude-test", user: "erd-mcp-a", others: null, ...KST, ...over });
const claimed = (table, session) => ({ code: "CLAIMED", elementId: table, message: `${session} 가 작업 중인 표입니다`, claimedBy: session, expiresAt: "2026-10-11T05:20:00Z" });
const reject = (over) => ({ applied: false, rev: 12, rowVersion: null, dryRun: false, changes: [], warnings: [], rejection: { ...CONFLICT_REJECTION, ...over } });

test("반영 글: 변경 줄(바뀐 속성), CLAIMED(세션의 사용자), 다른 세션 변경, 다음 baseRev", () => {
  const r = { ...APPLIED_13, warnings: [claimed("t-menu", "claude-a")] };
  const out = formatWriteResult(r, ctx({ others: { reload: false, deltas: [DELTA_UI_11] } }));
  assert.equal(out.isError, false);
  assert.equal(
    out.text,
    [
      "반영 rev 13 (baseRev 10) · 변경 1 · 경고 1 · 세션 claude-test",
      "column upsert TB_MCM_SEC_MENU.MENU_NM (logical)",
      "경고: CLAIMED 1",
      "TB_MCM_SEC_MENU 작업 중: claude-a (41000207), 14:20(+09:00)까지",
      "baseRev 뒤 다른 세션 변경 1건: ui-41000207 rev 11, TB_MCM_SEC_OBJ. getChangesSince(10) 로 확인하세요.",
      "다음 baseRev: 13",
    ].join("\n"),
  );
  // 접속자 목록에 없는 세션은 사용자를 모른다 → 세션만 적는다.
  const unknown = formatWriteResult({ ...APPLIED_13, warnings: [claimed("t-menu", "claude-zz")] }, ctx());
  assert.match(unknown.text, /^TB_MCM_SEC_MENU 작업 중: claude-zz, 14:20\(\+09:00\)까지$/m);
  assert.equal(clock("2026-10-11T05:20:00Z", { offsetMin: 0 }), "05:20(+00:00)");
});

test("새 요소는 (새), 지운 요소는 지우기 전 이름", () => {
  const r = {
    ...APPLIED_13,
    changes: [
      { kind: "table", id: "t-n1", op: "upsert", value: { phys: "TB_MCM_NEW", logical: "새 표", comment: "", columnOrder: [], _rev: {} } },
      { kind: "column", id: "c-n1", op: "upsert", value: { table: "t-n1", phys: "NEW_ID", _rev: {} } },
      { kind: "column", id: "c-m2", op: "delete", value: null },
    ],
  };
  const lines = formatWriteResult(r, ctx()).text.split("\n");
  assert.deepEqual(lines.slice(1, 4), ["table upsert TB_MCM_NEW (새)", "column upsert TB_MCM_NEW.NEW_ID (새)", "column delete TB_MCM_SEC_MENU.OBJECT_ID"]);
});

test("CONFLICT 거절 글(README 정본)과 byUserId 가 없는 옛 응답", () => {
  const out = formatWriteResult(reject({}), ctx());
  assert.equal(out.isError, true);
  assert.equal(
    out.text,
    [
      "거절 CONFLICT · 명령 #1 updateColumn TB_MCM_SEC_MENU.MENU_NM.logical · 저장한 것 없음",
      "바꾼 사람: 41000207 (세션 ui-41000207) rev 11 · 지금 값: \"메뉴명\"",
      "다음: getChangesSince(10) 로 바뀐 값을 읽고, 묶음 전체를 baseRev 11 이상으로 다시 보내세요.",
    ].join("\n"),
  );
  const { byUserId, ...old } = CONFLICT_REJECTION; // 서버 레인 머지 전 응답: 칸이 아예 없다
  const oldOut = formatWriteResult({ ...reject({}), rejection: old }, ctx());
  assert.match(oldOut.text, /^바꾼 사람: 세션 ui-41000207 rev 11 · 지금 값: "메뉴명"$/m);
  assert.doesNotMatch(oldOut.text, /undefined|null \(/);
});

test("NOT_FOUND·NEEDS_CHOICE(20건)·NOT_EDITOR·INVALID(낡은 차이 항목) 글", () => {
  const nf = formatWriteResult(reject({ code: "NOT_FOUND", message: "이미 지워진 요소입니다: c-m3", property: null, current: null }), ctx()).text;
  assert.match(nf, /^거절 NOT_FOUND · 명령 #1 updateColumn TB_MCM_SEC_MENU\.MENU_NM · 저장한 것 없음$/m);
  assert.match(nf, /^지운 사람: 41000207 \(세션 ui-41000207\) rev 11$/m);
  assert.match(nf, /다음: getChangesSince\(10\) 로 지운 변경을 확인하고/);

  const choices = Array.from({ length: 25 }, (_, i) => `MENU_NM_${i}`);
  const nc = formatWriteResult(reject({ code: "NEEDS_CHOICE", message: "이름이 겹칩니다", choices, byRev: null, bySession: null, byUserId: null }), ctx()).text;
  assert.match(nc, /^고를 수 있는 값 25개: "MENU_NM_0", .*"MENU_NM_19" 외 5개$/m);
  assert.match(nc, /onNameClash 를 REUSE/);

  const ne = formatWriteResult(reject({ code: "NOT_EDITOR", message: "편집 권한이 없습니다", ownerId: "admin", byRev: null, bySession: null, byUserId: null, elementId: null }), ctx()).text;
  assert.match(ne, /^거절 NOT_EDITOR · 저장한 것 없음$/m); // 묶음 전체에 걸린 거절 — 명령 번호를 적지 않는다
  assert.doesNotMatch(ne, /명령 #/);
  assert.match(ne, /^소유자: admin · 서버가 보는 사용자\(ERD_USER\): erd-mcp-a$/m);
  assert.match(ne, /소유자에게 execute kind=ADD_EDITOR 로 ERD_USER 값\(erd-mcp-a\)을 등록해 달라고 하세요/);

  const stale = ["COLUMN_ADDED:TB_X.Y", "FK_ADDED:TB_X(Y)>TB_Z(Y)"];
  const inv = formatWriteResult(
    reject({ code: "INVALID", message: "차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 2개가 있습니다", hint: "compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요", elementId: stale[0], property: "itemsJson", choices: stale, byRev: null, bySession: null, byUserId: null, current: null }),
    ctx(),
  ).text;
  assert.match(inv, /^내용: 차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 2개가 있습니다$/m);
  assert.match(inv, /^해당 항목 2개: "COLUMN_ADDED:TB_X\.Y", "FK_ADDED:TB_X\(Y\)>TB_Z\(Y\)"$/m);
  assert.match(inv, /^다음: compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요$/m);
});

test("시험 실행: 통과·거절 머리줄, baseRev 는 그대로, 서버가 dryRun 을 모르면 경고", () => {
  const pass = formatWriteResult({ ...APPLIED_13, applied: false, rev: 12, rowVersion: null, dryRun: true }, ctx({ dryRun: true }));
  assert.equal(pass.isError, false);
  const lines = pass.text.split("\n");
  assert.equal(lines[0], "시험 실행(저장 안 함) · 통과");
  assert.equal(lines[1], "지금 rev 12 (baseRev 10) · 변경 1 · 경고 0 · 세션 claude-test");
  assert.equal(lines.at(-1), "다음: dryRun 없이 같은 묶음을 보내면 저장한다(CLI 는 --apply). baseRev 는 10 그대로 쓴다.");
  assert.doesNotMatch(pass.text, /다음 baseRev/); // 시험 실행의 rev 를 다음 baseRev 로 주지 않는다(S2-22)

  const dryReject = formatWriteResult({ ...reject({}), dryRun: true }, ctx({ dryRun: true })).text.split("\n");
  assert.deepEqual(dryReject.slice(0, 2), ["시험 실행(저장 안 함) · 거절 CONFLICT", "명령 #1 updateColumn TB_MCM_SEC_MENU.MENU_NM.logical · baseRev 10"]);

  const old = formatWriteResult({ applied: true, rev: 13, changes: [], warnings: [], rejection: null }, ctx({ dryRun: true }));
  assert.equal(old.isError, true);
  assert.match(old.text, /^주의: 서버가 시험 실행\(dryRun\)을 지원하지 않아 실제로 반영했습니다 · 반영 rev 13/);
  assert.match(old.text, /undo\(rev=13\)/);
});

test("되돌리기 글: 누구의 몇 rev, 되돌리기 CONFLICT", () => {
  const ok = formatWriteResult({ ...APPLIED_13, rev: 14 }, ctx({ op: "undo", baseRev: null, undoRev: 13, undone: DELTA_ME_13 })).text.split("\n");
  assert.equal(ok[0], "반영 rev 14 (되돌리기 rev 13) · 변경 1 · 경고 0 · 세션 claude-test");
  assert.equal(ok[1], "되돌린 변경: rev 13 · 41000207 (세션 claude-test) · 1건");
  assert.equal(ok.at(-1), "다음 baseRev: 14");
  const unknown = formatWriteResult({ ...APPLIED_13, rev: 14 }, ctx({ op: "undo", baseRev: null, undoRev: 13, undone: null })).text;
  assert.match(unknown, /^되돌린 변경: rev 13 \(누구의 변경인지 읽지 못했습니다\)$/m);
  const c = formatWriteResult(reject({ byUserId: "erd-mcp-b", bySession: "claude-b", byRev: 15 }), ctx({ op: "undo", baseRev: null, undoRev: 13 })).text;
  assert.match(c, /^거절 CONFLICT · 되돌리기 rev 13 TB_MCM_SEC_MENU\.MENU_NM\.logical · 저장한 것 없음$/m);
  assert.match(c, /^바꾼 사람: erd-mcp-b \(세션 claude-b\) rev 15/m);
  assert.match(c, /^다음: rev 13 뒤에 같은 속성이 바뀌어 되돌릴 수 없습니다/m);
});

test("경고는 코드별 수로 묶고 코드마다 처음 50건만 이름을 적는다(S2-28)", () => {
  const std = Array.from({ length: 120 }, () => ({ code: "STD_NEW", elementId: "c-m3", message: "컬럼 사전에 아직 없는 이름입니다", claimedBy: null, expiresAt: null }));
  const text = formatWriteResult({ ...APPLIED_13, warnings: [...std, claimed("t-menu", "claude-a")] }, ctx()).text;
  assert.match(text, /^경고: CLAIMED 1, STD_NEW 120$/m);
  assert.equal(text.split("\n").filter((l) => l.startsWith("STD_NEW TB_MCM_SEC_MENU.MENU_NM:")).length, GROUP_LIMIT);
  assert.match(text, /^… STD_NEW 70건 더\(이름은 처음 50건만 적는다\)$/m);
});

test("크기: 한글 주석 200건 반영과 24,000자 지금 값도 25,000자 안이고 마지막 줄은 남는다", () => {
  const cols = Array.from({ length: 200 }, (_, i) => `c-k${i}`);
  const big = { ...VIEW, model: JSON.stringify({ ...MODEL, columns: { ...MODEL.columns, ...Object.fromEntries(cols.map((id, i) => [id, { ...MODEL.columns["c-m3"], phys: `KOREAN_COMMENT_COLUMN_${i}` }])) } }) };
  const changes = cols.map((id, i) => ({
    kind: "column", id, op: "upsert",
    value: { ...MODEL.columns["c-m3"], phys: `KOREAN_COMMENT_COLUMN_${i}`, comment: "마감 크기 시험 한글 주석 — 표준 용어와 도메인 확인용 ".repeat(30) },
  }));
  const text = formatWriteResult({ ...APPLIED_13, rev: 300, changes }, ctx({ view: big, baseRev: 299 })).text;
  assert.ok(text.length <= WRITE_TEXT_LIMIT, `${text.length}`);
  assert.equal(text.split("\n").at(-1), "다음 baseRev: 300");
  const veryLong = Array.from({ length: 900 }, (_, i) => ({ ...changes[i % 200], id: `c-x${i}` }));
  const cut = formatWriteResult({ ...APPLIED_13, rev: 300, changes: veryLong }, ctx({ view: big, baseRev: 299 })).text.split("\n");
  assert.ok(cut.join("\n").length <= WRITE_TEXT_LIMIT);
  assert.match(cut.at(-2), /^… \d+줄 더 있습니다\. getChangesSince\(299\) 로 나눠 읽으세요\.$/);
  assert.equal(cut.at(-1), "다음 baseRev: 300");
  // 시험 실행은 저장하지 않았으므로 getChangesSince 로 읽으라고 하지 않는다.
  const dryCut = formatWriteResult({ ...APPLIED_13, applied: false, rev: 299, dryRun: true, changes: veryLong }, ctx({ view: big, baseRev: 299, dryRun: true })).text;
  assert.ok(dryCut.length <= WRITE_TEXT_LIMIT);
  assert.match(dryCut, /^… \d+줄 더 있습니다\. 묶음을 나눠 시험 실행하세요\.$/m);
  assert.doesNotMatch(dryCut, /getChangesSince\(299\) 로 나눠/);

  const ko = "가나다라마바사아자차카타파하".repeat(2000).slice(0, 24000);
  const r = formatWriteResult(reject({ current: ko }), ctx());
  assert.ok(r.text.length < 1000, `${r.text.length}`);
  assert.match(r.text, /지금 값: "가나다.*…\(\d+자 더\)/);
});

test("이름 풀기 실패와 작업 중 표시 글", () => {
  const e = formatResolveErrors([{ index: 0, field: "id", value: "TB_MCM_SEC_MENU.MENU", message: "없는 컬럼입니다", near: ["TB_MCM_SEC_MENU.MENU_ID"] }], UPDATE);
  assert.equal(
    e,
    [
      "이름 풀기 실패 1건 · 서버에 보내지 않음(저장한 것 없음)",
      "명령 #1 updateColumn id \"TB_MCM_SEC_MENU.MENU\": 없는 컬럼입니다 · 비슷한 이름: TB_MCM_SEC_MENU.MENU_ID",
      "다음: getModelText(tables=[…]) 로 물리명을 확인하고 묶음 전체를 다시 보내세요. id(t-·c-·k-·r-·d-)를 그대로 써도 됩니다.",
    ].join("\n"),
  );
  const c = formatClaimText(
    "CLAIM",
    [
      { label: "TB_A", result: { ok: true, claimedBy: "claude-test", userId: "u", expiresAt: "2026-10-11T05:30:00Z" } },
      { label: "TB_B", result: { ok: false, claimedBy: "claude-b", userId: "erd-mcp-b", expiresAt: "2026-10-11T05:20:00Z" } },
      { label: "TB_C", result: { ok: false, claimedBy: null, userId: null, expiresAt: null } },
      { label: "TB_D", result: { ok: false } }, // 옛 서버: ok 만 온다
    ],
    [{ index: 4, field: "tables", value: "TB_X", message: "없는 표입니다", near: [] }],
    { session: "claude-test", ...KST },
  );
  assert.equal(c.isError, false); // 못 잡은 것은 오류가 아니다
  assert.deepEqual(c.text.split("\n"), [
    "작업 중 표시 4개 · 세션 claude-test · 600초 뒤 저절로 풀린다(오래 걸리면 다시 부른다)",
    "TB_A 잡음 · 14:30(+09:00)까지",
    "TB_B 못 잡음: claude-b (erd-mcp-b) 가 14:20(+09:00)까지 작업 중",
    "TB_C 못 잡음: 다른 세션이 같은 때 잡았습니다(누구인지 아직 모릅니다). 잠시 뒤 다시 부르세요.",
    "TB_D 못 잡음: 다른 세션이 같은 때 잡았습니다(누구인지 아직 모릅니다). 잠시 뒤 다시 부르세요.",
    "없는 표 \"TB_X\": 없는 표입니다",
  ]);
  assert.equal(formatClaimText("RELEASE", [], [{ index: 0, field: "tables", value: "TB_X", message: "없는 표입니다", near: [] }], { session: "s" }).isError, true);
});

test("getChangesSince 글: 이름, 거르기, raw 는 원할 때만, 500건도 25,000자 안", () => {
  const cv = { rev: 13, reload: false, deltas: [DELTA_UI_11, DELTA_ME_13] };
  const base = { view: VIEW, sinceRev: 10, mySession: "claude-test" };
  const out = formatChangesText(cv, base);
  assert.equal(out.raw, null);
  assert.equal(
    out.text,
    [
      "# rev 10 이후 변경 2건 (현재 rev 13)",
      "rev 11 41000207/ui-41000207 UI: table upsert TB_MCM_SEC_OBJ (logical)",
      "rev 13 41000207/claude-test MCP: column upsert TB_MCM_SEC_MENU.MENU_NM (logical)",
      "다음 baseRev: 13",
    ].join("\n"),
  );
  const mine = formatChangesText(cv, { ...base, excludeMine: true }).text.split("\n");
  assert.equal(mine[0], "# rev 10 이후 변경 2건 (현재 rev 13) · 보인 것 1건(내 세션 claude-test 뺌)");
  assert.equal(mine.length, 3);
  const byTable = formatChangesText(cv, { ...base, tables: "TB_MCM_SEC_MENU,TB_NOPE" }).text.split("\n");
  assert.equal(byTable[0], "# rev 10 이후 변경 2건 (현재 rev 13) · 보인 것 1건(표 TB_MCM_SEC_MENU,TB_NOPE)");
  assert.equal(byTable[1], "없는 표: TB_NOPE");
  assert.deepEqual(JSON.parse(formatChangesText(cv, { ...base, session: "ui-41000207", raw: true }).raw).deltas.map((d) => d.rev), [11]);
  assert.match(formatChangesText({ rev: 900, reload: true, deltas: [] }, base).text, /^# reload: .*현재 rev 900\. getModelText 로/);

  const many = Array.from({ length: 500 }, (_, i) => ({
    ...DELTA_ME_13,
    rev: 14 + i,
    changes: Array.from({ length: 12 }, (_, j) => ({ kind: "diagramNode", id: `d-menu:t-menu`, op: "upsert", value: { x: j, y: i } })),
  }));
  const big = formatChangesText({ rev: 513, reload: false, deltas: many }, { ...base, sinceRev: 13 });
  assert.ok(big.text.length <= WRITE_TEXT_LIMIT, `${big.text.length}`);
  assert.match(big.text.split("\n").at(-1), /^… \d+줄 더 있습니다\. getChangesSince\(\d+\) 로 나눠 읽으세요\.$/);
  const withRaw = formatChangesText({ rev: 513, reload: false, deltas: many }, { ...base, sinceRev: 13, raw: true });
  assert.ok(withRaw.text.length + withRaw.raw.length <= WRITE_TEXT_LIMIT);
  assert.ok(JSON.parse(withRaw.raw).truncated > 0);
});

test("고를 값은 하나 90자, 한 줄은 2,000자 안이고 \"외 n개\" 꼬리가 남는다", () => {
  const long = Array.from({ length: 25 }, (_, i) => `${i}_${"가".repeat(300)}`);
  const text = formatWriteResult(reject({ code: "NEEDS_CHOICE", message: "이름이 겹칩니다", choices: long, byRev: null, bySession: null, byUserId: null }), ctx()).text;
  const line = text.split("\n").find((l) => l.startsWith("고를 수 있는 값 25개: "));
  assert.ok(line.length <= 2000, `${line.length}`);
  assert.match(line, / 외 \d+개$/);
  assert.match(line, /: "0_가{80,90}…\(\d+자 더\), "1_/); // 값 하나는 90자에서 잘려 "…(n자 더)" 로 끝난다
  const shown = (line.match(/…\(\d+자 더\)/g) ?? []).length;
  assert.ok(shown >= 1 && shown <= 20);
  assert.equal(Number(line.match(/ 외 (\d+)개$/)[1]), 25 - shown); // 꼬리의 수가 실제로 못 적은 값 수와 맞는다
  // 한 줄이 그래도 2,000자를 넘는 경우(아주 긴 메시지)도 접미사까지 합쳐 2,000자 안이다.
  const msg = formatWriteResult(reject({ code: "INVALID", message: "가".repeat(5000), choices: null }), ctx()).text;
  for (const l of msg.split("\n")) assert.ok(l.length <= 2000, `${l.length}`);
});

test("사용자·세션·출처가 없는 델타도 undefined·null 을 글에 적지 않는다", () => {
  const bare = { rev: 14, changes: DELTA_ME_13.changes };
  const out = formatChangesText({ rev: 14, reload: false, deltas: [bare] }, { view: VIEW, sinceRev: 13, mySession: "claude-test" });
  assert.doesNotMatch(out.text, /undefined|null/);
  assert.match(out.text, /^rev 14 \?\/\? \?: column upsert TB_MCM_SEC_MENU\.MENU_NM/m);
  const line = formatWriteResult(APPLIED_13, ctx({ others: { reload: false, deltas: [bare] } })).text;
  assert.doesNotMatch(line, /undefined|null/);
});
