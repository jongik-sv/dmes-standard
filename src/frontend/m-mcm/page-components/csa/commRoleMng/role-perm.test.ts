import { describe, expect, it } from "vitest";
import {
  ALL_FOLDERS,
  applyRoleDraft,
  withRoleField,
  addFromFolder,
  businessError,
  chipOptions,
  csv,
  draftFromRows,
  effectiveFolder,
  emptyBtnObjects,
  folderFilterOptions,
  initialBtns,
  isSysAdmin,
  liveCount,
  openWithStep,
  outOfObject,
  outValueNote,
  pendingCount,
  permCntLabel,
  permSaveErrorText,
  pickableObjs,
  pickEmptyMessage,
  removePerm,
  resetDraft,
  saveRows,
  setBtns,
  setPops,
  statusOf,
  toggleBtn,
  togglePop,
  undoPerm,
  roleOffMessage,
  viewRows,
} from "./role-perm";
import type { FolderObjRow, RoleMenuLov, RolePermRow } from "./types";

const ROLE = "role_MN_MPP_WORK_VIEW";

const MENUS: RoleMenuLov[] = [
  { MENU_ID: "MN_MPP", MENU_NM: "생산관리", PARENT_MENU_ID: null, MENU_LV: 1, MENU_PATH: "생산관리" },
  { MENU_ID: "MN_MPP_PLAN", MENU_NM: "생산계획", PARENT_MENU_ID: "MN_MPP", MENU_LV: 2, MENU_PATH: "생산관리 › 생산계획" },
  { MENU_ID: "MN_MPP_WORK", MENU_NM: "작업실적", PARENT_MENU_ID: "MN_MPP", MENU_LV: 2, MENU_PATH: "생산관리 › 작업실적" },
];

function perm(id: string, folder: string, objBtn: string, btn: string, objPop = "", pop = ""): RolePermRow {
  return {
    ROLE_ID: ROLE,
    OBJECT_ID: id,
    OBJECT_NM: id,
    MENU_FOLDER_ID: folder,
    MENU_PATH: MENUS.find((m) => m.MENU_ID === folder)?.MENU_PATH,
    MENU_NM: id,
    OBJ_BTN_PERM: objBtn,
    OBJ_POPUP_PERM: objPop,
    OBJ_READ_PERM: "search",
    BTN_PERM: btn,
    POPUP_PERM: pop,
    DATA_PERM: "",
  };
}

// mppWorkView 는 오브젝트 밖 값 print 를 갖는다(D15 표본과 같다).
const ROWS: RolePermRow[] = [
  perm("mppWorkView", "MN_MPP_WORK", "search,export", "search,export,print", "lotPop", "lotPop"),
  perm("mppWorkReg", "MN_MPP_WORK", "search,save,delete,confirm", "search"),
  perm("mppPlanView", "MN_MPP_PLAN", "search,export,print", "search"),
];

function obj(id: string, btn: string, read: string, extra: Partial<FolderObjRow> = {}): FolderObjRow {
  return {
    OBJECT_ID: id,
    OBJECT_NM: id,
    MENU_NM: id,
    MENU_PATH: "생산관리 › 작업실적",
    OBJ_BTN_PERM: btn,
    OBJ_POPUP_PERM: "lotPop",
    OBJ_READ_PERM: read,
    USE_TP: "Y",
    HAS_PERM: "N",
    ...extra,
  };
}

describe("csv · 오브젝트 밖 값", () => {
  it("공백·빈 값·중복을 지우고 순서를 지킨다", () => {
    expect(csv(" a, b,,a ,c")).toEqual(["a", "b", "c"]);
    expect(csv(null)).toEqual([]);
  });
  it("오브젝트 허용 값에 없는 값을 찾는다(D15)", () => {
    expect(outOfObject(["search", "export", "print"], ["search", "export"])).toEqual(["print"]);
  });
});

describe("칩 켜고 끄기", () => {
  it("버튼을 끄면 changed, 다시 켜면 same", () => {
    const d0 = draftFromRows(ROWS);
    const d1 = toggleBtn(d0, "mppWorkReg", "save");
    expect(statusOf(d1, "mppWorkReg")).toBe("changed");
    expect(d1.cur.mppWorkReg.btn).toEqual(["search", "save"]);
    const d2 = toggleBtn(d1, "mppWorkReg", "save");
    expect(statusOf(d2, "mppWorkReg")).toBe("same");
  });
  it("마지막 허용 버튼을 끄면 퍼미션 빼기(D14) — 오브젝트 밖 값만 남아도 빼기", () => {
    const d0 = draftFromRows(ROWS);
    const d1 = toggleBtn(toggleBtn(d0, "mppWorkView", "search"), "mppWorkView", "export");
    expect(statusOf(d1, "mppWorkView")).toBe("gone");
    expect(liveCount(d1)).toBe(2);
  });
  it("오브젝트 밖 값은 켜고 끌 수 없고 남아 있다", () => {
    const d0 = draftFromRows(ROWS);
    expect(toggleBtn(d0, "mppWorkView", "print")).toBe(d0);
    const d1 = toggleBtn(d0, "mppWorkView", "export");
    expect(d1.cur.mppWorkView.btn).toEqual(["search", "print"]);
  });
  it("팝업은 모두 꺼도 퍼미션이 남는다", () => {
    const d1 = togglePop(draftFromRows(ROWS), "mppWorkView", "lotPop");
    expect(statusOf(d1, "mppWorkView")).toBe("changed");
    expect(d1.cur.mppWorkView.pop).toEqual([]);
  });
  it("칩 목록 = 허용 값 + 지금 값 중 밖 값(out)", () => {
    expect(chipOptions(["search", "export"], ["search", "print"])).toEqual([
      { value: "search", out: false },
      { value: "export", out: false },
      { value: "print", out: true },
    ]);
  });
  it("값 통째로 바꾸기 — 밖 값은 남고, 허용 버튼이 비면 빼기, 같으면 같은 초안", () => {
    const d0 = draftFromRows(ROWS);
    const d1 = setBtns(d0, "mppWorkView", ["search", "print"]);
    expect(d1.cur.mppWorkView.btn).toEqual(["search", "print"]);
    expect(setBtns(d0, "mppWorkView", ["print"]).cur.mppWorkView).toBeUndefined();
    expect(setBtns(d0, "mppWorkReg", ["search"])).toBe(d0);
    expect(setPops(d0, "mppWorkView", []).cur.mppWorkView.pop).toEqual([]);
  });
});

describe("빼기 · 되돌리기", () => {
  it("조회한 줄은 빼기 대기로 남고 되돌리면 조회 값", () => {
    const d1 = removePerm(draftFromRows(ROWS), "mppWorkReg");
    expect(statusOf(d1, "mppWorkReg")).toBe("gone");
    expect(viewRows(d1, ALL_FOLDERS).map((r) => r.OBJECT_ID)).toContain("mppWorkReg");
    const d2 = undoPerm(d1, "mppWorkReg");
    expect(statusOf(d2, "mppWorkReg")).toBe("same");
  });
  it("새로 추가한 줄을 빼면 줄이 사라지고 DEL 을 보내지 않는다", () => {
    const d1 = addFromFolder(draftFromRows(ROWS), [obj("mppWorkCancel", "search,cancel", "search")], "read", MENUS, "MN_MPP_WORK");
    expect(statusOf(d1, "mppWorkCancel")).toBe("new");
    const d2 = removePerm(d1, "mppWorkCancel");
    expect(d2.order).not.toContain("mppWorkCancel");
    expect(saveRows(ROLE, d2)).toEqual([]);
  });
});

describe("변경 버리기", () => {
  it("조회 값으로 돌아가고 새로 추가한 줄은 사라진다", () => {
    const d0 = draftFromRows(ROWS);
    let d = removePerm(toggleBtn(d0, "mppWorkReg", "save"), "mppPlanView");
    d = addFromFolder(d, [obj("mppWorkCancel", "search", "search")], "read", MENUS, "MN_MPP_WORK");
    const r = resetDraft(d);
    expect(pendingCount(r)).toBe(0);
    expect(r.order).toEqual(d0.order);
    expect(resetDraft(d0)).toBe(d0);
  });
});

describe("메뉴에서 오브젝트 추가", () => {
  it("조회만 = OBJ_READ_PERM, 비면 첫 허용 버튼, 모두 = 허용 버튼 전부(D18)", () => {
    expect(initialBtns(["find", "save"], ["find"], "read")).toEqual(["find"]);
    expect(initialBtns(["save", "send"], [], "read")).toEqual(["save"]);
    expect(initialBtns(["save", "send"], [], "all")).toEqual(["save", "send"]);
  });
  it("후보에서 HAS_PERM=Y · USE_TP=N · 초안에 있는 것 · 허용 버튼 없는 것을 뺀다", () => {
    const d0 = addFromFolder(draftFromRows(ROWS), [obj("added", "search", "search")], "read", MENUS, "MN_MPP_WORK");
    const list = pickableObjs(
      [
        obj("ok", "search", "search"),
        obj("has", "search", "search", { HAS_PERM: "Y" }),
        obj("off", "search", "search", { USE_TP: "N" }),
        obj("added", "search", "search"),
        obj("mppWorkReg", "search", "search"),
        obj("nobtn", "", ""),
      ],
      d0,
    );
    expect(list.map((o) => o.OBJECT_ID)).toEqual(["ok"]);
  });
  it("추가한 줄의 폴더 = MENU_FOLDER_ID → MENU_PATH 로 찾은 폴더 → 고른 폴더", () => {
    const d1 = addFromFolder(
      EMPTY(),
      [obj("a", "search", "search"), obj("b", "search", "search", { MENU_PATH: "모름" }), obj("c", "search", "search", { MENU_FOLDER_ID: "MN_MPP_PLAN" })],
      "all",
      MENUS,
      "MN_MPP",
    );
    expect(d1.cur.a.MENU_FOLDER_ID).toBe("MN_MPP_WORK");
    expect(d1.cur.b.MENU_FOLDER_ID).toBe("MN_MPP");
    expect(d1.cur.c.MENU_FOLDER_ID).toBe("MN_MPP_PLAN");
    expect(d1.cur.a.pop).toEqual([]);
  });
});

function EMPTY() {
  return draftFromRows([]);
}

describe("후보가 빌 때의 글", () => {
  it("조회 실패 · 오브젝트 없음 · 모두 걸러짐을 나눈다", () => {
    expect(pickEmptyMessage(true, 5)).toContain("불러오지 못했습니다");
    expect(pickEmptyMessage(false, 0)).toBe("이 폴더에는 오브젝트가 없습니다.");
    expect(pickEmptyMessage(false, 3)).toContain("추가할 오브젝트가 없습니다");
  });
});

describe("폴더 거르기", () => {
  it("퍼미션이 있는 폴더 + 모든 폴더(n), 기본 = 역할 MENU_ID 폴더", () => {
    const opt = folderFilterOptions(draftFromRows(ROWS), MENUS, "MN_MPP_PLAN");
    expect(opt.options.map((o) => o.value)).toEqual(["MN_MPP_WORK", "MN_MPP_PLAN", ALL_FOLDERS]);
    expect(opt.options[2].label).toBe("모든 폴더 (3)");
    expect(opt.defaultValue).toBe("MN_MPP_PLAN");
  });
  it("역할 폴더에 퍼미션이 없으면 첫 폴더, 퍼미션이 없으면 모든 폴더", () => {
    expect(folderFilterOptions(draftFromRows(ROWS), MENUS, "MN_MCM_SYS").defaultValue).toBe("MN_MPP_WORK");
    expect(folderFilterOptions(EMPTY(), MENUS, "MN_MPP").defaultValue).toBe(ALL_FOLDERS);
  });
  it("고른 폴더가 목록에 없으면 기본값, 거른 줄만 보인다", () => {
    const d = draftFromRows(ROWS);
    const opt = folderFilterOptions(d, MENUS, "");
    expect(effectiveFolder("MN_NONE", opt)).toBe("MN_MPP_WORK");
    expect(viewRows(d, "MN_MPP_PLAN").map((r) => r.OBJECT_ID)).toEqual(["mppPlanView"]);
  });
  it("값이 같으면 같은 줄 객체를 돌려준다", () => {
    const d = draftFromRows(ROWS);
    const a = viewRows(d, ALL_FOLDERS);
    const b = viewRows(toggleBtn(d, "mppWorkReg", "save"), ALL_FOLDERS);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
  });
});

describe("저장 줄", () => {
  it("바뀐 것만 MERGE · DEL 로, 바뀌지 않은 줄은 보내지 않는다", () => {
    let d = draftFromRows(ROWS);
    d = toggleBtn(d, "mppWorkReg", "save");
    d = removePerm(d, "mppPlanView");
    d = addFromFolder(d, [obj("mppWorkCancel", "search,cancel", "search")], "all", MENUS, "MN_MPP_WORK");
    expect(pendingCount(d)).toBe(3);
    expect(saveRows(ROLE, d)).toEqual([
      { ROLE_ID: ROLE, OBJECT_ID: "mppWorkReg", BTN_PERM: "search,save", POPUP_PERM: "", DATA_PERM: "", OP_TP: "MERGE" },
      { ROLE_ID: ROLE, OBJECT_ID: "mppPlanView", BTN_PERM: "search", POPUP_PERM: "", DATA_PERM: "", OP_TP: "DEL" },
      { ROLE_ID: ROLE, OBJECT_ID: "mppWorkCancel", BTN_PERM: "search,cancel", POPUP_PERM: "", DATA_PERM: "", OP_TP: "MERGE" },
    ]);
  });
  it("고친 줄의 오브젝트 밖 값은 빼고 보낸다(D15 · PERM_NOT_IN_OBJ 회피)", () => {
    const d = togglePop(draftFromRows(ROWS), "mppWorkView", "lotPop");
    expect(saveRows(ROLE, d)).toEqual([
      { ROLE_ID: ROLE, OBJECT_ID: "mppWorkView", BTN_PERM: "search,export", POPUP_PERM: "", DATA_PERM: "", OP_TP: "MERGE" },
    ]);
  });
  it("밖 값이 있어도 바뀌지 않은 줄은 보내지 않고 값이 남는다(D15)", () => {
    const d = toggleBtn(draftFromRows(ROWS), "mppWorkReg", "save");
    expect(saveRows(ROLE, d).map((r) => r.OBJECT_ID)).toEqual(["mppWorkReg"]);
    expect(d.cur.mppWorkView.btn).toEqual(["search", "export", "print"]);
  });
  it("바뀐 줄의 버튼 밖 값도 빠지고, 밖 값 안내 한 줄을 만든다", () => {
    const d = toggleBtn(draftFromRows(ROWS), "mppWorkView", "export");
    expect(saveRows(ROLE, d)[0]).toMatchObject({ OBJECT_ID: "mppWorkView", BTN_PERM: "search", POPUP_PERM: "lotPop", OP_TP: "MERGE" });
    expect(outValueNote(["search", "export"], ["search", "print"], ["lotPop"], ["lotPop", "oldPop"])).toBe(
      "오브젝트에 없는 값 print, oldPop 는 저장 때 빠진다",
    );
    expect(outValueNote(["search"], ["search"], [], [])).toBeNull();
  });
  it("버튼이 빈 MERGE 줄을 저장 전에 찾는다(PERM_EMPTY_BTN)", () => {
    expect(
      emptyBtnObjects([
        { ROLE_ID: ROLE, OBJECT_ID: "x", BTN_PERM: "", POPUP_PERM: "", DATA_PERM: "", OP_TP: "MERGE" },
        { ROLE_ID: ROLE, OBJECT_ID: "y", BTN_PERM: "", POPUP_PERM: "", DATA_PERM: "", OP_TP: "DEL" },
      ]),
    ).toEqual(["x"]);
  });
  it("서버 거절 문구를 쉬운 말로 바꾼다", () => {
    expect(permSaveErrorText("PERM_NOT_IN_OBJ: r × o 오브젝트 밖 값 print")).toContain("허용하지 않은");
    expect(permSaveErrorText("PERM_EMPTY_BTN: r × o")).toContain("버튼 권한이 빈");
    expect(permSaveErrorText("네트워크 오류")).toBe("네트워크 오류");
    expect(permSaveErrorText("허용 값 밖", "PERM_NOT_IN_OBJ")).toContain("허용하지 않은");
  });
  it("업무 거절 오류 — 코드를 meta.code → errors[].code 에서 찾아 앞에 붙이고, 이미 붙어 있으면 그대로", () => {
    const a = businessError({ message: "오브젝트 밖 값 print", code: "PERM_NOT_IN_OBJ" });
    expect(a.message).toBe("PERM_NOT_IN_OBJ: 오브젝트 밖 값 print");
    expect(a.code).toBe("PERM_NOT_IN_OBJ");
    const b = businessError({ message: "PERM_EMPTY_BTN: r × o" }, [{ code: "PERM_EMPTY_BTN", message: "BTN_PERM 비었음" }]);
    expect(b.message).toBe("PERM_EMPTY_BTN: r × o\nBTN_PERM 비었음");
    expect(b.code).toBe("PERM_EMPTY_BTN");
    const c = businessError(undefined);
    expect(c.message).toBe("요청이 거부되었습니다.");
    expect(c.code).toBeUndefined();
  });
});

describe("역할", () => {
  it("SYSADMIN · PERM_CNT=-1 은 시스템 관리자, 퍼미션 수는 「모두」(D13)", () => {
    expect(isSysAdmin({ ROLE_ID: "SYSADMIN" })).toBe(true);
    expect(isSysAdmin({ ROLE_ID: "x", PERM_CNT: -1 })).toBe(true);
    expect(isSysAdmin({ ROLE_ID: "x", PERM_CNT: 3 })).toBe(false);
    expect(isSysAdmin({ ROLE_ID: "x", PERM_CNT: "-1" as unknown as number })).toBe(true);
    expect(permCntLabel(-1)).toBe("모두");
    expect(permCntLabel(1234)).toBe("1,234");
  });
  it("사용 안 함 확인 문구에 받은 사람·퍼미션 수를 넣는다", () => {
    const m = roleOffMessage("실적 조회자", 26, 2);
    expect(m).toContain("받은 사람 26명");
    expect(m).toContain("퍼미션 2건이 모두 멈춥니다");
    expect(m).toContain("다른 역할로 같은 버튼을 받는 사람은 그대로입니다.");
  });
});

describe("openWithStep (작업대에서 열기, f7)", () => {
  const rows = [
    { ROLE_ID: "R1", nativeeditor_status: "", k: "a" },
    { ROLE_ID: "R2", nativeeditor_status: "deleted", k: "b" },
  ];
  const key = (r: { k: string }) => r.k;

  it("new 는 새 행, edit 는 있는 행을 고르고 지울 행은 고르지 않는다", () => {
    expect(openWithStep({ mode: "new" }, rows, key, 0, true)).toEqual({ kind: "new" });
    expect(openWithStep({ mode: "edit", id: "R1" }, rows, key, 0, false)).toEqual({ kind: "select", key: "a" });
    expect(openWithStep({ mode: "edit", id: "R2" }, rows, key, 0, false)).toEqual({ kind: "search", roleId: "R2" });
  });

  it("목록에 없으면 첫 시도만 다시 조회하고, 고친 값이 있거나 id 가 없으면 건너뛴다", () => {
    expect(openWithStep({ mode: "edit", id: "R9" }, rows, key, 0, false)).toEqual({ kind: "search", roleId: "R9" });
    expect(openWithStep({ mode: "edit", id: "R9" }, rows, key, 1, false)).toEqual({ kind: "skip" });
    expect(openWithStep({ mode: "edit", id: "R9" }, rows, key, 0, true)).toEqual({ kind: "skip" });
    expect(openWithStep({ mode: "edit" }, rows, key, 0, false)).toEqual({ kind: "skip" });
  });
});

describe("상세 입력 초안(R12, z4fix)", () => {
  it("withRoleField: 같은 값이면 그 행, 고치면 updated, 새 행은 inserted 유지, MENU_ID·ID 로 ROLE_ID 합성", () => {
    const r = { ROLE_ID: "R1", ROLE_NM: "가", MENU_ID: "csa", ID: "a", nativeeditor_status: "" };
    expect(withRoleField(r, "ROLE_NM", "가")).toBe(r);
    expect(withRoleField(r, "ROLE_NM", "나")).toMatchObject({ ROLE_NM: "나", nativeeditor_status: "updated", ROLE_ID: "R1" });
    const n = { ROLE_ID: "", MENU_ID: "", ID: "", nativeeditor_status: "inserted" };
    const a = withRoleField(withRoleField(n, "MENU_ID", "csa"), "ID", "x");
    expect(a).toMatchObject({ ROLE_ID: "role_csa_x", nativeeditor_status: "inserted" });
    expect(withRoleField(n, "MENU_ID", "csa").ROLE_ID).toBe("");
  });

  it("applyRoleDraft: 같은 키 행만 바꾸고, 없으면 같은 목록", () => {
    const rows = [{ k: "a", v: 1 }, { k: "b", v: 2 }];
    const keyOf = (r: { k: string }) => r.k;
    const out = applyRoleDraft(rows, { k: "b", v: 9 }, keyOf);
    expect(out).toEqual([{ k: "a", v: 1 }, { k: "b", v: 9 }]);
    expect(out[0]).toBe(rows[0]);
    expect(applyRoleDraft(rows, { k: "z", v: 0 }, keyOf)).toBe(rows);
  });
});
