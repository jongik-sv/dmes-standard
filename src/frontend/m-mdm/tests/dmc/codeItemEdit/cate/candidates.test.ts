// D-101 — 코드 편집 화면에 합친 카테고리 탭의 transfer 후보·소속 diff(순수 함수). 코드 탭에서 추가만 하고 저장하지
// 않은 코드는 후보에 `unsaved` 로 보이고, 삭제 표시한 코드는 가능 쪽에서 빠지며 소속 diff 에도 실리지 않는다.
// (경과 시간 단언이 있는 transfer.test.ts 는 PERF 목록이라 따로 돈다 — 이 파일은 기본 스위트에서 돈다.)
import { describe, expect, it } from "vitest";
import {
  memberChangesOf, transferCandidates, visibleList, type CodeRowLike, type TransferItem,
} from "../../../../pages/dmc/codeItemEdit/cate/transfer";

const server: TransferItem[] = [
  { code: "A", name: "에이", lvl1: "G" },
  { code: "B", name: "비", lvl1: "G" },
];

const row = (code: string, local: CodeRowLike["__local"], extra: Partial<CodeRowLike> = {}): CodeRowLike => ({
  code, __local: local, ...extra,
});

describe("transferCandidates", () => {
  it("코드 탭 변경이 없으면 서버 목록 그대로", () => {
    expect(transferCandidates(server, [row("A", "none"), row("B", "edited")])).toEqual(server);
  });

  it("코드를 적은 새 행은 미저장(unsaved)으로 뒤에 붙고, 코드가 빈 새 행·서버에 있는 코드는 붙지 않는다", () => {
    const out = transferCandidates(server, [
      row("N1", "new", { name: "새 코드", lvl1: "H" }), row("", "new"), row(" ", "new"), row("A", "new"),
    ]);
    expect(out.map((it) => it.code)).toEqual(["A", "B", "N1"]);
    expect(out[2]).toEqual({ code: "N1", name: "새 코드", lvl1: "H", mark: "unsaved" });
    expect(out[0].mark).toBeUndefined();
  });

  it("삭제 표시한 서버 코드는 deleted 로 표시한다", () => {
    const out = transferCandidates(server, [row("B", "deleted")]);
    expect(out.find((it) => it.code === "B")?.mark).toBe("deleted");
  });
});

describe("visibleList — 삭제 표시", () => {
  it("삭제 표시한 코드는 가능 쪽에서 빠지고, 소속이면 소속 쪽에 남는다", () => {
    const items = transferCandidates(server, [row("A", "deleted"), row("B", "deleted")]);
    const members = new Set(["B"]);
    expect(visibleList(items, members, "available", "", null)).toEqual([]);
    expect(visibleList(items, members, "member", "", null).map((it) => it.code)).toEqual(["B"]);
  });
});

describe("memberChangesOf", () => {
  const original = new Map([["T1", new Set(["A"])]]);

  it("카테고리마다 diffMembers 결과를 모은다", () => {
    const current = new Map([["T1", new Set(["B"])], ["T2", new Set(["A"])]]);
    expect(memberChangesOf(original, current, server, new Set(["T1", "T2"]))).toEqual([
      { rowStatus: "DELETED", cateId: "T1", code: "A" },
      { rowStatus: "ADDED", cateId: "T1", code: "B" },
      { rowStatus: "ADDED", cateId: "T2", code: "A" },
    ]);
  });

  it("미저장 새 코드를 소속에 넣으면 ADDED 로 보낸다", () => {
    const items = transferCandidates(server, [row("N1", "new")]);
    const current = new Map([["T1", new Set(["A", "N1"])]]);
    expect(memberChangesOf(original, current, items, new Set(["T1"])))
      .toEqual([{ rowStatus: "ADDED", cateId: "T1", code: "N1" }]);
  });

  it("후보에서 사라진 코드(옮긴 뒤 코드를 고친 새 행)의 ADDED 는 뺀다", () => {
    const items = transferCandidates(server, [row("N2", "new")]);
    const current = new Map([["T1", new Set(["A", "N1"])]]);
    expect(memberChangesOf(original, current, items, new Set(["T1"]))).toEqual([]);
  });

  it("코드 탭에서 삭제 표시한 코드의 소속 행은 보내지 않는다(코드 삭제가 소속을 함께 닫는다)", () => {
    const items = transferCandidates(server, [row("A", "deleted"), row("B", "deleted")]);
    const current = new Map([["T1", new Set(["B"])]]);
    expect(memberChangesOf(original, current, items, new Set(["T1"]))).toEqual([]);
  });

  // § 결함 1 — 없어진 카테고리의 소속 편집은 저장에 실리지 않는다(회귀 테스트, page-render.test.ts 의 통합 시나리오와 짝).
  it("추가 뒤 취소해 목록에서 빠진 카테고리(openCateIds 에 없음)의 소속 행은 보내지 않는다", () => {
    // 새 TABLE 카테고리 T-NEW 에 소속을 옮긴 뒤 취소하면 useCategoryEdit 의 rows 에서 빠져 openCateIds 에도 없다.
    const current = new Map([["T1", new Set(["A"])], ["T-NEW", new Set(["A", "B"])]]);
    expect(memberChangesOf(original, current, server, new Set(["T1"]))).toEqual([]);
  });

  it("닫은(기존) 카테고리의 소속 행도 openCateIds 에 없으면 보내지 않는다(닫기가 소속을 함께 닫는다)", () => {
    // T1 은 원래 있던 카테고리를 닫은(rowStatus DELETED) 경우 — useCategoryEdit 의 openCateIds 가 __local "deleted"
    // 행을 뺀다. 소속을 옮긴 적이 있어도(current 에 남아 있어도) 저장 diff 에는 실리지 않는다.
    const current = new Map([["T1", new Set(["A", "B"])]]);
    expect(memberChangesOf(original, current, server, new Set())).toEqual([]);
  });

  it("한 번도 목록에 없던 카테고리의 소속 행은 어떤 경우에도 보내지 않는다", () => {
    const current = new Map([["UNKNOWN", new Set(["A"])]]);
    expect(memberChangesOf(new Map(), current, server, new Set(["T1"]))).toEqual([]);
  });
});
