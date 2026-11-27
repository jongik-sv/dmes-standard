/** f3 리뷰 고침 시험 — 초안 맞추기(rebaseDraft)·일괄 등록 한 번 복사·서명 캐시·새 실패 코드·충돌 글·이력 기간. */
import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  HISTORY_MAX_DAYS,
  benchErrorText,
  changeKey,
  conflictText,
  defaultHistoryRange,
  draftFromRows,
  draftRows,
  draftSig,
  historyRangeError,
  linkSig,
  localDate,
  minusDays,
  parseYmd,
  permBaseOf,
  permSig,
  rebaseDraft,
  roleSig,
  setRegister,
  type DraftMap,
} from "./draft";
import { indexBench, toRolePermMap, type RolePermMap } from "./model";
import { PermApplyError, type PermChangeRow, type RolePermRow } from "./types";

const link = (TP: "USER_GRP" | "GRP_ROLE", KEY1: string, KEY2: string, OP: "ADD" | "DEL"): PermChangeRow => ({ TP, KEY1, KEY2, OP, BTN_PERM: null, POPUP_PERM: null });
const perm = (KEY1: string, KEY2: string, OP: "ADD" | "UPD" | "DEL", BTN_PERM: string | null = "search", POPUP_PERM: string | null = ""): PermChangeRow => ({
  TP: "ROLE_OBJ", KEY1, KEY2, OP, BTN_PERM, POPUP_PERM,
});
const permRow = (OBJECT_ID: string, BTN_PERM: string | null, POPUP_PERM: string | null = null): RolePermRow => ({
  ROLE_ID: "R1", OBJECT_ID, OBJECT_NM: OBJECT_ID, MENU_PATH: "", OBJ_BTN_PERM: "search,save,delete", OBJ_POPUP_PERM: "pop1", OBJ_READ_PERM: "search",
  BTN_PERM, POPUP_PERM, DATA_PERM: null,
});

const bench = indexBench({
  users: [{ USER_ID: "u1", USER_NM: "가", DEPT_NM: null, USE_TP: "Y" } as never],
  groups: [{ ROLE_GROUP_ID: "G1", ROLE_GROUP_NM: "그룹1", USE_TP: "Y", USER_CNT: 1 }, { ROLE_GROUP_ID: "G2", ROLE_GROUP_NM: "그룹2", USE_TP: "Y", USER_CNT: 0 }] as never,
  roles: [{ ROLE_ID: "R1", ROLE_NM: "역할1" }, { ROLE_ID: "R2", ROLE_NM: "역할2" }] as never,
  userGroups: [{ USER_ID: "u1", ROLE_GROUP_ID: "G1" }],
  groupRoles: [{ ROLE_GROUP_ID: "G1", ROLE_ID: "R1" }],
});

describe("rebaseDraft — 다시 읽은 현재 값에 초안 맞추기(f3 리뷰 3)", () => {
  it("소속 줄: 이미 현재 값과 같은 ADD·DEL 은 지우고, 아직 다른 줄은 그대로 둔다", () => {
    const d = draftFromRows([
      link("USER_GRP", "u1", "G1", "ADD"), // 이미 소속 → 지움
      link("USER_GRP", "u1", "G2", "ADD"), // 아직 없음 → 둠
      link("GRP_ROLE", "G1", "R2", "DEL"), // 이미 없음 → 지움
      link("GRP_ROLE", "G1", "R1", "DEL"), // 아직 있음 → 둠
    ]);
    const r = rebaseDraft(d, bench, new Map());
    expect(draftRows(r).map((c) => `${c.KEY1}|${c.KEY2}|${c.OP}`)).toEqual(["u1|G2|ADD", "G1|R1|DEL"]);
  });

  it("퍼미션 줄: 행이 생긴 ADD → UPD, 행이 지워진 UPD → ADD, 지울 행이 없는 DEL·현재와 같아진 줄은 지움", () => {
    const perms = new Map<string, RolePermMap>([
      ["R1", toRolePermMap([permRow("o1", "search"), permRow("o2", null), permRow("o3", null), permRow("o4", "search,save")])],
    ]);
    const d = draftFromRows([
      perm("R1", "o1", "ADD", "search,save"), // 행이 이미 있음 → UPD
      perm("R1", "o2", "UPD", "search"), // 행이 없어짐 → ADD
      perm("R1", "o3", "DEL", null, null), // 지울 행 없음 → 지움
      perm("R1", "o4", "UPD", "save,search"), // 현재와 같음(순서 무관) → 지움
    ]);
    const r = rebaseDraft(d, bench, perms);
    expect(draftRows(r).map((c) => `${c.KEY2}|${c.OP}|${c.BTN_PERM}`)).toEqual(["o1|UPD|search,save", "o2|ADD|search"]);
  });

  it("역할 퍼미션을 아직 읽지 않았거나 오브젝트 줄이 없으면 건드리지 않는다(다시 읽은 직후 빈 캐시로 지우지 않는다)", () => {
    const d = draftFromRows([perm("R1", "o1", "ADD"), perm("R2", "x", "UPD"), perm("SYSADMIN", "o1", "DEL", null, null)]);
    expect(rebaseDraft(d, bench, new Map())).toBe(d);
    expect(rebaseDraft(d, bench, new Map([["R1", toRolePermMap([permRow("zz", null)])]]))).toBe(d);
  });

  it("바뀐 것이 없으면 같은 객체(다시 그리지 않는다)", () => {
    const d = draftFromRows([link("USER_GRP", "u1", "G2", "ADD")]);
    expect(rebaseDraft(d, bench, new Map())).toBe(d);
  });
});

describe("setRegister — 한 번 복사·같은 화면 한 번(f3 리뷰 4·8)", () => {
  const cur = toRolePermMap([permRow("a", null), permRow("b", null), permRow("c", "search")]);
  const baseOf = (oid: string) => permBaseOf(cur.get(oid));
  const isReg = (oid: string) => oid === "c";

  it("같은 OBJECT_ID 가 두 번 와도 한 번만 센다", () => {
    const r = setRegister(EMPTY_DRAFT, "R1", ["a", "b", "a", "b"], true, baseOf, isReg);
    expect(r.changed).toBe(2);
    expect(r.draft.size).toBe(2);
  });

  it("바뀐 것이 없으면 같은 초안 객체, 입력 초안은 고치지 않는다", () => {
    const d: DraftMap = draftFromRows([perm("R1", "x", "ADD")]);
    expect(setRegister(d, "R1", ["c"], true, baseOf, isReg).draft).toBe(d);
    const r = setRegister(d, "R1", ["a", "c"], false, baseOf, isReg);
    expect(r.draft).not.toBe(d);
    expect(d.size).toBe(1);
    expect(r.draft.get(changeKey("ROLE_OBJ", "R1", "c"))?.OP).toBe("DEL");
  });

  it("큰 모듈(2,000 화면)도 한 번에 끝난다", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `s${i}`);
    const big = toRolePermMap(ids.map((id) => permRow(id, null)));
    const t = performance.now();
    const r = setRegister(EMPTY_DRAFT, "R1", ids, true, (oid) => permBaseOf(big.get(oid)), () => false);
    expect(r.changed).toBe(2000);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("서명 캐시(f3 리뷰 4)", () => {
  it("draftSig 는 JSON.stringify(draftRows) 와 같고, 같은 Map 이면 같은 글을 돌려준다", () => {
    const d = draftFromRows([link("USER_GRP", "u1", "G2", "ADD"), perm("R1", "o1", "ADD"), perm("R2", "o2", "UPD", "save")]);
    expect(draftSig(d)).toBe(JSON.stringify(draftRows(d)));
    expect(linkSig(d)).toBe(JSON.stringify(draftRows(d).filter((c) => c.TP !== "ROLE_OBJ")));
    expect(permSig(d)).toBe(JSON.stringify(draftRows(d).filter((c) => c.TP === "ROLE_OBJ")));
    expect(roleSig(d, "R2")).toBe(JSON.stringify(draftRows(d).filter((c) => c.TP === "ROLE_OBJ" && c.KEY1 === "R2")));
    expect(roleSig(d, "R9")).toBe("[]");
    expect(draftSig(EMPTY_DRAFT)).toBe("[]");
  });
});

describe("새 실패 코드·충돌 글(bench-be f3 추가)", () => {
  it("PERM_BAD_VALUE 는 서버 설명을 붙이고, PERM_BUSY 는 서버 문구를 그대로(없으면 기본 글)", () => {
    expect(benchErrorText(new PermApplyError("PERM_BAD_VALUE", "기간이 366일을 넘습니다")).message).toContain("(기간이 366일을 넘습니다)");
    expect(benchErrorText(new PermApplyError("PERM_BUSY", "다른 적용과 겹쳤습니다. 다시 시도해 주세요")).message).toBe("다른 적용과 겹쳤습니다. 다시 시도해 주세요");
    expect(benchErrorText(new PermApplyError("PERM_BUSY", "다른 적용이 진행 중입니다")).message).toBe("다른 적용이 진행 중입니다. 잠시 뒤 다시 시도해 주세요.");
    expect(benchErrorText(new PermApplyError("PERM_BUSY", "PERM_BUSY:")).message).toBe("잠시 뒤 다시 시도해 주세요.");
    expect(benchErrorText(new PermApplyError("PERM_DRAFT_CORRUPT", "x")).message).toContain("초안 버리기");
  });

  it("충돌 범위가 없으면(쓰기 단계 제약 위반) 빈 목록 없이 일반 안내 + 다시 읽기 권함", () => {
    expect(conflictText([])).not.toContain(":");
    expect(conflictText([])).toContain("현재 값을 다시 읽고");
    expect(conflictText(["사람 홍길동", "역할 냉연"])).toContain(": 사람 홍길동, 역할 냉연.");
    expect(benchErrorText(new PermApplyError("PERM_CONFLICT", "제약 위반", []))).toMatchObject({ reload: true });
  });
});

describe("이력 기간(bench-be b5)", () => {
  it("기본 기간 = 오늘 − 30일 ~ 오늘, 날짜 계산은 달·해를 넘는다", () => {
    expect(defaultHistoryRange("2026-11-27")).toEqual({ fromDt: "2026-10-28", toDt: "2026-11-27" });
    expect(minusDays("2026-03-01", 1)).toBe("2026-02-28");
    expect(minusDays("2027-01-05", 30)).toBe("2026-12-06");
  });

  it("localDate 는 보는 사람 시각 날짜(UTC 가 아니다)", () => {
    expect(localDate(new Date(2026, 10, 27, 0, 30))).toBe("2026-11-27");
  });

  it("형식·없는 날짜·시작 > 종료·366일 넘음을 막는다(366일은 된다)", () => {
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(historyRangeError("2026/11/01", "2026-11-27")).toContain("YYYY-MM-DD");
    expect(historyRangeError("", "2026-11-27")).not.toBeNull();
    expect(historyRangeError("2026-11-28", "2026-11-27")).toContain("늦습니다");
    expect(historyRangeError(minusDays("2026-11-27", HISTORY_MAX_DAYS), "2026-11-27")).toBeNull();
    expect(historyRangeError(minusDays("2026-11-27", HISTORY_MAX_DAYS + 1), "2026-11-27")).toContain("366");
    expect(historyRangeError("2026-11-27", "2026-11-27")).toBeNull();
  });
});
