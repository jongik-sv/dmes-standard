import { describe, expect, it } from "vitest";

import {
  emptyNoticeForm,
  findSavedId,
  formToSaveRow,
  formatPeriod,
  formatPeriodShort,
  roleNameMap,
  rowToForm,
  NOTICE_MDM_FIELDS,
  sameForm,
  targetLabel,
  toFormFieldErrors,
  toLocalDate,
  toLocalDateTime,
  validateNotice,
} from "../../../pages/lsh/noticeMgmt/notice-logic";
import {
  CONTENT_MAX,
  type NoticeForm,
  type NoticeRow,
} from "../../../pages/lsh/noticeMgmt/types";

const form = (patch: Partial<NoticeForm> = {}): NoticeForm => ({
  ...emptyNoticeForm(),
  TITLE: "제목",
  ...patch,
});

describe("rowToForm", () => {
  it("빈 코드값은 기본값으로, ALL 범위면 대상 역할을 비운다", () => {
    const f = rowToForm({
      NOTICE_ID: "NT202610020001",
      TITLE: "점검",
      CONTENT: null,
      NOTICE_STATUS: "",
      POST_START_DT: null,
      POST_END_DT: null,
      TARGET_SCOPE: "ALL",
      TARGET_ROLES: ["ADMIN"],
    });
    expect(f).toMatchObject({
      CONTENT: "",
      NOTICE_STATUS: "DRAFT",
      CONTENT_FORMAT: "TEXT",
      NOTICE_CATEGORY: "NORMAL",
      PIN_YN: "N",
      TARGET_SCOPE: "ALL",
      TARGET_ROLES: [],
    });
  });

  it("ROLE 범위면 역할 배열(또는 콤마 문자열)을 살린다", () => {
    const f = rowToForm({
      NOTICE_ID: "X",
      TITLE: "t",
      CONTENT: "c",
      NOTICE_STATUS: "POSTED",
      CONTENT_FORMAT: "md",
      NOTICE_CATEGORY: "URGENT",
      PIN_YN: "y",
      POST_START_DT: "2026-10-01",
      POST_END_DT: "2026-10-05",
      TARGET_SCOPE: "ROLE",
      TARGET_ROLES: "ADMIN, QA" as unknown as string[],
    });
    expect(f.CONTENT_FORMAT).toBe("MD");
    expect(f.NOTICE_CATEGORY).toBe("URGENT");
    expect(f.PIN_YN).toBe("Y");
    expect(f.TARGET_ROLES).toEqual(["ADMIN", "QA"]);
  });
});

describe("formToSaveRow", () => {
  it("ALL 범위면 TARGET_ROLES 를 빈 배열로 보내고 제목 앞뒤 공백을 걷는다", () => {
    const row = formToSaveRow(
      form({ TITLE: "  공지  ", TARGET_SCOPE: "ALL", TARGET_ROLES: ["ADMIN"] }),
      "inserted",
    );
    expect(row.TITLE).toBe("공지");
    expect(row.TARGET_ROLES).toEqual([]);
    expect(row.rowStatus).toBe("inserted");
    expect(row).not.toHaveProperty("C_AT");
  });

  it("ROLE 범위면 역할 배열을 그대로 보낸다", () => {
    const row = formToSaveRow(
      form({ TARGET_SCOPE: "ROLE", TARGET_ROLES: ["ADMIN", "QA"] }),
      "updated",
    );
    expect(row.TARGET_ROLES).toEqual(["ADMIN", "QA"]);
  });
});

describe("validateNotice", () => {
  it("제목 누락", () => {
    expect(validateNotice(form({ TITLE: "   " }))?.field).toBe("TITLE");
  });

  it("역할 지정인데 역할이 없으면 거부", () => {
    expect(
      validateNotice(form({ TARGET_SCOPE: "ROLE", TARGET_ROLES: [] }))?.field,
    ).toBe("TARGET_ROLES");
    expect(
      validateNotice(form({ TARGET_SCOPE: "ROLE", TARGET_ROLES: ["ADMIN"] })),
    ).toBeNull();
  });

  it("시작일이 종료일보다 늦으면 거부, 같은 날은 통과", () => {
    expect(
      validateNotice(
        form({ POST_START_DT: "2026-10-05", POST_END_DT: "2026-10-01" }),
      )?.message,
    ).toBe("시작일이 종료일보다 늦을 수 없습니다.");
    expect(
      validateNotice(
        form({ POST_START_DT: "2026-10-05", POST_END_DT: "2026-10-05" }),
      ),
    ).toBeNull();
  });

  it("게시중인데 게시기간이 비면 거부", () => {
    expect(
      validateNotice(
        form({ NOTICE_STATUS: "POSTED", POST_START_DT: "2026-10-01" }),
      )?.field,
    ).toBe("POST_START_DT");
  });

  it("본문 상한을 넘으면 거부", () => {
    expect(
      validateNotice(form({ CONTENT: "a".repeat(CONTENT_MAX) })),
    ).toBeNull();
    expect(
      validateNotice(form({ CONTENT: "a".repeat(CONTENT_MAX + 1) }))?.field,
    ).toBe("CONTENT");
  });
});

describe("sameForm", () => {
  it("역할 순서와 audit 값은 변경으로 보지 않는다", () => {
    const a = form({
      TARGET_SCOPE: "ROLE",
      TARGET_ROLES: ["A", "B"],
      C_AT: "x",
    });
    const b = form({
      TARGET_SCOPE: "ROLE",
      TARGET_ROLES: ["B", "A"],
      C_AT: "y",
    });
    expect(sameForm(a, b)).toBe(true);
    expect(sameForm(a, { ...a, CONTENT_FORMAT: "HTML" })).toBe(false);
  });
});

describe("표시 문자열", () => {
  it("UTC Instant 를 현지 시각으로 바꾼다", () => {
    const iso = "2026-10-02T04:35:17.123Z";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    expect(toLocalDate(iso)).toBe(local);
    expect(toLocalDateTime(iso)).toBe(
      `${local} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
    expect(toLocalDate("")).toBe("");
    expect(toLocalDate("not-a-date")).toBe("");
  });

  it("게시기간", () => {
    expect(formatPeriod("2026-10-01", "2026-10-05")).toBe(
      "2026-10-01 ~ 2026-10-05",
    );
    expect(formatPeriod("2026-10-01", "")).toBe("2026-10-01 ~");
    expect(formatPeriod(null, null)).toBe("");
  });

  it("게시 대상 — 이름으로 바꾸고, 목록에 없는 ID 는 그대로, 셋 이상은 요약", () => {
    const names = roleNameMap([
      { ROLE_ID: "ADMIN", ROLE_NM: "관리자" },
      { ROLE_ID: "QA", ROLE_NM: "품질" },
    ]);
    expect(targetLabel("ALL", [], names)).toEqual({
      full: "전체",
      short: "전체",
    });
    expect(targetLabel("ROLE", ["ADMIN", "GHOST"], names)).toEqual({
      full: "관리자, GHOST",
      short: "관리자, GHOST",
    });
    expect(targetLabel("ROLE", ["ADMIN", "QA", "GHOST", "X"], names)).toEqual({
      full: "관리자, 품질, GHOST, X",
      short: "관리자, 품질 외 2",
    });
    expect(targetLabel("ROLE", [], names).short).toBe("역할 미지정");
  });
});

describe("findSavedId", () => {
  const row = (id: string, title: string): NoticeRow => ({
    NOTICE_ID: id,
    TITLE: title,
    CONTENT: "",
    NOTICE_STATUS: "DRAFT",
    POST_START_DT: null,
    POST_END_DT: null,
  });

  it("수정이면 폼의 ID", () => {
    expect(findSavedId([], form({ NOTICE_ID: "NT1" }), new Set())).toBe("NT1");
  });

  it("신규면 저장 전에 없던 같은 제목 행 중 가장 큰 ID", () => {
    const list = [
      row("NT202610010001", "안내"),
      row("NT202610020001", "안내"),
      row("NT202610020002", "다른 글"),
    ];
    expect(
      findSavedId(list, form({ TITLE: " 안내 " }), new Set(["NT202610010001"])),
    ).toBe("NT202610020001");
    expect(findSavedId(list, form({ TITLE: "없음" }), new Set())).toBe("");
  });
});

describe("findSavedId — save 응답 savedIds", () => {
  it("savedIds 가 있으면 첫 값을 쓴다(추정보다 우선)", () => {
    expect(
      findSavedId([], form({ TITLE: "안내" }), new Set(), ["NT202610020007"]),
    ).toBe("NT202610020007");
    expect(
      findSavedId([], form({ NOTICE_ID: "NT1" }), new Set(), [" NT1 "]),
    ).toBe("NT1");
  });

  it("savedIds 가 없거나 비면 추정 방식으로 대체한다", () => {
    expect(
      findSavedId([], form({ NOTICE_ID: "NT1" }), new Set(), undefined),
    ).toBe("NT1");
    expect(findSavedId([], form({ NOTICE_ID: "NT1" }), new Set(), [])).toBe(
      "NT1",
    );
    expect(findSavedId([], form({ NOTICE_ID: "NT1" }), new Set(), "NT9")).toBe(
      "NT1",
    );
  });
});

describe("formatPeriodShort", () => {
  it("목록 칸에는 월-일만 보인다", () => {
    expect(formatPeriodShort("2026-10-01", "2026-10-05")).toBe("10-01~10-05");
    expect(formatPeriodShort("2026-10-01", null)).toBe("10-01~");
    expect(formatPeriodShort("", "")).toBe("");
  });
});

describe("MDM 칸 오류 — toFormFieldErrors", () => {
  it("MDM 에 연결한 칸은 서버 MdmValidator 가 검사하는 TITLE 하나다", () => {
    expect([...NOTICE_MDM_FIELDS]).toEqual(["TITLE"]);
  });

  it("서버 오류의 field 를 폼 칸에 붙인다 — 저장은 한 행이라 rowIndex(0)는 보지 않는다", () => {
    expect(
      toFormFieldErrors([
        { rowIndex: 0, field: "TITLE", message: "제목은(는) 최대 1000자입니다" },
        { rowIndex: 0, field: "PIN_YN", message: "상단 고정 값이 올바르지 않습니다" },
      ]),
    ).toEqual({
      TITLE: "제목은(는) 최대 1000자입니다",
      PIN_YN: "상단 고정 값이 올바르지 않습니다",
    });
  });

  it("같은 칸은 첫 문구만, 소문자 field 는 대문자로 맞추고, 폼에 없는 칸은 버린다", () => {
    expect(
      toFormFieldErrors([
        { field: "title", message: "첫째" },
        { field: "TITLE", message: "둘째" },
        { field: "NOPE", message: "없는 칸" },
        { field: "rowStatus", message: "폼 값이 아님" },
      ]),
    ).toEqual({ TITLE: "첫째" });
  });

  it("오류가 없으면 빈 객체", () => {
    expect(toFormFieldErrors([])).toEqual({});
  });
});
