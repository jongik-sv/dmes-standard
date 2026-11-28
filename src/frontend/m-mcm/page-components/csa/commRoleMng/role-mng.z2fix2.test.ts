import { describe, expect, it } from "vitest";
import { firstMissingRoleNm, keepSavedRole, withRoleField } from "./role-perm";

type Row = Record<string, unknown> & { nativeeditor_status?: string };

describe("z2fix2 d — 역할명 필수", () => {
  it("추가·수정 줄의 빈 역할명(공백만 포함)을 찾고, 삭제·안 바뀐 줄은 보지 않는다", () => {
    const rows: Row[] = [
      { ROLE_ID: "R0", ROLE_NM: "", nativeeditor_status: "" },
      { ROLE_ID: "R1", ROLE_NM: "", nativeeditor_status: "deleted" },
      { ROLE_ID: "R2", ROLE_NM: "역할 2", nativeeditor_status: "updated" },
      { ROLE_ID: "R3", ROLE_NM: "  ", nativeeditor_status: "inserted" },
    ];
    expect(firstMissingRoleNm(rows)?.ROLE_ID).toBe("R3");
    expect(firstMissingRoleNm(rows.slice(0, 3))).toBeNull();
  });
});

describe("z2fix2 e — 저장 뒤 새 역할 유지", () => {
  const saved: Row[] = [
    { ROLE_ID: "R1", ROLE_NM: "역할 1" },
    { ROLE_ID: "role_MN_A_NEW", ROLE_NM: "새 역할", GROUP_CNT: 0 },
  ];

  it("다시 조회한 목록에 저장한 역할이 없으면 저장 응답의 그 줄을 맨 위에 붙인다", () => {
    const list: Row[] = [{ ROLE_ID: "R1", ROLE_NM: "역할 1" }];
    const out = keepSavedRole(list, "role_MN_A_NEW", saved);
    expect(out.map((r) => r.ROLE_ID)).toEqual(["role_MN_A_NEW", "R1"]);
  });

  it("목록에 있거나 고를 역할이 없거나 저장 응답에도 없으면 목록 그대로", () => {
    const list: Row[] = [{ ROLE_ID: "R1" }];
    expect(keepSavedRole(list, "R1", saved)).toBe(list);
    expect(keepSavedRole(list, undefined, saved)).toBe(list);
    expect(keepSavedRole(list, "R_NONE", saved)).toBe(list);
    expect(keepSavedRole(list, "role_MN_A_NEW", undefined)).toBe(list);
  });
});

describe("z2fix2 c — 기존 역할의 ROLE_ID 는 바뀌지 않는다(역할 MENU_ID 없앰, 2026-11-28)", () => {
  it("ID 가 ROLE_ID 전체인 기존 행: 이름·ID 를 고쳐도 ROLE_ID 그대로(옛 role_ 접두 ROLE_ID 도 그대로)", () => {
    const r: Row = { ROLE_ID: "role_csa_x", ROLE_NM: "가", ID: "role_csa_x", nativeeditor_status: "" };
    expect(withRoleField(r, "ROLE_NM", "나")).toMatchObject({ ROLE_ID: "role_csa_x", ROLE_NM: "나", nativeeditor_status: "updated" });
    expect(withRoleField(r, "ID", "role_csa_x2").ROLE_ID).toBe("role_csa_x");
  });

  it("새 행: ROLE_ID = 입력한 ID(앞뒤 공백 제거), 접두를 붙이지 않는다", () => {
    const n: Row = { ROLE_ID: "", ROLE_NM: "", ID: "", nativeeditor_status: "inserted" };
    const a = withRoleField(n, "ID", " MY_ROLE ");
    expect(a).toMatchObject({ ROLE_ID: "MY_ROLE", nativeeditor_status: "inserted" });
    expect(String(a.ROLE_ID).startsWith("role_")).toBe(false);
  });
});
