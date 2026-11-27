/**
 * commPermBench 가짜 자료 + 가짜 API — 실연결(perm-bench-be b1·b5) 전까지 화면이 쓴다.
 *
 * 표본 = docs/perm-bench/mock-v16.html 생성 코드를 옮긴 것(화면 1,004 · 역할 12 · 그룹 11 · 사람 554).
 * 계산 규칙 = decompose.md §0.2(정본):
 *   - 역할×오브젝트 효과 = (perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)
 *   - SYSADMIN = 모든 사용 오브젝트 × (obj.BTN ∪ obj.POPUP), 퍼미션 행 없음
 *   - 사용 안 함(역할·그룹·오브젝트) = 빠짐. 메뉴 숨김 = 메뉴에서만 빠지고 권한은 그대로
 *
 * 1단계 끝 기준 사례를 표본에 넣었다:
 *   - SYSADMIN: 관리자 그룹(RG_ADMIN)
 *   - 역할 사용 안 함: ROLE_OLD_REPORT
 *   - 그룹 사용 안 함: RG_MDM_PARTNER(기준정보 협력사)
 *   - 메뉴 숨김: mcm0014(시스템관리 마지막 화면)
 *   - 오브젝트 사용 안 함: 냉연 폴더 마지막 화면
 *   - 오브젝트에서 빠진 값: ROLE_QC_MANAGER 의 품질 보고 퍼미션에 approve(오브젝트에 없음)
 *   - 여러 그룹으로 받은 같은 역할: ROLE_VIEWER, 품질팀 6명은 RG_LEGACY 도 속함
 */
import {
  PERM_SYSADMIN_ROLE_ID,
  PermApplyError,
  toDraftChange,
  type ApplyParams,
  type ApplyResult,
  type BenchGroupRoleRow,
  type BenchGroupRow,
  type BenchMenuRow,
  type BenchRoleRow,
  type BenchUserGroupRow,
  type BenchUserRow,
  type DraftResult,
  type ExplainButtonRow,
  type ExplainParams,
  type ExplainPathRow,
  type ExplainResult,
  type HistoryDtlRow,
  type HistoryRow,
  type ImpactResult,
  type ImpactRow,
  type PermBenchApi,
  type PermChangeRow,
  type PermDenyReason,
  type PermSource,
  type RolePermRow,
  type SaveDraftRequest,
  type SearchBenchParams,
  type SearchBenchResult,
  type SearchHistoryParams,
  type SearchMenuTreeParams,
  type SearchRolePermParams,
  type YN,
} from "./types";
import { HISTORY_DEFAULT_DAYS, HISTORY_MAX_ROWS, historyRangeError, localDate, minusDays } from "./draft";

// ── 토큰 ─────────────────────────────────────────────────────

/** PermTokens.parse 와 같은 규칙: 콤마·공백으로 나눔, trim, 빈 값 제거, 순서 유지, 중복 제거. */
export function parseTokens(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return [...new Set(csv.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];
}

export const joinTokens = (list: readonly string[]): string => list.join(",");

const READ_PRESET = [/^search/, /^find/, /^get/, /^list/, /^lov/, /Lov$/, /^view$/, /^query$/];

/** PermTokens.readPreset(D18) — 「조회만」 값. */
export function readPreset(allowed: readonly string[]): string[] {
  return allowed.filter((t) => READ_PRESET.some((re) => re.test(t)));
}

// ── 메뉴·화면 1,004개 ───────────────────────────────────────

const MOD_DEF: Array<[string, string, Array<[string, number]>]> = [
  ["mcm", "공통관리", [["시스템관리", 14], ["게시판", 6], ["레포트", 10], ["인터페이스", 18], ["배치·작업", 8]]],
  ["mdm", "기준정보", [["데이터 사전", 12], ["코드", 16], ["품목", 24], ["공정·라우팅", 20], ["설비 기준", 14]]],
  ["aps", "생산계획", [["수주·판매계획", 22], ["생산계획", 30], ["스케줄", 28], ["작업지시", 26], ["계획 분석", 20]]],
  ["mpp", "조업", [["산세", 30], ["냉연", 50], ["소둔", 36], ["도금", 52], ["컬러", 40], ["정정·포장", 32], ["실적", 30]]],
  ["mqc", "품질", [["수입검사", 26], ["공정검사", 34], ["출하검사", 28], ["판정·부적합", 30], ["시험·분석", 44], ["품질 보고", 22]]],
  ["mls", "물류", [["입고", 30], ["재고", 34], ["출하", 44], ["배차·운송", 28], ["부재료", 32], ["창고 설비", 22]]],
  ["mas", "설비", [["설비 현황", 20], ["점검", 26], ["정비", 28], ["예비품", 18]]],
];
const OBJ_WORDS = ["코일", "작업", "LOT", "라인", "오더", "품목", "설비", "업체", "검체", "구간"];
const PAT = ["현황", "조회", "등록", "실적 조회", "이력 조회", "기준 관리", "승인", "집계", "보고서", "예외 처리", "일별 현황", "월별 집계", "대상 조회", "결과 등록", "확정", "마감", "수정 요청", "상세", "지표", "설정"];
const BTN_ORDER = ["search", "save", "delete", "import", "export", "confirm", "cancel"];
const READ_PAT = new Set(["현황", "조회", "실적 조회", "이력 조회", "집계", "보고서", "일별 현황", "월별 집계", "대상 조회", "상세", "지표"]);
const CONF_PAT = new Set(["승인", "확정", "마감"]);

function btnsFor(name: string): string[] {
  const pat = name.slice(name.indexOf(" ") + 1);
  if (name === "맞춤 레포트" || READ_PAT.has(pat)) return ["search", "export"];
  if (CONF_PAT.has(pat)) return ["search", "save", "confirm", "cancel", "export"];
  if (pat === "설정") return ["search", "save"];
  return ["search", "save", "delete", "import", "export"];
}

const POP_BY_MOD: Record<string, string[]> = {
  mpp: ["lotPop", "itemPop"], mqc: ["lotPop", "itemPop"], mls: ["itemPop", "custPop"], aps: ["itemPop", "custPop"],
  mdm: ["itemPop"], mas: ["eqpPop"], mcm: ["userPop"],
};

export interface MockObject {
  id: string;
  name: string;
  mod: string;
  folder: string;
  btn: string[];
  popup: string[];
  use: YN;
}

export interface MockPerm {
  btn: string[];
  popup: string[];
}

/** 가짜 자료 전체(현재 값 하나). 초안은 이 위에 변경 목록을 얹어 새 그래프를 만든다. */
export interface MockGraph {
  users: BenchUserRow[];
  groups: Array<{ id: string; name: string; use: YN }>;
  roles: Array<{ id: string; name: string; use: YN; menuId: string | null }>;
  /** USER_ID → ROLE_GROUP_ID[] */
  userGroups: Map<string, string[]>;
  /** ROLE_GROUP_ID → ROLE_ID[] */
  groupRoles: Map<string, string[]>;
  /** ROLE_ID → OBJECT_ID → 퍼미션 */
  perms: Map<string, Map<string, MockPerm>>;
  objects: Map<string, MockObject>;
  /** 메뉴 행(VISIBLE·REASON 없이). 모듈 → 폴더 → 화면 순서. */
  menus: Array<Omit<BenchMenuRow, "VISIBLE" | "REASON">>;
  modNames: Map<string, string>;
  folderNames: Map<string, string>;
}

const ROLE_DEF: Array<[string, string]> = [
  ["SYSADMIN", "시스템 관리자"], ["ROLE_MDM_EDITOR", "기준정보 편집자"], ["ROLE_MDM_OWNER", "기준정보 확정자"], ["ROLE_APS_PLANNER", "생산계획 담당"],
  ["ROLE_CR_OPERATOR", "냉연 조업자"], ["ROLE_GL_OPERATOR", "도금 조업자"], ["ROLE_QC_INSPECTOR", "품질 검사원"], ["ROLE_QC_MANAGER", "품질 관리자"],
  ["ROLE_LOGI_STAFF", "물류 담당"], ["ROLE_MAINT", "설비 정비원"], ["ROLE_VIEWER", "현장 조회 전용"], ["ROLE_OLD_REPORT", "구 레포트 사용자"],
];
const UNUSED_ROLE = "ROLE_OLD_REPORT";
const UNUSED_GROUP = "RG_MDM_PARTNER";

const GROUP_DEF: Array<[string, string, string[], number, string]> = [
  ["RG_ADMIN", "관리자 그룹", ["SYSADMIN"], 6, "정보기술팀"], ["RG_MDM_TEAM", "기준정보팀", ["ROLE_MDM_OWNER", "ROLE_VIEWER"], 9, "기준정보팀"],
  ["RG_MDM_PARTNER", "기준정보 협력사", ["ROLE_MDM_EDITOR"], 14, "협력사 A"], ["RG_PLAN_TEAM", "생산관리팀", ["ROLE_APS_PLANNER", "ROLE_VIEWER"], 22, "생산관리팀"],
  ["RG_CR_OPS", "냉연 조업", ["ROLE_CR_OPERATOR", "ROLE_VIEWER"], 186, "냉연생산팀"], ["RG_GL_OPS", "도금 조업", ["ROLE_GL_OPERATOR", "ROLE_VIEWER"], 142, "도금생산팀"],
  ["RG_QC_TEAM", "품질팀", ["ROLE_QC_INSPECTOR", "ROLE_VIEWER"], 48, "품질보증팀"], ["RG_QC_LEAD", "품질 관리자", ["ROLE_QC_MANAGER"], 7, "품질보증팀"],
  ["RG_LOGI_TEAM", "물류팀", ["ROLE_LOGI_STAFF", "ROLE_VIEWER"], 64, "물류팀"], ["RG_MAINT", "설비팀", ["ROLE_MAINT", "ROLE_VIEWER"], 51, "설비팀"],
  ["RG_LEGACY", "구 레포트 그룹", ["ROLE_OLD_REPORT", "ROLE_VIEWER"], 11, "품질보증팀"],
];

type Level = "READ" | "EDIT" | "CONFIRM" | "ALL";
const LV_BTNS: Record<Level, string[] | null> = {
  READ: ["search", "find", "export"],
  EDIT: ["search", "find", "save", "delete", "import", "export"],
  CONFIRM: null,
  ALL: null,
};

const SUR = "김이박최정강조윤장임한오서신권황안송류홍".split("");
const GIV = ["민준", "서연", "도윤", "하은", "지호", "수아", "예준", "지유", "현우", "채원", "건우", "다은", "준서", "서윤", "우진", "하린", "태경", "세린", "재원", "유나", "시우", "예린", "도현", "지안"];

/** 시안과 같은 표본을 만든다(결정적 — 매번 같은 값). */
export function buildMockGraph(): MockGraph {
  const modNames = new Map<string, string>();
  const folderNames = new Map<string, string>();
  const folderKey = new Map<string, string>(); // "mid|폴더 이름" → folder id
  const objects = new Map<string, MockObject>();
  const menus: MockGraph["menus"] = [];
  let seq = 0;

  MOD_DEF.forEach(([mid, mname, folders], mi) => {
    modNames.set(mid, mname);
    menus.push({ MENU_ID: mid, PARENT_MENU_ID: null, MENU_NM: mname, OBJECT_ID: null, SORT_SEQ: (mi + 1) * 100, SHOW_TP: "Y", USE_TP: "Y" });
    folders.forEach(([fname, cnt], fi) => {
      const fid = `${mid}-${fi}`;
      folderNames.set(fid, fname);
      folderKey.set(`${mid}|${fname}`, fid);
      menus.push({ MENU_ID: fid, PARENT_MENU_ID: mid, MENU_NM: fname, OBJECT_ID: null, SORT_SEQ: (fi + 1) * 100, SHOW_TP: "Y", USE_TP: "Y" });
      for (let i = 0; i < cnt; i++) {
        seq += 1;
        const sid = `${mid}${String(seq).padStart(4, "0")}`;
        const name = fname === "레포트" && i === 0
          ? "맞춤 레포트"
          : `${OBJ_WORDS[i % OBJ_WORDS.length]} ${PAT[(Math.floor(i / OBJ_WORDS.length) * 7 + (i % OBJ_WORDS.length) * 3) % PAT.length]}`;
        let btn = btnsFor(name);
        if (btn.includes("save") && mid === "aps" && fname === "작업지시") btn = ["find", "save", "order", "send", "export"];
        else if (btn.includes("save") && mid === "mcm" && fname === "인터페이스") btn = [...btn, "send"];
        const pops = mid === "aps" && fname === "작업지시"
          ? ["orderPop", "lineSelPop", "itemPop"]
          : mid === "mcm" && fname === "인터페이스" ? ["ifLogPop"] : POP_BY_MOD[mid] ?? [];
        const popup = btn.includes("save") ? pops : pops.slice(0, 1);
        objects.set(sid, { id: sid, name, mod: mid, folder: fid, btn, popup, use: "Y" });
        menus.push({ MENU_ID: `MN_${sid}`, PARENT_MENU_ID: fid, MENU_NM: name, OBJECT_ID: sid, SORT_SEQ: (i + 1) * 10, SHOW_TP: "Y", USE_TP: "Y" });
      }
    });
  });

  const fid = (mid: string, name: string): string => folderKey.get(`${mid}|${name}`) ?? "";
  const scr = (mid: string, fname: string, i: number): string => {
    const f = fid(mid, fname);
    return menus.filter((m) => m.PARENT_MENU_ID === f)[i]?.OBJECT_ID ?? "";
  };

  // 사례: 메뉴 숨김 · 오브젝트 사용 안 함
  const hidden = menus.find((m) => m.OBJECT_ID === scr("mcm", "시스템관리", 13));
  if (hidden) hidden.SHOW_TP = "N";
  const unusedObj = objects.get(scr("mpp", "냉연", 49));
  if (unusedObj) unusedObj.use = "N";

  const F = (mid: string, n: string) => `f:${fid(mid, n)}`;
  const M = (mid: string) => `m:${mid}`;
  const S = (mid: string, n: string, i: number) => `s:${scr(mid, n, i)}`;
  const GRANTS: Record<string, Record<string, Level>> = {
    ROLE_MDM_EDITOR: { [F("mdm", "데이터 사전")]: "EDIT", [F("mdm", "코드")]: "EDIT", [F("mdm", "품목")]: "EDIT", [F("mdm", "공정·라우팅")]: "READ", [F("mcm", "게시판")]: "READ" },
    ROLE_MDM_OWNER: { [M("mdm")]: "CONFIRM", [F("mcm", "게시판")]: "READ", [F("mcm", "레포트")]: "READ" },
    ROLE_APS_PLANNER: { [M("aps")]: "CONFIRM", [F("aps", "수주·판매계획")]: "READ", [F("mls", "재고")]: "READ", [F("mpp", "실적")]: "READ", [F("mcm", "게시판")]: "READ" },
    ROLE_CR_OPERATOR: { [F("mpp", "산세")]: "EDIT", [F("mpp", "냉연")]: "EDIT", [F("mpp", "소둔")]: "EDIT", [F("mpp", "실적")]: "EDIT", [F("mqc", "공정검사")]: "READ", [F("aps", "작업지시")]: "READ", [F("mcm", "게시판")]: "READ", [S("mpp", "냉연", 14)]: "CONFIRM", [S("mpp", "냉연", 15)]: "CONFIRM" },
    ROLE_GL_OPERATOR: { [F("mpp", "도금")]: "EDIT", [F("mpp", "컬러")]: "EDIT", [F("mpp", "실적")]: "EDIT", [F("mqc", "공정검사")]: "READ", [F("aps", "작업지시")]: "READ", [F("mcm", "게시판")]: "READ" },
    ROLE_QC_INSPECTOR: { [F("mqc", "수입검사")]: "EDIT", [F("mqc", "공정검사")]: "EDIT", [F("mqc", "출하검사")]: "EDIT", [F("mqc", "판정·부적합")]: "CONFIRM", [F("mqc", "시험·분석")]: "READ", [F("mcm", "게시판")]: "READ" },
    ROLE_QC_MANAGER: { [M("mqc")]: "CONFIRM", [F("mqc", "품질 보고")]: "ALL", [F("mpp", "실적")]: "READ", [F("mcm", "게시판")]: "EDIT", [F("mcm", "레포트")]: "READ", [F("mpp", "냉연")]: "CONFIRM" },
    ROLE_LOGI_STAFF: { [F("mls", "입고")]: "EDIT", [F("mls", "재고")]: "EDIT", [F("mls", "출하")]: "EDIT", [F("mls", "배차·운송")]: "EDIT", [F("mls", "부재료")]: "EDIT", [F("mls", "창고 설비")]: "READ", [F("mcm", "게시판")]: "READ" },
    ROLE_MAINT: { [M("mas")]: "EDIT", [F("mas", "설비 현황")]: "READ", [F("mdm", "설비 기준")]: "READ", [F("mcm", "게시판")]: "READ" },
    ROLE_VIEWER: { [F("mcm", "게시판")]: "READ", [F("aps", "스케줄")]: "READ", [F("mpp", "실적")]: "READ", [F("mls", "재고")]: "READ", [F("mas", "설비 현황")]: "READ" },
    ROLE_OLD_REPORT: { [F("mcm", "레포트")]: "READ" },
  };
  const levelOf = (roleId: string, o: MockObject): Level | null => {
    const g = GRANTS[roleId] ?? {};
    return g[`s:${o.id}`] ?? g[`f:${o.folder}`] ?? g[`m:${o.mod}`] ?? null;
  };

  const perms = new Map<string, Map<string, MockPerm>>();
  for (const [roleId] of ROLE_DEF) {
    if (roleId === PERM_SYSADMIN_ROLE_ID) continue;
    for (const o of objects.values()) {
      const lv = levelOf(roleId, o);
      if (!lv) continue;
      const allow = LV_BTNS[lv];
      const btn = allow ? o.btn.filter((b) => allow.includes(b)) : [...o.btn];
      if (!btn.length) continue;
      const popup = lv === "READ" ? o.popup.slice(0, 1) : [...o.popup];
      if (!perms.has(roleId)) perms.set(roleId, new Map());
      perms.get(roleId)!.set(o.id, { btn, popup });
    }
  }
  // 퍼미션은 오브젝트 값 중 일부만: 물류 담당은 작업지시 등록 화면에서 find,send 만
  const ex = [...objects.values()].find((o) => o.folder === fid("aps", "작업지시") && o.btn.includes("send"));
  if (ex) {
    if (!perms.has("ROLE_LOGI_STAFF")) perms.set("ROLE_LOGI_STAFF", new Map());
    perms.get("ROLE_LOGI_STAFF")!.set(ex.id, { btn: ["find", "send"], popup: [] });
  }
  // 사례: 오브젝트에서 빠진 값(approve 는 오브젝트에 없다 → 계산에서 빠짐)
  for (const [oid, p] of perms.get("ROLE_QC_MANAGER") ?? []) {
    if (objects.get(oid)?.folder === fid("mqc", "품질 보고")) p.btn = [...p.btn, "approve"];
  }

  // 사람 554명(시안과 같은 난수)
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const users: BenchUserRow[] = [];
  const userGroups = new Map<string, string[]>();
  for (const [gid, , , cnt, dept] of GROUP_DEF) {
    for (let i = 0; i < cnt; i++) {
      if (gid === "RG_LEGACY" && i < 6) continue;
      const userId = `u${String(users.length + 1).padStart(4, "0")}`;
      const name = SUR[Math.floor(rnd() * SUR.length)] + GIV[Math.floor(rnd() * GIV.length)];
      users.push({ USER_ID: userId, USER_NM: name, DEPT_NM: dept, USE_TP: "Y" });
      userGroups.set(userId, [gid]);
    }
  }
  users.filter((u) => userGroups.get(u.USER_ID)?.[0] === "RG_QC_TEAM").slice(0, 6)
    .forEach((u) => userGroups.get(u.USER_ID)!.push("RG_LEGACY"));

  const roleMenu = (roleId: string): string | null => {
    const k = Object.keys(GRANTS[roleId] ?? {})[0];
    if (!k) return null;
    return k.startsWith("s:") ? objects.get(k.slice(2))?.folder ?? null : k.slice(2);
  };

  return {
    users,
    groups: GROUP_DEF.map(([id, name]) => ({ id, name, use: id === UNUSED_GROUP ? "N" : "Y" })),
    roles: ROLE_DEF.map(([id, name]) => ({ id, name, use: id === UNUSED_ROLE ? "N" : "Y", menuId: roleMenu(id) })),
    userGroups,
    groupRoles: new Map(GROUP_DEF.map(([id, , roles]) => [id, [...roles]])),
    perms,
    objects,
    menus,
    modNames,
    folderNames,
  };
}

// ── 초안 얹기 ────────────────────────────────────────────────

/** PermGraph.applyChanges 와 같은 뜻(순수 함수 — 원본을 바꾸지 않는다). */
export function applyMockChanges(g: MockGraph, changes: readonly PermChangeRow[]): MockGraph {
  const userGroups = new Map([...g.userGroups].map(([k, v]) => [k, [...v]]));
  const groupRoles = new Map([...g.groupRoles].map(([k, v]) => [k, [...v]]));
  const perms = new Map([...g.perms].map(([k, v]) => [k, new Map(v)]));
  const addTo = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k) ?? [];
    if (!list.includes(v)) m.set(k, [...list, v]);
  };
  const delFrom = (m: Map<string, string[]>, k: string, v: string) => {
    m.set(k, (m.get(k) ?? []).filter((x) => x !== v));
  };
  for (const c of changes) {
    if (c.TP === "USER_GRP") (c.OP === "DEL" ? delFrom : addTo)(userGroups, c.KEY1, c.KEY2);
    else if (c.TP === "GRP_ROLE") (c.OP === "DEL" ? delFrom : addTo)(groupRoles, c.KEY1, c.KEY2);
    else {
      if (!perms.has(c.KEY1)) perms.set(c.KEY1, new Map());
      const rp = perms.get(c.KEY1)!;
      if (c.OP === "DEL") rp.delete(c.KEY2);
      else rp.set(c.KEY2, { btn: parseTokens(c.BTN_PERM), popup: parseTokens(c.POPUP_PERM) });
    }
  }
  return { ...g, userGroups, groupRoles, perms };
}

// ── 계산(PermResolver 흉내) ──────────────────────────────────

interface RolePath {
  groupId: string;
  roleId: string;
  active: boolean;
  /** active 가 false 인 이유. */
  off: PermDenyReason | null;
}

function pathsOfUser(g: MockGraph, userId: string): RolePath[] {
  const groupUse = new Map(g.groups.map((x) => [x.id, x.use]));
  const roleUse = new Map(g.roles.map((x) => [x.id, x.use]));
  const out: RolePath[] = [];
  for (const gid of g.userGroups.get(userId) ?? []) {
    for (const rid of g.groupRoles.get(gid) ?? []) {
      const gOff = groupUse.get(gid) === "N";
      const rOff = roleUse.get(rid) === "N";
      out.push({ groupId: gid, roleId: rid, active: !gOff && !rOff, off: gOff ? "GROUP_UNUSED" : rOff ? "ROLE_UNUSED" : null });
    }
  }
  return out;
}

const intersect = (a: readonly string[], allowed: readonly string[]) => a.filter((x) => allowed.includes(x));

/** 사람(또는 역할 하나)의 OBJECT_ID → action 집합. */
function actionsOf(g: MockGraph, roleIds: Iterable<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (oid: string, list: readonly string[]) => {
    if (!list.length) return;
    const s = out.get(oid) ?? new Set<string>();
    list.forEach((x) => s.add(x));
    out.set(oid, s);
  };
  for (const rid of roleIds) {
    if (rid === PERM_SYSADMIN_ROLE_ID) {
      for (const o of g.objects.values()) if (o.use === "Y") add(o.id, [...o.btn, ...o.popup]);
      continue;
    }
    for (const [oid, p] of g.perms.get(rid) ?? []) {
      const o = g.objects.get(oid);
      if (!o || o.use === "N") continue;
      add(oid, [...intersect(p.btn, o.btn), ...intersect(p.popup, o.popup)]);
    }
  }
  return out;
}

const activeRolesOf = (g: MockGraph, userId: string) =>
  new Set(pathsOfUser(g, userId).filter((p) => p.active).map((p) => p.roleId));

/**
 * 메뉴 칸 화면 한 줄의 VISIBLE·REASON. paths = 사람의 역할 길(역할 기준이면 그 역할 하나).
 * bench-be #11(런타임 PermExplainService) 규칙:
 *   a) 권한이 닿는 숨긴 화면(SHOW_TP N) = VISIBLE Y · REASON MENU_HIDDEN(주소로 연다)
 *   c) OBJECT_ID 가 없는(오브젝트를 모르는) 화면 = N · NO_PERM
 *   d) 역할 기준 트리도 실제 이유(ROLE_UNUSED·OBJ_UNUSED·NO_PERM …)를 준다
 *   사용자 사용 안 함은 paths 가 비어 NO_ROLE(그대로).
 */
function menuVerdict(g: MockGraph, m: MockGraph["menus"][number], paths: RolePath[]): { VISIBLE: YN; REASON: PermDenyReason | null } {
  const o = m.OBJECT_ID ? g.objects.get(m.OBJECT_ID) : undefined;
  if (!o) return { VISIBLE: "N", REASON: "NO_PERM" };
  if (o.use === "N") return { VISIBLE: "N", REASON: "OBJ_UNUSED" };
  if (!paths.length) return { VISIBLE: "N", REASON: "NO_ROLE" };
  const has = (p: RolePath) => p.roleId === PERM_SYSADMIN_ROLE_ID || g.perms.get(p.roleId)?.has(o.id);
  if (paths.some((p) => p.active && has(p))) return { VISIBLE: "Y", REASON: m.SHOW_TP === "N" ? "MENU_HIDDEN" : null };
  const offHit = paths.find((p) => !p.active && has(p));
  return { VISIBLE: "N", REASON: offHit?.off ?? "NO_PERM" };
}

function menuTree(g: MockGraph, paths: RolePath[]): BenchMenuRow[] {
  const rows: BenchMenuRow[] = g.menus.map((m) => {
    const o = m.OBJECT_ID ? g.objects.get(m.OBJECT_ID) : undefined;
    // 오브젝트 사용 여부(OBJ_USE_TP) — 사람 기준·역할 기준 트리 모두 준다(BE 결정 13b)
    if (!m.OBJECT_ID) return { ...m, VISIBLE: "N" as YN, REASON: null };
    return { ...m, ...menuVerdict(g, m, paths), ...(o ? { OBJ_USE_TP: o.use } : {}) };
  });
  // 폴더·모듈 = 아래 화면이 하나라도 보이면 보인다
  const byId = new Map(rows.map((r) => [r.MENU_ID, r]));
  for (const r of rows) {
    if (r.OBJECT_ID && r.VISIBLE === "Y") {
      let p = r.PARENT_MENU_ID ? byId.get(r.PARENT_MENU_ID) : undefined;
      while (p) {
        p.VISIBLE = "Y";
        p = p.PARENT_MENU_ID ? byId.get(p.PARENT_MENU_ID) : undefined;
      }
    }
  }
  // 모듈·폴더: 안 보이면 NO_PERM. b) 보이는 화면의 숨긴 위 폴더 = Y · MENU_HIDDEN. 줄 순서는 그래프 메뉴 순서 그대로(e)
  for (const r of rows) {
    if (r.OBJECT_ID) continue;
    if (r.VISIBLE === "N") r.REASON = "NO_PERM";
    else if (r.SHOW_TP === "N") r.REASON = "MENU_HIDDEN";
  }
  return rows;
}

function explainOf(g: MockGraph, userId: string, objectId: string): ExplainResult {
  const o = g.objects.get(objectId);
  const paths = pathsOfUser(g, userId);
  const pathRows: ExplainPathRow[] = [];
  for (const p of paths) {
    if (p.roleId === PERM_SYSADMIN_ROLE_ID) {
      pathRows.push({ ROLE_GROUP_ID: p.groupId, ROLE_ID: p.roleId, BTN_PERM: null, POPUP_PERM: null });
      continue;
    }
    const perm = g.perms.get(p.roleId)?.get(objectId);
    if (perm) pathRows.push({ ROLE_GROUP_ID: p.groupId, ROLE_ID: p.roleId, BTN_PERM: joinTokens(perm.btn), POPUP_PERM: joinTokens(perm.popup) });
  }
  if (!o) return { buttons: [], paths: pathRows };

  const buttons: ExplainButtonRow[] = [];
  const sys = paths.filter((p) => p.active && p.roleId === PERM_SYSADMIN_ROLE_ID);
  const verdict = (code: string, kind: "BTN" | "POPUP", allowed: boolean): ExplainButtonRow => {
    const pick = (p: RolePath) => {
      const perm = g.perms.get(p.roleId)?.get(objectId);
      return !!perm && (kind === "BTN" ? perm.btn : perm.popup).includes(code);
    };
    const base = { CODE: code, KIND: kind, ALLOWED: (allowed ? "Y" : "N") as YN };
    const uniq = (list: string[]) => joinTokens([...new Set(list)]);
    if (!allowed) {
      const hit = paths.filter(pick);
      return { ...base, GRANTED: "N", REASON: "NOT_IN_OBJ", ROLES: uniq(hit.map((p) => p.roleId)), GROUPS: uniq(hit.map((p) => p.groupId)) };
    }
    if (o.use === "N") return { ...base, GRANTED: "N", REASON: "OBJ_UNUSED", ROLES: "", GROUPS: "" };
    if (sys.length) return { ...base, GRANTED: "Y", REASON: "SYSADMIN", ROLES: PERM_SYSADMIN_ROLE_ID, GROUPS: uniq(sys.map((p) => p.groupId)) };
    const on = paths.filter((p) => p.active && pick(p));
    if (on.length) return { ...base, GRANTED: "Y", REASON: "PERM", ROLES: uniq(on.map((p) => p.roleId)), GROUPS: uniq(on.map((p) => p.groupId)) };
    if (!paths.length) return { ...base, GRANTED: "N", REASON: "NO_ROLE", ROLES: "", GROUPS: "" };
    const off = paths.filter((p) => !p.active && pick(p));
    if (off.length) return { ...base, GRANTED: "N", REASON: off[0].off ?? "NO_PERM", ROLES: uniq(off.map((p) => p.roleId)), GROUPS: uniq(off.map((p) => p.groupId)) };
    return { ...base, GRANTED: "N", REASON: "NO_PERM", ROLES: "", GROUPS: "" };
  };
  o.btn.forEach((c) => buttons.push(verdict(c, "BTN", true)));
  o.popup.forEach((c) => buttons.push(verdict(c, "POPUP", true)));
  // 퍼미션에는 있지만 오브젝트 허용 값에 없는 값
  const extra = (kind: "BTN" | "POPUP") => {
    const allowed = kind === "BTN" ? o.btn : o.popup;
    const seen = new Set<string>();
    for (const p of paths) {
      const perm = g.perms.get(p.roleId)?.get(objectId);
      for (const c of (kind === "BTN" ? perm?.btn : perm?.popup) ?? []) {
        if (!allowed.includes(c) && !seen.has(c)) {
          seen.add(c);
          buttons.push(verdict(c, kind, false));
        }
      }
    }
  };
  extra("BTN");
  extra("POPUP");
  return { buttons, paths: pathRows };
}

function menuPath(g: MockGraph, o: MockObject): string {
  return `${g.modNames.get(o.mod) ?? o.mod} › ${g.folderNames.get(o.folder) ?? o.folder}`;
}

function impactOf(before: MockGraph, after: MockGraph): ImpactResult {
  const rows: ImpactRow[] = [];
  const gain = new Set<string>();
  const lose = new Set<string>();
  const screens = new Set<string>();
  for (const u of after.users) {
    const a = actionsOf(before, activeRolesOf(before, u.USER_ID));
    const b = actionsOf(after, activeRolesOf(after, u.USER_ID));
    for (const oid of new Set([...a.keys(), ...b.keys()])) {
      const sa = a.get(oid) ?? new Set<string>();
      const sb = b.get(oid) ?? new Set<string>();
      const gained = [...sb].filter((x) => !sa.has(x));
      const lost = [...sa].filter((x) => !sb.has(x));
      if (!gained.length && !lost.length) continue;
      if (gained.length) gain.add(u.USER_ID);
      if (lost.length) lose.add(u.USER_ID);
      screens.add(oid);
      rows.push({
        USER_ID: u.USER_ID,
        USER_NM: u.USER_NM,
        OBJECT_ID: oid,
        OBJECT_NM: after.objects.get(oid)?.name ?? oid,
        GAINED: gained.length ? joinTokens(gained) : null,
        LOST: lost.length ? joinTokens(lost) : null,
      });
    }
  }
  return {
    summary: [{ GAIN_USER_CNT: gain.size, LOSE_USER_CNT: lose.size, SCREEN_CNT: screens.size }],
    impacts: rows.slice(0, 500),
  };
}

// ── 가짜 API ─────────────────────────────────────────────────

export interface MockPermBenchOptions {
  /** 응답 지연(ms). 화면 확인용. 시험은 0. */
  latencyMs?: number;
  /** 다음 apply 한 번을 PERM_CONFLICT 로 실패시킨다(충돌 안내 확인용). */
  conflictOnNextApply?: boolean;
  /** 적용한 관리자 ID. */
  adminUserId?: string;
  /** 로그인한 관리자가 SYSADMIN 인가(searchBench me[0].ME_SYSADMIN). 기본 false = "N". */
  meSysadmin?: boolean;
  /** 적용 이력 처음 줄(시험용). 없으면 예시 두 줄. */
  history?: HistoryRow[];
}

export interface MockPermBenchApi extends PermBenchApi {
  /** 현재 값 그래프(시험·확인용). */
  readonly graph: () => MockGraph;
  /** 다음 apply 를 충돌로 만든다. */
  forceConflictOnce(): void;
}

const BTN_RANK = (b: string) => {
  const i = BTN_ORDER.indexOf(b);
  return i < 0 ? 99 : i;
};

export function createMockPermBenchApi(options: MockPermBenchOptions = {}): MockPermBenchApi {
  const latency = options.latencyMs ?? 0;
  const admin = options.adminUserId ?? "admin";
  const meSysadmin = options.meSysadmin ?? false;
  let cur = buildMockGraph();
  let changes: PermChangeRow[] = [];
  let draftAt: string | null = null;
  let conflictOnce = options.conflictOnNextApply ?? false;
  const his: HistoryRow[] = options.history ? options.history.slice() : [
    { APPLY_ID: "PA20261120-0001", APPLY_USER_ID: admin, APPLY_AT: "2026-11-20T09:12:00", CHANGE_CNT: 2, GAIN_USER_CNT: 186, LOSE_USER_CNT: 0, APPLY_MEMO: "냉연 확정 버튼 추가" },
    { APPLY_ID: "PA20261124-0001", APPLY_USER_ID: admin, APPLY_AT: "2026-11-24T15:40:00", CHANGE_CNT: 1, GAIN_USER_CNT: 0, LOSE_USER_CNT: 6, APPLY_MEMO: "구 레포트 그룹 정리" },
  ];
  const dtl = new Map<string, HistoryDtlRow[]>([
    ["PA20261120-0001", [
      { SEQ_NO: 1, TARGET_TP: "ROLE_OBJ", KEY1: "ROLE_CR_OPERATOR", KEY2: "mpp0285", OP_TP: "UPD", BEFORE_VAL: "search,save,export", AFTER_VAL: "search,save,confirm,export" },
      { SEQ_NO: 2, TARGET_TP: "ROLE_OBJ", KEY1: "ROLE_CR_OPERATOR", KEY2: "mpp0286", OP_TP: "UPD", BEFORE_VAL: "search,save,export", AFTER_VAL: "search,save,confirm,export" },
    ]],
    ["PA20261124-0001", [
      { SEQ_NO: 1, TARGET_TP: "GRP_ROLE", KEY1: "RG_LEGACY", KEY2: "ROLE_VIEWER", OP_TP: "DEL", BEFORE_VAL: "Y", AFTER_VAL: null },
    ]],
  ]);

  const wait = <T>(v: T): Promise<T> =>
    latency > 0 ? new Promise((res) => setTimeout(() => res(v), latency)) : Promise.resolve(v);
  const graphOf = (source: PermSource) => (source === "DRAFT" && changes.length ? applyMockChanges(cur, changes) : cur);
  const draftResult = (): DraftResult => ({
    draft: [{ CHANGES_JSON: JSON.stringify(changes.map(toDraftChange)), CHANGE_CNT: changes.length, U_AT: draftAt }],
  });

  return {
    graph: () => cur,
    forceConflictOnce() {
      conflictOnce = true;
    },

    async searchBench(params: SearchBenchParams): Promise<SearchBenchResult> {
      const g = cur;
      const q = (params.userQ ?? "").trim().toLowerCase();
      let users = g.users;
      if (q) users = users.filter((u) => `${u.USER_ID} ${u.USER_NM} ${u.DEPT_NM ?? ""}`.toLowerCase().includes(q));
      if (params.roleGroupId) users = users.filter((u) => g.userGroups.get(u.USER_ID)?.includes(params.roleGroupId!));
      if (params.roleId) {
        const gids = new Set([...g.groupRoles].filter(([, r]) => r.includes(params.roleId!)).map(([gid]) => gid));
        users = users.filter((u) => g.userGroups.get(u.USER_ID)?.some((x) => gids.has(x)));
      }
      const userCnt = new Map<string, number>();
      for (const list of g.userGroups.values()) list.forEach((gid) => userCnt.set(gid, (userCnt.get(gid) ?? 0) + 1));
      const groups: BenchGroupRow[] = g.groups.map((x) => ({ ROLE_GROUP_ID: x.id, ROLE_GROUP_NM: x.name, USE_TP: x.use, USER_CNT: userCnt.get(x.id) ?? 0 }));
      const roles: BenchRoleRow[] = g.roles.map((r) => {
        const gids = [...g.groupRoles].filter(([, list]) => list.includes(r.id)).map(([gid]) => gid);
        const people = new Set([...g.userGroups].filter(([, list]) => list.some((x) => gids.includes(x))).map(([uid]) => uid));
        return {
          ROLE_ID: r.id,
          ROLE_NM: r.name,
          MENU_ID: r.menuId,
          USE_TP: r.use,
          GROUP_CNT: gids.length,
          USER_CNT: people.size,
          PERM_CNT: r.id === PERM_SYSADMIN_ROLE_ID ? g.objects.size : g.perms.get(r.id)?.size ?? 0,
        };
      });
      const ids = new Set(users.map((u) => u.USER_ID));
      const userGroups: BenchUserGroupRow[] = [...g.userGroups]
        .filter(([uid]) => ids.has(uid))
        .flatMap(([uid, list]) => list.map((gid) => ({ USER_ID: uid, ROLE_GROUP_ID: gid })));
      const groupRoles: BenchGroupRoleRow[] = [...g.groupRoles].flatMap(([gid, list]) => list.map((rid) => ({ ROLE_GROUP_ID: gid, ROLE_ID: rid })));
      return wait({ users, groups, roles, userGroups, groupRoles, me: [{ ME_SYSADMIN: meSysadmin ? "Y" : "N" }] });
    },

    async searchMenuTree(params: SearchMenuTreeParams) {
      const g = graphOf(params.source);
      let paths: RolePath[] = [];
      if (params.userId) paths = pathsOfUser(g, params.userId);
      else if (params.roleId) {
        const r = g.roles.find((x) => x.id === params.roleId);
        if (r) paths = [{ groupId: "", roleId: r.id, active: r.use === "Y", off: r.use === "Y" ? null : "ROLE_UNUSED" }];
        // bench-be #11 d: 역할 기준 트리도 실제 이유를 준다(앞 회차 「NO_PERM 하나」 규칙은 없앴다)
        return wait({ menus: menuTree(g, paths) });
      }
      return wait({ menus: menuTree(g, paths) });
    },

    async explain(params: ExplainParams) {
      return wait(explainOf(graphOf(params.source), params.userId, params.objectId));
    },

    async searchRolePerm(params: SearchRolePermParams) {
      const g = graphOf(params.source);
      const f = params.menuFolderId ?? "";
      const perms: RolePermRow[] = [];
      const rp = g.perms.get(params.roleId);
      for (const o of g.objects.values()) {
        if (f && o.folder !== f && o.mod !== f) continue;
        // 서버(bench-be 계약 ②)는 퍼미션 없는 오브젝트도 줄로 준다. 퍼미션 있음 = BTN_PERM 이 null 이 아님.
        const p = rp?.get(o.id);
        perms.push({
          ROLE_ID: params.roleId,
          OBJECT_ID: o.id,
          OBJECT_NM: o.name,
          MENU_PATH: menuPath(g, o),
          OBJ_BTN_PERM: joinTokens([...o.btn].sort((a, b) => BTN_RANK(a) - BTN_RANK(b))),
          OBJ_POPUP_PERM: joinTokens(o.popup),
          OBJ_READ_PERM: joinTokens(readPreset(o.btn)),
          BTN_PERM: p ? joinTokens(p.btn) : null,
          POPUP_PERM: p ? joinTokens(p.popup) : null,
          DATA_PERM: null,
        });
      }
      return wait({ perms });
    },

    async loadDraft() {
      return wait(draftResult());
    },

    async saveDraft(request: SaveDraftRequest) {
      // bench-be 계약 ⑤-5: ROLE_OBJ 의 SYSADMIN ADD·UPD 는 늘 금지(SYSADMIN 은 퍼미션 행 없이 모두 받는다).
      const forbidden = request.grids.changes.rows.find((r) => r.TP === "ROLE_OBJ" && r.KEY1 === PERM_SYSADMIN_ROLE_ID && r.OP !== "DEL");
      if (forbidden) throw new PermApplyError("PERM_FORBIDDEN", `시스템 관리자 퍼미션은 바꿀 수 없습니다: ${forbidden.KEY2}`, [forbidden.KEY1]);
      changes = request.grids.changes.rows.map((r) => ({ ...r }));
      draftAt = changes.length ? new Date().toISOString() : null;
      return wait(draftResult());
    },

    async discardDraft() {
      changes = [];
      draftAt = null;
      return wait(undefined);
    },

    async impact() {
      return wait(impactOf(cur, applyMockChanges(cur, changes)));
    },

    async apply(params: ApplyParams): Promise<ApplyResult> {
      if (latency > 0) await wait(null);
      if (conflictOnce) {
        conflictOnce = false;
        const scopes = [...new Set(changes.map((c) => c.KEY1))];
        throw new PermApplyError("PERM_CONFLICT", "다른 관리자가 먼저 바꾼 범위가 있습니다.", scopes);
      }
      for (const c of changes) {
        if (c.TP !== "ROLE_OBJ" || c.OP === "DEL") continue;
        const btn = parseTokens(c.BTN_PERM);
        if (!btn.length) throw new PermApplyError("PERM_EMPTY_BTN", `버튼 없는 퍼미션은 둘 수 없습니다: ${c.KEY1} × ${c.KEY2}`, [c.KEY1]);
        const o = cur.objects.get(c.KEY2);
        const outside = [...btn.filter((x) => !o?.btn.includes(x)), ...parseTokens(c.POPUP_PERM).filter((x) => !o?.popup.includes(x))];
        if (outside.length) throw new PermApplyError("PERM_NOT_IN_OBJ", `오브젝트에 없는 값: ${outside.join(",")}`, [c.KEY1]);
      }
      const after = applyMockChanges(cur, changes);
      const im = impactOf(cur, after);
      const sum = im.summary[0];
      if (sum.LOSE_USER_CNT > 0 && params.confirmLoss !== "Y") {
        throw new PermApplyError("PERM_NEED_CONFIRM", `버튼을 잃는 사람이 ${sum.LOSE_USER_CNT}명 있습니다.`);
      }
      const now = new Date();
      const day = now.toISOString().slice(0, 10).replace(/-/g, "");
      const applyId = `PA${day}-${String(his.length + 1).padStart(4, "0")}`;
      const beforeVal = (c: PermChangeRow) =>
        c.TP === "ROLE_OBJ" ? (cur.perms.get(c.KEY1)?.get(c.KEY2)?.btn.join(",") ?? null) : c.OP === "ADD" ? null : "Y";
      dtl.set(applyId, changes.map((c, i) => ({
        SEQ_NO: i + 1,
        TARGET_TP: c.TP,
        KEY1: c.KEY1,
        KEY2: c.KEY2,
        OP_TP: c.OP,
        BEFORE_VAL: beforeVal(c),
        AFTER_VAL: c.OP === "DEL" ? null : c.TP === "ROLE_OBJ" ? c.BTN_PERM : "Y",
      })));
      his.push({
        APPLY_ID: applyId,
        APPLY_USER_ID: admin,
        APPLY_AT: now.toISOString().slice(0, 19),
        CHANGE_CNT: changes.length,
        GAIN_USER_CNT: sum.GAIN_USER_CNT,
        LOSE_USER_CNT: sum.LOSE_USER_CNT,
        APPLY_MEMO: params.memo || null,
      });
      const cnt = changes.length;
      cur = after;
      changes = [];
      draftAt = null;
      return wait({ result: [{ APPLY_ID: applyId, CHANGE_CNT: cnt }] });
    },

    async searchHistory(params: SearchHistoryParams) {
      // bench-be b5: 기본 기간 toDt = 오늘, fromDt = toDt − 30일(둘 다 포함). 형식이 틀리거나 366일을 넘으면 PERM_BAD_VALUE.
      // his = APPLY_AT 내림차순 앞 500줄.
      const toDt = params.toDt || localDate();
      const fromDt = params.fromDt || minusDays(toDt, HISTORY_DEFAULT_DAYS);
      const bad = historyRangeError(fromDt, toDt);
      if (bad) throw new PermApplyError("PERM_BAD_VALUE", `${bad} (${fromDt} ~ ${toDt})`);
      const rows = his
        .filter((h) => h.APPLY_AT.slice(0, 10) >= fromDt && h.APPLY_AT.slice(0, 10) <= toDt)
        .filter((h) => !params.applyUserId || h.APPLY_USER_ID === params.applyUserId)
        .sort((a, b) => (a.APPLY_AT < b.APPLY_AT ? 1 : a.APPLY_AT > b.APPLY_AT ? -1 : 0))
        .slice(0, HISTORY_MAX_ROWS);
      return wait({ his: rows });
    },

    async searchHistoryDtl(params: { applyId: string }) {
      // dtl = SEQ_NO 오름차순. 모르는 applyId 는 빈 목록
      const rows = (dtl.get(params.applyId) ?? []).slice().sort((a, b) => a.SEQ_NO - b.SEQ_NO);
      return wait({ dtl: rows });
    },
  };
}
