import { describe, expect, it } from "vitest";
import { keepDirtyRows, lossMessage, lossTargets, todayYmd, withRoleCnt, ymd } from "./rolegrp-edit";

type Row = Record<string, unknown> & { nativeeditor_status?: string };

const TODAY = "20261128";

function grp(over: Row): Row {
  return {
    ROLE_GROUP_ID: "G1", ROLE_GROUP_NM: "그룹1", USE_TP: "Y", END_ACTIVE_DATE: "9999-12-31T00:00:00",
    __origUseTp: "Y", __origEnd: "9999-12-31T00:00:00", USER_CNT: 2, ROLE_CNT: 1, nativeeditor_status: "updated",
    ...over,
  };
}

describe("c1 — 그룹 끄기 확인 대상(lossTargets)", () => {
  it("사용 여부 Y→N 이고 받은 사람·연결된 역할이 있으면 대상", () => {
    expect(lossTargets([grp({ USE_TP: "N" })], TODAY)).toEqual([{ id: "G1", nm: "그룹1", userCnt: 2 }]);
  });

  it("종료일을 오늘 이전으로 바꾸면 대상, 오늘이면 아님(끝 날 포함)", () => {
    expect(lossTargets([grp({ END_ACTIVE_DATE: "20261127" })], TODAY)).toHaveLength(1);
    expect(lossTargets([grp({ END_ACTIVE_DATE: "2026-11-28" })], TODAY)).toHaveLength(0);
  });

  it("이름만 고침·사람 0명·역할 0개·원래 꺼진 그룹·안 바뀐 줄은 대상 아님", () => {
    expect(lossTargets([grp({ ROLE_GROUP_NM: "새 이름" })], TODAY)).toHaveLength(0);
    expect(lossTargets([grp({ USE_TP: "N", USER_CNT: 0 })], TODAY)).toHaveLength(0);
    expect(lossTargets([grp({ USE_TP: "N", ROLE_CNT: 0 })], TODAY)).toHaveLength(0);
    expect(lossTargets([grp({ USE_TP: "N", __origUseTp: "N" })], TODAY)).toHaveLength(0);
    expect(lossTargets([grp({ USE_TP: "N", nativeeditor_status: "" })], TODAY)).toHaveLength(0);
  });

  it("시작일을 내일로 옮기면 대상(서버 활성 기준과 같다)", () => {
    expect(lossTargets([grp({ START_ACTIVE_DATE: "20261129" })], TODAY)).toHaveLength(1);
  });

  it("문구 — 그룹 하나는 「사용자 n명이 연결된 역할을 잃습니다」, 여럿은 그룹마다 사람 수", () => {
    expect(lossMessage([{ id: "G1", nm: "그룹1", userCnt: 2 }])).toBe(
      "「그룹1」 그룹을 끄면 이 그룹을 받은 사용자 2명이 연결된 역할을 잃습니다. 저장할까요?");
    expect(lossMessage([{ id: "G1", nm: "", userCnt: 2 }, { id: "G2", nm: "둘", userCnt: 3 }])).toContain("「G1」 2명, 「둘」 3명");
  });
});

describe("c2 — 매핑 저장 뒤 그룹 행 변경 보존(keepDirtyRows)", () => {
  const key = (r: Row) => String(r.ROLE_GROUP_ID ?? "");

  it("변경 표시를 잃은 같은 키 행은 저장 전 변경 행으로 되돌린다", () => {
    const dirty = [grp({ ROLE_GROUP_NM: "고친 이름" })];
    const reset: Row[] = [{ ...dirty[0], ROLE_GROUP_NM: "옛 이름", nativeeditor_status: "" }, { ROLE_GROUP_ID: "G2", nativeeditor_status: "" }];
    const out = keepDirtyRows(reset, dirty, key);
    expect(out[0]).toMatchObject({ ROLE_GROUP_NM: "고친 이름", nativeeditor_status: "updated" });
    expect(out[1]).toBe(reset[1]);
  });

  it("변경 표시가 남아 있거나 저장 전 변경이 없으면 같은 배열", () => {
    const rows = [grp({ ROLE_GROUP_NM: "고친 이름" })];
    expect(keepDirtyRows(rows, rows, key)).toBe(rows);
    expect(keepDirtyRows(rows, [], key)).toBe(rows);
  });
});

describe("c1 — 매핑 저장 뒤 연결된 역할 수(withRoleCnt)", () => {
  it("그 그룹 행만 ROLE_CNT 를 바꾸고 변경 표시는 그대로, 같으면 같은 배열", () => {
    const rows: Row[] = [grp({ ROLE_CNT: 0 }), { ROLE_GROUP_ID: "G2", ROLE_CNT: 1 }];
    const out = withRoleCnt(rows, "G1", 2);
    expect(out[0]).toMatchObject({ ROLE_CNT: 2, nativeeditor_status: "updated" });
    expect(out[1]).toBe(rows[1]);
    expect(withRoleCnt(out, "G1", 2)).toBe(out);
  });
});

describe("keepDirtyRows merge — 지금 행의 그리드 키를 지킨다", () => {
  it("merge 결과를 쓴다", () => {
    const dirty: Row[] = [grp({ __rowId: "rg-0-G1", ROLE_GROUP_NM: "고친 이름" })];
    const cur: Row[] = [{ ...dirty[0], __rowId: "rg-3-G1", nativeeditor_status: "" }];
    const out = keepDirtyRows(cur, dirty, (r) => String(r.ROLE_GROUP_ID), (c, d) => ({ ...d, __rowId: c.__rowId }));
    expect(out[0]).toMatchObject({ __rowId: "rg-3-G1", ROLE_GROUP_NM: "고친 이름", nativeeditor_status: "updated" });
  });
});

describe("날짜 도우미", () => {
  it("ymd · todayYmd", () => {
    expect(ymd("2026-11-28T00:00:00")).toBe("20261128");
    expect(ymd("20261128")).toBe("20261128");
    expect(ymd(null)).toBe("");
    expect(todayYmd(new Date("2026-01-05T03:00:00Z"))).toBe("20260105");
    expect(todayYmd(new Date("2026-01-04T15:30:00Z"))).toBe("20260105"); // KST 00:30
  });
});
