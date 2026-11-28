import { describe, expect, it } from "vitest";
import { bizErrorText, parseBizError } from "@/lib/utils/biz-error";
import {
  addDaysYmd,
  fmtDateTime,
  handoverText,
  isHrLeaveOnly,
  isSelf,
  joinReason,
  ownedSummary,
  ownedTotal,
  retireText,
  retrySummary,
  stateActionsOf,
  stateNotes,
  tempPwdUntil,
} from "./userState";

const row = (USER_ST: string, extra: Record<string, unknown> = {}) => ({ USER_ST, USE_TP: "Y", ...extra });

describe("stateActionsOf — 상태별 단추(시안 상세 영역)", () => {
  it("활성: 비활성화 · 퇴직 처리", () => {
    expect(stateActionsOf(row("ACTIVE"), null)).toEqual(["suspend", "retire"]);
  });

  it("잠금: 잠금 해제 · 비활성화 · 퇴직 처리", () => {
    expect(stateActionsOf(row("LOCKED"), null)).toEqual(["unlock", "suspend", "retire"]);
  });

  it("관리자 비활성(USE_TP=N): 다시 사용 · 퇴직 처리", () => {
    expect(stateActionsOf(row("SUSPENDED", { USE_TP: "N" }), null)).toEqual(["resume", "retire"]);
    // 관리자 비활성 + 인사 휴직: 다시 사용은 보인다(관리자 몫만 푼다)
    expect(stateActionsOf(row("SUSPENDED", { USE_TP: "N", HR_ST: "LEAVE" }), null)).toEqual(["resume", "retire"]);
  });

  it("인사 휴직만(USE_TP=Y, HR_ST=LEAVE): 다시 사용 없음", () => {
    const r = row("SUSPENDED", { HR_ST: "LEAVE" });
    expect(isHrLeaveOnly(r)).toBe(true);
    expect(stateActionsOf(r, null)).toEqual(["retire"]);
  });

  it("기한 밖: 퇴직 처리만(날짜는 상세 폼에서 고친다)", () => {
    expect(stateActionsOf(row("EXPIRED"), null)).toEqual(["retire"]);
  });

  it("퇴직: 담당 데이터가 남으면 인계, ERP 인사 퇴직이 아니면 재생성", () => {
    expect(stateActionsOf(row("RETIRED", { USE_TP: "N" }), 3)).toEqual(["handover", "reRegCmUser"]);
    expect(stateActionsOf(row("RETIRED", { USE_TP: "N" }), 0)).toEqual(["reRegCmUser"]);
    expect(stateActionsOf(row("RETIRED", { USE_TP: "N" }), null)).toEqual(["reRegCmUser"]);
    expect(stateActionsOf(row("RETIRED", { HR_ST: "RETIRED" }), 2)).toEqual(["handover"]);
  });

  it("신규 행·행 없음: 단추 없음", () => {
    expect(stateActionsOf({ USE_TP: "Y" }, null)).toEqual([]);
    expect(stateActionsOf(null, null)).toEqual([]);
  });
});

describe("stateNotes", () => {
  it("인사 휴직만이면 관리자가 풀 수 없다고 알린다", () => {
    expect(stateNotes(row("SUSPENDED", { HR_ST: "LEAVE" }), null)[0]).toContain("관리자가 풀 수 없습니다");
  });

  it("수동 관리 계정은 관리자 직접 처리 안내, 퇴직자는 빼고", () => {
    expect(stateNotes(row("ACTIVE", { MANAGE_TP: "MANUAL" }), null).join(" ")).toContain("수동 관리 계정");
    expect(stateNotes(row("RETIRED", { MANAGE_TP: "MANUAL" }), null).join(" ")).not.toContain("수동 관리 계정");
  });

  it("퇴직자 담당 데이터 건수", () => {
    expect(stateNotes(row("RETIRED"), 7)[0]).toBe("담당 데이터 7건이 아직 이 사람에게 있습니다. 인계가 필요합니다.");
    expect(stateNotes(row("RETIRED"), 0)[0]).toBe("역할 회수와 인계가 끝났습니다.");
  });
});

// 공용 유틸(@/lib/utils/biz-error)을 사용자 관리 서버 코드로 확인한다. 유틸 자체 시험은 lib/utils/biz-error.test.ts.
describe("업무 오류 문구", () => {
  it("「CODE: 문구」 에서 문구만", () => {
    expect(parseBizError("LAST_SYSADMIN: 마지막 시스템관리자는 막을 수 없습니다")).toEqual({
      code: "LAST_SYSADMIN",
      codes: ["LAST_SYSADMIN"],
      text: "마지막 시스템관리자는 막을 수 없습니다",
    });
    expect(bizErrorText(new Error("HR_LEAVE: 인사 휴직은 인사 복직 정보가 오면 풀립니다"))).toBe(
      "인사 휴직은 인사 복직 정보가 오면 풀립니다",
    );
  });

  it("앞에 붙은 코드가 여럿이면 모두 뗀다", () => {
    expect(bizErrorText(new Error("E010: SELF_LOCKOUT: 자기 계정은 잠글 수 없습니다"))).toBe("자기 계정은 잠글 수 없습니다");
  });

  it("코드가 없으면 그대로, 비면 기본 문구", () => {
    expect(parseBizError("비활성 사유를 고르세요")).toEqual({ code: null, codes: [], text: "비활성 사유를 고르세요" });
    expect(bizErrorText(new Error(""), "실패")).toBe("실패");
  });
});

describe("인계·퇴직 결과 문구", () => {
  const items = [
    { KIND: "CODE", KIND_NM: "MDM 코드", CNT: 12, SKIPPED: "N" },
    { KIND: "RULE", KIND_NM: "룰", CNT: 3, SKIPPED: "N" },
    { KIND: "ERD", KIND_NM: "ERD 모델", CNT: 1, SKIPPED: "Y" },
  ];

  it("합계·요약", () => {
    expect(ownedTotal(items)).toBe(16);
    expect(ownedSummary(items)).toBe("MDM 코드 12 · 룰 3 · ERD 모델 1");
  });

  it("DONE — 넘긴 건수와 못 넘긴 건수", () => {
    expect(handoverText({ HANDOVER_ST: "DONE", HANDOVER_ITEMS: items }, "이서연")).toEqual({
      text: "담당 데이터 15건을 이서연에게 넘겼습니다. 1건은 넘기지 못했습니다.",
      level: "warning",
    });
    expect(handoverText({ HANDOVER_ST: "DONE", HANDOVER_ITEMS: items.slice(0, 2) }, "이서연").level).toBe("success");
  });

  it("PENDING·FAILED — 서버 문구", () => {
    expect(handoverText({ HANDOVER_ST: "PENDING", HANDOVER_MSG: "담당 데이터는 「인계 대기」로 남았습니다" }, "")).toEqual({
      text: "담당 데이터는 「인계 대기」로 남았습니다.",
      level: "success",
    });
    expect(handoverText({ HANDOVER_ST: "FAILED", HANDOVER_MSG: "MDM 인계를 하지 못했습니다." }, "x").level).toBe("warning");
  });

  it("퇴직 결과 — 회수·해제 건수, 담당 데이터 없으면 인계 문구 생략", () => {
    expect(retireText("정하늘", { ROLE_GROUP_CNT: 2, ASSIGN_CNT: 0, HANDOVER_ST: "PENDING" }, null, false)).toEqual({
      text: "정하늘 계정을 퇴직 처리했습니다. 역할그룹 2개를 회수했습니다.",
      level: "success",
    });
    expect(
      retireText("정하늘", { ROLE_GROUP_CNT: 0, ASSIGN_CNT: 1, HANDOVER_ST: "PENDING", HANDOVER_MSG: "담당 데이터는 「인계 대기」로 남았습니다" }, null, true).text,
    ).toBe("정하늘 계정을 퇴직 처리했습니다. 사용자 쿼리 배정 1건을 해제했습니다. 담당 데이터는 「인계 대기」로 남았습니다.");
  });

  it("다시 처리 요약", () => {
    expect(retrySummary([{ PROC_ST: "DONE" }, { PROC_ST: "SKIP" }])).toEqual({ text: "2건을 처리했습니다.", level: "success" });
    expect(retrySummary([{ PROC_ST: "DONE" }, { PROC_ST: "FAIL" }]).level).toBe("warning");
  });
});

describe("작은 값 함수", () => {
  it("사유 + 메모", () => {
    expect(joinReason("퇴사", "")).toBe("퇴사");
    expect(joinReason("퇴사", " 인사팀 통보 ")).toBe("퇴사 · 인사팀 통보");
    expect(joinReason("기타", "업체 교체")).toBe("업체 교체");
  });

  it("날짜·시각 표시", () => {
    expect(fmtDateTime("2026-11-27T08:41:12")).toBe("2026-11-27 08:41");
    expect(fmtDateTime("2026-11-27")).toBe("2026-11-27");
    expect(fmtDateTime(null)).toBe("");
  });

  it("임시 비밀번호 기간(KST) — 초기화는 오늘, 새 계정은 7일 뒤", () => {
    const now = new Date("2026-11-27T15:30:00Z"); // KST 2026-11-28 00:30
    expect(tempPwdUntil("reset", now)).toBe("오늘(2026-11-28) 23:59까지");
    expect(tempPwdUntil("new", now)).toBe("7일 뒤(2026-12-05) 23:59까지");
    expect(addDaysYmd("20261228", 7)).toBe("20270104");
  });

  it("본인 판정", () => {
    expect(isSelf("Admin", "admin")).toBe(true);
    expect(isSelf("u1", "admin")).toBe(false);
    expect(isSelf("admin", "")).toBe(false);
  });
});
