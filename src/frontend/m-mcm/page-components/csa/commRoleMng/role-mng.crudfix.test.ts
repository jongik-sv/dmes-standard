import { describe, expect, it } from "vitest";
import { roleDeleteBlock } from "./role-perm";

describe("c4 — 쓰는 역할 삭제 막기(roleDeleteBlock)", () => {
  it("퍼미션·그룹이 있으면 수를 넣어 막는다", () => {
    expect(roleDeleteBlock({ ROLE_ID: "role_csa_CT", GROUP_CNT: 1, PERM_CNT: 2, nativeeditor_status: "" }))
      .toBe("「role_csa_CT」 역할은 퍼미션 2건·그룹 1개에서 쓰는 역할이라 지울 수 없습니다. 퍼미션과 그룹 연결을 먼저 빼세요.");
    expect(roleDeleteBlock({ ROLE_ID: "R1", GROUP_CNT: 0, PERM_CNT: 1 })).toContain("퍼미션 1건·그룹 0개");
  });

  it("SYSADMIN(별칭 포함)은 쓰는 곳이 없어도 막고, 퍼미션 -1(모두)을 수로 쓰지 않는다", () => {
    expect(roleDeleteBlock({ ROLE_ID: "SYSADMIN", GROUP_CNT: 0, PERM_CNT: -1 })).toBe("「SYSADMIN」 시스템관리자 역할은 지울 수 없습니다.");
    expect(roleDeleteBlock({ ROLE_ID: "ROLE_SYSADMIN" })).toContain("시스템관리자");
  });

  it("안 쓰는 역할·새 행은 지울 수 있다", () => {
    expect(roleDeleteBlock({ ROLE_ID: "R2", GROUP_CNT: 0, PERM_CNT: 0 })).toBeNull();
    expect(roleDeleteBlock({ ROLE_ID: "R3" })).toBeNull();
    expect(roleDeleteBlock({ ROLE_ID: "R4", GROUP_CNT: 3, nativeeditor_status: "inserted" })).toBeNull();
  });
});
