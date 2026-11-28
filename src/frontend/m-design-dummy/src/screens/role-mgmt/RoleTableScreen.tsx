/**
 * 역할 관리 — 시안 A 「표로 관리」(일반형, 표본 데이터만 사용, 백엔드 호출 없음).
 *
 * 현행 화면(m-mcm csa/commRoleMng)의 어려운 점과 시안의 답:
 *   1. 권한 하나를 주려면 패널 5개(역할 목록·상세·현재 권한·대상 OBJECT·권한)를 ①→②→추가 순서로 오가야 한다.
 *      → 역할을 고르면 메뉴별 화면 목록이 나오고, 화면마다 「권한 수준」 칸 하나만 고른다.
 *   2. PERMISSION ID·PERMISSION_COMMON·POPUP 버튼 같은 원문과 「화면 × 권한 묶음」 행이 그대로 보인다.
 *      → 권한 묶음을 「없음·조회·편집·편집·확정·전체」 수준과 「할 수 있는 일」 배지로 보인다.
 *   3. 이 역할을 누가 받는지 보려면 역할 그룹 관리·사용자 관리 화면을 따로 열어야 한다.
 *      → 「받은 사람」 탭에서 역할 그룹 → 사용자 → 사용자가 실제로 받는 권한까지 이어서 본다.
 *   4. 저장 전에 무엇이 바뀌는지 알 수 없다. → 바꾼 행에 색을 칠하고, 저장 전에 바뀐 내용을 문장으로 보인다.
 *
 * 그리드 사이 상호작용:
 *   - 역할 목록 → 오른쪽 모든 탭이 그 역할로 바뀐다. 화면 권한을 바꾸면 역할 목록의 「화면」·「변경」 칸이 바로 바뀐다.
 *   - 메뉴 목록 → 화면 목록을 그 메뉴로 거른다. 메뉴 칸의 「쓸 수 있음 n / 전체」 가 권한을 바꿀 때마다 바뀐다.
 *   - 화면 목록 → 아래 「같은 화면을 쓰는 다른 역할」 이 그 화면으로 바뀐다. 그 목록에서 역할을 누르면 고른 화면을 둔 채
 *     역할만 바꿔 같은 화면의 권한을 견줄 수 있다.
 *   - 역할 그룹 → 사용자 목록을 그 그룹으로 거른다. 사용자 → 그 사람이 속한 그룹 칸이 강조되고, 아래에 그 사람이 모든 역할을
 *     합쳐 실제로 받는 화면 권한이 나온다(이 역할이 준 칸 강조).
 *   - 조회 조건 「화면」·「사용자」 → 그 화면을 쓰는 역할, 그 사람이 받는 역할만 남기고 오른쪽 선택도 그 값으로 맞춘다.
 *   - 저장 확인 창의 바뀐 내용 행 → 창을 닫고 그 역할·화면으로 간다.
 */
import { useCallback, useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridBadge,
  GridBadgeCell,
  GridBadgeGroup,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import { Badge, Button, DatePicker, Input, Radio, SegmentedControl, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  INITIAL_GRANTS,
  MENU_GROUPS,
  MENU_GROUP_BY_ID,
  NONE,
  PERM_LEVELS,
  PERM_LEVEL_BY_ID,
  ROLES,
  SCREENS,
  SCREEN_BY_ID,
  USERS,
  type GrantMap,
  type RoleRecord,
} from "../../data/role-mgmt-mock";
import {
  KIND_TONE,
  LEVEL_LABELS,
  changeKind,
  groupsOfRole,
  levelOf,
  levelsFor,
  rolesOfUser,
  usersOfRole,
  type ChangeKind,
} from "./role-model";

// ── 공통 값 ──────────────────────────────────────────────────────────────

type TabKey = "grant" | "people" | "basic";
type ViewKey = "all" | "granted" | "changed";

const TAB_ITEMS: TabItem[] = [
  { key: "grant", label: "쓸 수 있는 화면" },
  { key: "people", label: "받은 사람" },
  { key: "basic", label: "기본 정보" },
];

const VIEW_OPTIONS = [
  { value: "all", label: "모든 화면" },
  { value: "granted", label: "쓸 수 있는 화면만" },
  { value: "changed", label: "바꾼 화면만" },
];

const USE_OPTIONS = [
  { value: "Y", label: "사용" },
  { value: "N", label: "사용 안 함" },
];

const ALL_MENU = "ALL";
const LOCKED_ROLE = "SYSADMIN";

const BULK_OPTIONS = PERM_LEVELS.filter((l) => !l.onlyScreens).map((l) => ({ value: l.id, label: l.label }));

const KIND_ROW_CLASS: Record<ChangeKind, string> = {
  추가: "ag-row-inserted",
  변경: "ag-row-modified",
  회수: "ag-row-deleted",
};

/** 수준이 할 수 있는 일을 배지로. 없음이면 흐린 「열 수 없음」. */
function ActionBadges({ levelId }: { levelId: string }) {
  const level = PERM_LEVEL_BY_ID.get(levelId);
  if (!level || level.actions.length === 0) {
    return (
      <GridBadgeCell>
        <GridBadge label="화면을 열 수 없음" muted />
      </GridBadgeCell>
    );
  }
  return (
    <GridBadgeCell>
      <GridBadgeGroup>
        {level.actions.map((a) => (
          <GridBadge key={a} label={a} />
        ))}
      </GridBadgeGroup>
    </GridBadgeCell>
  );
}

function KindBadge({ kind, before }: { kind: ChangeKind | null; before?: string }) {
  if (!kind) return null;
  const text = kind === "추가" ? "새로 줌" : kind === "회수" ? "빼앗음" : `${LEVEL_LABELS[before ?? NONE]}에서 바꿈`;
  return (
    <GridBadgeCell>
      <GridBadge label={text} {...KIND_TONE[kind]} />
    </GridBadgeCell>
  );
}

// ── 열 정의(모듈 상수 — 행 값만 보고 그린다) ───────────────────────────

const ROLE_COLUMNS: GridColumn[] = [
  {
    key: "name",
    header: "역할",
    width: 150,
    render: (v, row) => (
      <span style={{ color: row.useYn === "N" ? "var(--color-text-disabled)" : undefined }}>{String(v)}</span>
    ),
  },
  { key: "userCount", header: "받은 사람", width: 80, align: "right", type: "number", render: (v) => `${v}명` },
  { key: "screenCount", header: "쓸 수 있는 화면", width: 100, align: "right", type: "number", render: (v) => `${v}개` },
  {
    key: "changeCount",
    header: "저장 안 한 변경",
    width: 100,
    align: "center",
    render: (v) =>
      Number(v) > 0 ? (
        <GridBadgeCell>
          <GridBadge label={`${v}건`} {...KIND_TONE.변경} />
        </GridBadgeCell>
      ) : null,
  },
];

const MENU_COLUMNS: GridColumn[] = [
  { key: "label", header: "메뉴", width: 170 },
  {
    key: "granted",
    header: "쓸 수 있음",
    width: 90,
    align: "right",
    render: (v, row) => `${v} / ${row.total}`,
    cellClassRules: { "cell-edited": (row) => Number(row.changed) > 0 },
  },
];

const SCREEN_COLUMNS: GridColumn[] = [
  { key: "menu", header: "메뉴", width: 150 },
  { key: "name", header: "화면", width: 140 },
  {
    key: "level",
    header: "권한 수준",
    width: 110,
    editable: (row) => !row.locked,
    cellEditor: "select",
    cellEditorValuesGetter: (row) => levelsFor(String(row.screenId)),
    cellEditorValueLabels: LEVEL_LABELS,
    cellClassRules: { "cell-edited": (row) => Boolean(row.kind), "cell-input": (row) => !row.locked },
  },
  { key: "actions", header: "할 수 있는 일", width: 230, filter: false, render: (_v, row) => <ActionBadges levelId={String(row.level)} /> },
  {
    key: "kind",
    header: "저장 전 변경",
    width: 120,
    render: (v, row) => <KindBadge kind={(v as ChangeKind) || null} before={String(row.before)} />,
  },
  { key: "otherRoles", header: "다른 역할", width: 80, align: "right", render: (v) => (Number(v) ? `${v}개` : "") },
];

const RELATED_COLUMNS: GridColumn[] = [
  {
    key: "name",
    header: "역할",
    width: 160,
    render: (v, row) => (row.isCurrent ? <strong>{String(v)} (지금 보는 역할)</strong> : String(v)),
  },
  { key: "levelLabel", header: "권한 수준", width: 100 },
  { key: "actions", header: "할 수 있는 일", width: 300, filter: false, render: (_v, row) => <ActionBadges levelId={String(row.level)} /> },
  { key: "userCount", header: "받은 사람", width: 80, align: "right", render: (v) => `${v}명` },
];

const GROUP_COLUMNS: GridColumn[] = [
  { key: "name", header: "역할 그룹", width: 140, cellClassRules: { "cell-emphasis": (row) => Boolean(row.hasUser) } },
  { key: "userCount", header: "사람", width: 60, align: "right", render: (v) => `${v}명` },
  { key: "otherRoles", header: "이 그룹이 함께 주는 역할", width: 200 },
];

const USER_COLUMNS: GridColumn[] = [
  { key: "name", header: "이름", width: 80 },
  { key: "dept", header: "부서", width: 100 },
  { key: "via", header: "이 역할을 받는 길(역할 그룹)", width: 190, cellClassRules: { "cell-emphasis": (row) => Boolean(row.inGroup) } },
  { key: "otherRoles", header: "함께 받는 다른 역할", width: 220 },
];

const EFFECTIVE_COLUMNS: GridColumn[] = [
  { key: "menu", header: "메뉴", width: 170 },
  { key: "name", header: "화면", width: 150 },
  { key: "levelLabel", header: "실제 권한", width: 100, cellClassRules: { "cell-emphasis": (row) => Boolean(row.fromCurrent) } },
  { key: "actions", header: "할 수 있는 일", width: 280, filter: false, render: (_v, row) => <ActionBadges levelId={String(row.level)} /> },
  { key: "from", header: "이 권한을 준 역할", width: 200 },
];

const CHANGE_COLUMNS: GridColumn[] = [
  { key: "roleName", header: "역할", width: 130 },
  { key: "what", header: "무엇을", width: 170 },
  { key: "sentence", header: "바뀌는 내용", width: 300 },
];

// ── 조회 조건 ────────────────────────────────────────────────────────────

interface Filters {
  keyword: string;
  use: string;
  screen: string;
  user: string;
}

const DEFAULT_FILTERS: Filters = { keyword: "", use: "Y", screen: "", user: "" };

const USE_FILTER_OPTIONS = [{ value: "", label: "전체" }, ...USE_OPTIONS];
const SCREEN_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  ...SCREENS.map((s) => ({ value: s.id, label: `${s.name} (${MENU_GROUP_BY_ID.get(s.group)?.label ?? ""})` })),
];
const USER_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  ...USERS.map((u) => ({ value: u.userId, label: `${u.name} · ${u.dept}` })),
];

// ── 화면 ────────────────────────────────────────────────────────────────

export function RoleTableScreen() {
  const { showMessage } = useMessage();

  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const [savedRoles, setSavedRoles] = useState<RoleRecord[]>(ROLES);
  const [roles, setRoles] = useState<RoleRecord[]>(ROLES);
  const [savedGrants, setSavedGrants] = useState<GrantMap>(INITIAL_GRANTS);
  const [grants, setGrants] = useState<GrantMap>(INITIAL_GRANTS);

  const [selectedRoleId, setSelectedRoleId] = useState<string>("ROLE_QC_INSPECTOR");
  const [tab, setTab] = useState<TabKey>("grant");
  const [menuGroup, setMenuGroup] = useState<string>(ALL_MENU);
  const [view, setView] = useState<ViewKey>("all");
  const [selectedScreenId, setSelectedScreenId] = useState<string>("incomingInspection");
  const [checkedScreens, setCheckedScreens] = useState<string[]>([]);
  const [bulkLevel, setBulkLevel] = useState<string>("PERM_READ");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const role = roles.find((r) => r.roleId === selectedRoleId) ?? null;
  const isLocked = selectedRoleId === LOCKED_ROLE;

  // ── 바뀐 내용 ──
  const grantChanges = useMemo(() => {
    const out: { roleId: string; screenId: string; before: string; after: string; kind: ChangeKind }[] = [];
    for (const r of roles) {
      for (const s of SCREENS) {
        const before = levelOf(savedGrants, r.roleId, s.id);
        const after = levelOf(grants, r.roleId, s.id);
        const kind = changeKind(before, after);
        if (kind) out.push({ roleId: r.roleId, screenId: s.id, before, after, kind });
      }
    }
    return out;
  }, [roles, grants, savedGrants]);

  const infoChanges = useMemo(() => {
    const out: { roleId: string; sentence: string }[] = [];
    for (const r of roles) {
      const old = savedRoles.find((o) => o.roleId === r.roleId);
      if (!old) {
        out.push({ roleId: r.roleId, sentence: "새 역할을 만듭니다." });
        continue;
      }
      const diffs: string[] = [];
      if (old.name !== r.name) diffs.push(`이름 「${old.name}」 → 「${r.name}」`);
      if (old.description !== r.description) diffs.push("설명");
      if (old.useYn !== r.useYn) diffs.push(r.useYn === "Y" ? "다시 사용" : "사용 중지");
      if (old.startDate !== r.startDate || old.endDate !== r.endDate) diffs.push(`유효 기간 ${r.startDate} ~ ${r.endDate}`);
      if (diffs.length) out.push({ roleId: r.roleId, sentence: `${diffs.join(", ")}을(를) 바꿉니다.` });
    }
    return out;
  }, [roles, savedRoles]);

  const changeCountByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of grantChanges) m.set(c.roleId, (m.get(c.roleId) ?? 0) + 1);
    for (const c of infoChanges) m.set(c.roleId, (m.get(c.roleId) ?? 0) + 1);
    return m;
  }, [grantChanges, infoChanges]);

  const totalChanges = grantChanges.length + infoChanges.length;

  // ── 역할 목록 ──
  const roleRows = useMemo(() => {
    const kw = filters.keyword.trim().toUpperCase();
    const userRoles = filters.user ? new Set(rolesOfUser(filters.user)) : null;
    return roles
      .filter((r) => !kw || r.name.toUpperCase().includes(kw) || r.roleId.toUpperCase().includes(kw))
      .filter((r) => !filters.use || r.useYn === filters.use || changeCountByRole.has(r.roleId))
      .filter((r) => !filters.screen || levelOf(grants, r.roleId, filters.screen) !== NONE)
      .filter((r) => !userRoles || userRoles.has(r.roleId))
      .map((r) => ({
        roleId: r.roleId,
        name: r.name,
        useYn: r.useYn,
        userCount: usersOfRole(r.roleId).length,
        screenCount: SCREENS.filter((s) => levelOf(grants, r.roleId, s.id) !== NONE).length,
        changeCount: changeCountByRole.get(r.roleId) ?? 0,
      }));
  }, [roles, grants, filters, changeCountByRole]);

  const roleRowToken = useMemo(() => [...changeCountByRole.keys()].join(","), [changeCountByRole]);

  const selectRole = useCallback((roleId: string) => {
    setSelectedRoleId(roleId);
    setCheckedScreens([]);
    setSelectedGroupId(null);
  }, []);

  // ── 화면 권한 탭 ──
  const menuRows = useMemo(() => {
    const rows = MENU_GROUPS.map((g) => {
      const screens = SCREENS.filter((s) => s.group === g.id);
      return {
        id: g.id,
        label: g.label,
        total: screens.length,
        granted: screens.filter((s) => levelOf(grants, selectedRoleId, s.id) !== NONE).length,
        changed: grantChanges.filter((c) => c.roleId === selectedRoleId && SCREEN_BY_ID.get(c.screenId)?.group === g.id).length,
      };
    });
    const sum = (k: "total" | "granted" | "changed") => rows.reduce((a, r) => a + r[k], 0);
    return [{ id: ALL_MENU, label: "모든 메뉴", total: sum("total"), granted: sum("granted"), changed: sum("changed") }, ...rows];
  }, [grants, grantChanges, selectedRoleId]);

  const screenRows = useMemo(
    () =>
      SCREENS.filter((s) => menuGroup === ALL_MENU || s.group === menuGroup)
        .map((s) => {
          const before = levelOf(savedGrants, selectedRoleId, s.id);
          const level = levelOf(grants, selectedRoleId, s.id);
          return {
            screenId: s.id,
            name: s.name,
            menu: MENU_GROUP_BY_ID.get(s.group)?.label ?? "",
            level,
            before,
            kind: changeKind(before, level) ?? "",
            locked: isLocked,
            otherRoles: roles.filter((r) => r.roleId !== selectedRoleId && levelOf(grants, r.roleId, s.id) !== NONE).length,
          };
        })
        .filter((r) => view === "all" || (view === "granted" ? r.level !== NONE : r.kind !== "")),
    [menuGroup, view, grants, savedGrants, selectedRoleId, isLocked, roles],
  );

  const screenRowToken = useMemo(
    () => screenRows.map((r) => `${r.screenId}:${r.kind}`).join(","),
    [screenRows],
  );

  const setLevel = useCallback((roleId: string, screenIds: string[], levelId: string) => {
    setGrants((prev) => {
      const next = { ...prev, [roleId]: { ...(prev[roleId] ?? {}) } };
      for (const id of screenIds) {
        if (levelId === NONE) delete next[roleId][id];
        else next[roleId][id] = levelId;
      }
      return next;
    });
  }, []);

  const handleLevelChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      if (p.field !== "level") return;
      setLevel(selectedRoleId, [String(p.rowKey)], String(p.newValue ?? NONE));
      setSelectedScreenId(String(p.rowKey));
    },
    [selectedRoleId, setLevel],
  );

  const handleBulk = () => {
    if (checkedScreens.length === 0) {
      showMessage({ message: "권한 수준을 한꺼번에 바꿀 화면을 목록에서 체크하세요.", alertType: "warning" });
      return;
    }
    setLevel(selectedRoleId, checkedScreens, bulkLevel);
    showMessage({
      message: `화면 ${checkedScreens.length}개를 「${LEVEL_LABELS[bulkLevel]}」(으)로 바꿨습니다. 아직 저장하지 않았습니다.`,
      alertType: "info",
      toast: true,
    });
  };

  const selectedScreen = SCREEN_BY_ID.get(selectedScreenId) ?? null;

  const relatedRows = useMemo(() => {
    if (!selectedScreen) return [];
    return roles
      .filter((r) => r.roleId === selectedRoleId || levelOf(grants, r.roleId, selectedScreen.id) !== NONE)
      .map((r) => {
        const level = levelOf(grants, r.roleId, selectedScreen.id);
        return {
          roleId: r.roleId,
          name: r.name,
          level,
          levelLabel: LEVEL_LABELS[level],
          userCount: usersOfRole(r.roleId).length,
          isCurrent: r.roleId === selectedRoleId,
        };
      })
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  }, [selectedScreen, roles, grants, selectedRoleId]);

  // ── 받은 사람 탭 ──
  const roleGroups = useMemo(() => groupsOfRole(selectedRoleId), [selectedRoleId]);
  const selectedUser = USERS.find((u) => u.userId === selectedUserId) ?? null;
  const roleName = useCallback((id: string) => roles.find((r) => r.roleId === id)?.name ?? id, [roles]);

  const groupRows = useMemo(
    () =>
      roleGroups.map((g) => ({
        id: g.id,
        name: g.name,
        userCount: USERS.filter((u) => u.groupIds.includes(g.id)).length,
        otherRoles: g.roleIds.filter((id) => id !== selectedRoleId).map(roleName).join(", ") || "없음",
        hasUser: Boolean(selectedUser?.groupIds.includes(g.id)),
      })),
    [roleGroups, selectedRoleId, selectedUser, roleName],
  );

  const userRows = useMemo(() => {
    const groupIds = new Set(roleGroups.map((g) => g.id));
    return USERS.filter((u) => u.groupIds.some((id) => groupIds.has(id)))
      .filter((u) => !selectedGroupId || u.groupIds.includes(selectedGroupId))
      .map((u) => ({
        userId: u.userId,
        name: u.name,
        dept: u.dept,
        via: roleGroups.filter((g) => u.groupIds.includes(g.id)).map((g) => g.name).join(", "),
        inGroup: Boolean(selectedGroupId && u.groupIds.includes(selectedGroupId)),
        otherRoles: rolesOfUser(u.userId).filter((id) => id !== selectedRoleId).map(roleName).join(", ") || "없음",
      }));
  }, [roleGroups, selectedGroupId, selectedRoleId, roleName]);

  const effectiveRows = useMemo(() => {
    if (!selectedUser) return [];
    const userRoleIds = rolesOfUser(selectedUser.userId).filter((id) => roles.find((r) => r.roleId === id)?.useYn === "Y");
    return SCREENS.flatMap((s) => {
      const givers = userRoleIds
        .map((id) => ({ id, level: PERM_LEVEL_BY_ID.get(levelOf(grants, id, s.id)) }))
        .filter((g) => g.level && g.level.id !== NONE);
      if (givers.length === 0) return [];
      // 같은 화면에 여러 역할이 주면 높은 수준을 쓴다(업무 전용 묶음은 따로 더한다).
      const best = givers.reduce((a, b) => ((b.level?.rank ?? 0) > (a.level?.rank ?? 0) ? b : a));
      return [
        {
          screenId: s.id,
          menu: MENU_GROUP_BY_ID.get(s.group)?.label ?? "",
          name: s.name,
          level: best.level?.id ?? NONE,
          levelLabel: best.level?.label ?? "",
          from: givers.map((g) => `${roleName(g.id)}(${g.level?.label})`).join(", "),
          fromCurrent: best.id === selectedRoleId,
        },
      ];
    });
  }, [selectedUser, roles, grants, selectedRoleId, roleName]);

  const peopleToken = `${selectedGroupId ?? ""}|${selectedUserId ?? ""}`;

  // ── 조회·저장 ──
  const handleSearch = () => {
    setFilters(draftFilters);
    if (draftFilters.screen) {
      const s = SCREEN_BY_ID.get(draftFilters.screen);
      setSelectedScreenId(draftFilters.screen);
      if (s) setMenuGroup(s.group);
      setTab("grant");
    }
    if (draftFilters.user) {
      setSelectedUserId(draftFilters.user);
      setTab("people");
    }
    const first = roles.find(
      (r) =>
        (!draftFilters.screen || levelOf(grants, r.roleId, draftFilters.screen) !== NONE) &&
        (!draftFilters.user || rolesOfUser(draftFilters.user).includes(r.roleId)),
    );
    if (first && (draftFilters.screen || draftFilters.user)) selectRole(first.roleId);
  };

  const handleNew = () => {
    const id = `ROLE_NEW_${roles.length + 1}`;
    setRoles((prev) => [
      ...prev,
      { roleId: id, name: "새 역할", description: "", useYn: "Y", startDate: "2026-11-26", endDate: "9999-12-31" },
    ]);
    selectRole(id);
    setTab("basic");
  };

  const handleCopy = () => {
    if (!role) return;
    const id = `ROLE_NEW_${roles.length + 1}`;
    setRoles((prev) => [...prev, { ...role, roleId: id, name: `${role.name} (복사본)` }]);
    setGrants((prev) => ({ ...prev, [id]: { ...(prev[role.roleId] ?? {}) } }));
    selectRole(id);
    setTab("grant");
    showMessage({
      message: `「${role.name}」의 화면 권한을 그대로 가진 새 역할을 만들었습니다. 이름을 바꾸고 저장하세요.`,
      alertType: "info",
      toast: true,
    });
  };

  const handleSave = () => {
    if (totalChanges === 0) {
      showMessage({ message: "바꾼 내용이 없습니다.", alertType: "warning" });
      return;
    }
    setConfirmOpen(true);
  };

  const commitSave = () => {
    setSavedGrants(grants);
    setSavedRoles(roles);
    setConfirmOpen(false);
    showMessage({ message: `${totalChanges}건을 저장했습니다. 받은 사람은 다음 화면 이동부터 바뀐 권한을 씁니다.`, alertType: "success", toast: true });
  };

  const handleUndo = () => {
    if (totalChanges === 0) return;
    showMessage({
      title: "확인",
      message: `저장하지 않은 변경 ${totalChanges}건을 모두 되돌립니다. 되돌릴까요?`,
      alertType: "confirm",
      onConfirm: () => {
        setGrants(savedGrants);
        setRoles(savedRoles);
        if (!savedRoles.some((r) => r.roleId === selectedRoleId)) selectRole(savedRoles[0].roleId);
      },
    });
  };

  const changeRows = useMemo(
    () => [
      ...infoChanges.map((c) => ({
        key: `info:${c.roleId}`,
        roleId: c.roleId,
        screenId: "",
        roleName: roleName(c.roleId),
        what: "역할 정보",
        sentence: c.sentence,
      })),
      ...grantChanges.map((c) => ({
        key: `${c.roleId}:${c.screenId}`,
        roleId: c.roleId,
        screenId: c.screenId,
        roleName: roleName(c.roleId),
        what: SCREEN_BY_ID.get(c.screenId)?.name ?? c.screenId,
        sentence:
          c.kind === "추가"
            ? `이 화면을 새로 씁니다(${LEVEL_LABELS[c.after]}). 받은 사람 ${usersOfRole(c.roleId).length}명에게 메뉴가 생깁니다.`
            : c.kind === "회수"
              ? `이 화면을 더 쓰지 않습니다(원래 ${LEVEL_LABELS[c.before]}). 다른 역할로 받지 않는 사람은 메뉴가 사라집니다.`
              : `권한이 ${LEVEL_LABELS[c.before]} → ${LEVEL_LABELS[c.after]}(으)로 바뀝니다.`,
      })),
    ],
    [infoChanges, grantChanges, roleName],
  );

  const jumpToChange = (row: Record<string, unknown>) => {
    setConfirmOpen(false);
    selectRole(String(row.roleId));
    if (row.screenId) {
      const s = SCREEN_BY_ID.get(String(row.screenId));
      setSelectedScreenId(String(row.screenId));
      if (s) setMenuGroup(s.group);
      setView("all");
      setTab("grant");
    } else {
      setTab("basic");
    }
  };

  const updateRole = (patch: Partial<RoleRecord>) =>
    setRoles((prev) => prev.map((r) => (r.roleId === selectedRoleId ? { ...r, ...patch } : r)));

  // ── 요약 문장 ──
  const summary = role
    ? (() => {
        const screens = SCREENS.filter((s) => levelOf(grants, role.roleId, s.id) !== NONE).length;
        const groups = groupsOfRole(role.roleId).length;
        const people = usersOfRole(role.roleId).length;
        if (groups === 0) return `「${role.name}」은(는) 화면 ${screens}개를 쓸 수 있습니다. 아직 이 역할을 넣은 역할 그룹이 없어 받은 사람이 없습니다.`;
        return `「${role.name}」은(는) 화면 ${screens}개를 쓸 수 있고, 역할 그룹 ${groups}개를 거쳐 ${people}명이 받습니다.`;
      })()
    : "";

  const roleChangeCount = changeCountByRole.get(selectedRoleId) ?? 0;

  return (
    <PageLayout
      title="역할 관리 — 시안 A 표로 관리"
      breadcrumb="역할 관리 시안 > A. 표로 관리"
      screenId="ROLE-DRAFT-A"
      buttons={[
        { id: "search", label: "조회", type: "primary", action: "search", onClick: handleSearch },
        { id: "new", label: "새 역할", action: "reg", onClick: handleNew },
        { id: "copy", label: "복사해서 새 역할", action: "copy", onClick: handleCopy, disabled: !role },
        { id: "undo", label: "변경 되돌리기", action: "cancel", onClick: handleUndo, disabled: totalChanges === 0 },
        { id: "save", label: totalChanges ? `저장 (${totalChanges}건)` : "저장", type: "save", action: "save", onClick: handleSave },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="역할 이름"
          placeholder="이름 일부"
          value={draftFilters.keyword}
          onChange={(v) => setDraftFilters((p) => ({ ...p, keyword: v }))}
          historyKey="roleMgmtDraft.keyword"
        />
        <SearchField
          label="사용 여부"
          type="select"
          options={USE_FILTER_OPTIONS}
          value={draftFilters.use}
          onChange={(v) => setDraftFilters((p) => ({ ...p, use: v }))}
        />
        <SearchField
          label="화면으로 찾기"
          type="select"
          options={SCREEN_FILTER_OPTIONS}
          value={draftFilters.screen}
          onChange={(v) => setDraftFilters((p) => ({ ...p, screen: v }))}
        />
        <SearchField
          label="사람으로 찾기"
          type="select"
          options={USER_FILTER_OPTIONS}
          value={draftFilters.user}
          onChange={(v) => setDraftFilters((p) => ({ ...p, user: v }))}
        />
      </SearchArea>

      <ContentBody root resizable storageKey="design-dummy.system.roleMgmtDraft">
        <ContentPanel width={460}>
          <GridPanel title="역할" count={roleRows.length}>
            <AgDataGrid
              gridId="roleList"
              rowKey="roleId"
              columns={ROLE_COLUMNS}
              data={roleRows}
              columnSizing="fit"
              highlightedRowKey={selectedRoleId}
              onRowClick={(row) => selectRole(String(row.roleId))}
              getRowClassExtra={(row) => (Number(row.changeCount) > 0 ? "ag-row-modified" : undefined)}
              rowClassRefreshToken={roleRowToken}
              emptyMessage="조건에 맞는 역할이 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel>
          {role ? (
            <>
              <div className="role-draft-summary">
                <div className="role-draft-summary__title">
                  <strong>{role.name}</strong>
                  {role.useYn === "N" ? <Badge label="사용 안 함" tone="neutral" /> : <Badge label="사용 중" tone="success" />}
                  {roleChangeCount > 0 ? <Badge label={`저장 안 한 변경 ${roleChangeCount}건`} tone="warning" /> : null}
                </div>
                <div className="role-draft-summary__text">{summary}</div>
                {role.description ? <div className="role-draft-summary__muted">{role.description}</div> : null}
              </div>
              <Tabs items={TAB_ITEMS} activeKey={tab} onChange={(k) => setTab(k as TabKey)} />

              {tab === "grant" ? (
                <div className="role-draft-tab">
                  <div className="role-draft-legend">
                    <span className="role-draft-summary__muted">권한 수준:</span>
                    {PERM_LEVELS.filter((l) => l.id !== NONE).map((l) => (
                      <Badge
                        key={l.id}
                        label={`${l.label} = ${l.actions.join("·")}`}
                        tone={l.onlyScreens ? "neutral" : "primary"}
                        variant="outline"
                        title={l.onlyScreens ? "맞춤 레포트 화면에서만 고를 수 있습니다." : undefined}
                      />
                    ))}
                    {isLocked ? (
                      <span className="role-draft-summary__muted">
                        시스템 관리자는 새 화면을 자동으로 받습니다. 이 역할의 화면 권한은 바꿀 수 없습니다.
                      </span>
                    ) : (
                      <span className="role-draft-summary__muted">권한 수준 칸을 눌러 고릅니다. 여러 화면은 체크한 뒤 한꺼번에 바꿉니다.</span>
                    )}
                  </div>
                  <ContentBody resizable storageKey="design-dummy.system.roleMgmtDraft.grant">
                    <ContentPanel width={280}>
                      <GridPanel title="메뉴">
                        <AgDataGrid
                          gridId="roleMenu"
                          rowKey="id"
                          columns={MENU_COLUMNS}
                          data={menuRows}
                          columnSizing="fit"
                          highlightedRowKey={menuGroup}
                          onRowClick={(row) => setMenuGroup(String(row.id))}
                        />
                      </GridPanel>
                    </ContentPanel>
                    <ContentBody direction="column" resizable storageKey="design-dummy.system.roleMgmtDraft.screens">
                      <ContentPanel>
                        <GridPanel
                          title="화면"
                          count={screenRows.length}
                          titleExtra={
                            <SegmentedControl
                              value={view}
                              onChange={(v) => setView(v as ViewKey)}
                              options={VIEW_OPTIONS}
                              ariaLabel="보기"
                            />
                          }
                          headerExtra={
                            isLocked ? null : (
                              <>
                                <span className="role-draft-summary__muted">체크한 화면 {checkedScreens.length}개를</span>
                                <Select value={bulkLevel} onChange={setBulkLevel} options={BULK_OPTIONS} style={{ width: 110 }} />
                                <Button onClick={handleBulk} disabled={checkedScreens.length === 0}>
                                  (으)로 바꾸기
                                </Button>
                              </>
                            )
                          }
                        >
                          <AgDataGrid
                            gridId="roleScreens"
                            rowKey="screenId"
                            columns={SCREEN_COLUMNS}
                            data={screenRows}
                            columnSizing="fit"
                            selectable={!isLocked}
                            multiSelect
                            selectedRows={checkedScreens}
                            onRowSelect={(ids) => setCheckedScreens(ids.map(String))}
                            singleClickEdit
                            onCellValueChanged={handleLevelChange}
                            highlightedRowKey={selectedScreenId}
                            onRowClick={(row) => setSelectedScreenId(String(row.screenId))}
                            getRowClassExtra={(row) => (row.kind ? KIND_ROW_CLASS[row.kind as ChangeKind] : undefined)}
                            rowClassRefreshToken={screenRowToken}
                            emptyMessage={view === "changed" ? "이 역할에서 바꾼 화면이 없습니다." : "이 메뉴에 쓸 수 있는 화면이 없습니다."}
                          />
                        </GridPanel>
                      </ContentPanel>
                      <ContentPanel height={230}>
                        <GridPanel
                          title={selectedScreen ? `「${selectedScreen.name}」을(를) 쓰는 역할` : "같은 화면을 쓰는 역할"}
                          count={relatedRows.length}
                        >
                          <AgDataGrid
                            gridId="roleRelated"
                            rowKey="roleId"
                            columns={RELATED_COLUMNS}
                            data={relatedRows}
                            columnSizing="fit"
                            highlightedRowKey={selectedRoleId}
                            onRowClick={(row) => selectRole(String(row.roleId))}
                            emptyMessage="위 목록에서 화면을 고르세요."
                          />
                        </GridPanel>
                      </ContentPanel>
                    </ContentBody>
                  </ContentBody>
                </div>
              ) : null}

              {tab === "people" ? (
                <div className="role-draft-tab">
                  <div className="role-draft-legend">
                    <span className="role-draft-summary__muted">
                      사람은 역할을 직접 받지 않고 역할 그룹을 거쳐 받습니다. 그룹을 누르면 그 그룹 사람만, 사람을 누르면 그 사람이 실제로
                      받는 권한이 보입니다. 그룹에 사람을 넣고 빼는 일은 역할 그룹 관리에서 합니다.
                    </span>
                  </div>
                  <ContentBody direction="column" resizable storageKey="design-dummy.system.roleMgmtDraft.people">
                    <ContentBody resizable storageKey="design-dummy.system.roleMgmtDraft.peopleTop">
                      <ContentPanel width="42%">
                        <GridPanel
                          title="이 역할을 넣은 역할 그룹"
                          count={groupRows.length}
                          buttons={[
                            {
                              id: "allGroups",
                              label: "모든 그룹 사람 보기",
                              onClick: () => setSelectedGroupId(null),
                              disabled: !selectedGroupId,
                            },
                          ]}
                        >
                          <AgDataGrid
                            gridId="roleGroups"
                            rowKey="id"
                            columns={GROUP_COLUMNS}
                            data={groupRows}
                            columnSizing="fit"
                            highlightedRowKey={selectedGroupId}
                            onRowClick={(row) => setSelectedGroupId((prev) => (prev === row.id ? null : String(row.id)))}
                            rowClassRefreshToken={peopleToken}
                            emptyMessage="이 역할을 넣은 역할 그룹이 없습니다."
                          />
                        </GridPanel>
                      </ContentPanel>
                      <ContentPanel>
                        <GridPanel
                          title={selectedGroupId ? `「${groupRows.find((g) => g.id === selectedGroupId)?.name ?? ""}」 사람` : "이 역할을 받은 사람"}
                          count={userRows.length}
                        >
                          <AgDataGrid
                            gridId="roleUsers"
                            rowKey="userId"
                            columns={USER_COLUMNS}
                            data={userRows}
                            columnSizing="fit"
                            highlightedRowKey={selectedUserId}
                            onRowClick={(row) => setSelectedUserId(String(row.userId))}
                            rowClassRefreshToken={peopleToken}
                            emptyMessage="이 역할을 받은 사람이 없습니다."
                          />
                        </GridPanel>
                      </ContentPanel>
                    </ContentBody>
                    <ContentPanel height={260}>
                      <GridPanel
                        title={
                          selectedUser
                            ? `${selectedUser.name}(${selectedUser.dept})이(가) 실제로 받는 화면 권한 — 모든 역할 합산`
                            : "사람을 고르면 실제로 받는 화면 권한이 나옵니다"
                        }
                        count={effectiveRows.length}
                      >
                        <AgDataGrid
                          gridId="roleEffective"
                          rowKey="screenId"
                          columns={EFFECTIVE_COLUMNS}
                          data={effectiveRows}
                          columnSizing="fit"
                          rowClassRefreshToken={`${selectedUserId}|${selectedRoleId}`}
                          onRowClick={(row) => {
                            setSelectedScreenId(String(row.screenId));
                            const s = SCREEN_BY_ID.get(String(row.screenId));
                            if (s) setMenuGroup(s.group);
                            setTab("grant");
                          }}
                          emptyMessage={selectedUser ? "이 사람은 쓸 수 있는 화면이 없습니다." : "위 목록에서 사람을 고르세요."}
                        />
                      </GridPanel>
                    </ContentPanel>
                  </ContentBody>
                </div>
              ) : null}

              {tab === "basic" ? (
                <div className="role-draft-tab role-draft-tab--scroll">
                  <table style={DETAIL_TABLE_STYLE}>
                    <tbody>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>역할 이름 *</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input value={role.name} maxLength={100} onChange={(v: string) => updateRole({ name: v })} />
                        </td>
                      </tr>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>무엇을 하는 역할인가</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input value={role.description} maxLength={300} onChange={(v: string) => updateRole({ description: v })} />
                        </td>
                      </tr>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>사용 여부</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Radio
                            name="roleDraftUse"
                            value={role.useYn}
                            options={USE_OPTIONS}
                            onChange={(v: string) => updateRole({ useYn: v === "N" ? "N" : "Y" })}
                          />
                        </td>
                      </tr>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>쓸 수 있는 기간</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <div className="role-draft-period">
                            <DatePicker value={role.startDate} onChange={(v) => updateRole({ startDate: v })} />
                            <span>~</span>
                            <DatePicker value={role.endDate} onChange={(v) => updateRole({ endDate: v })} />
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>역할 ID</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input value={role.roleId} readOnly onChange={() => undefined} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="role-draft-summary__muted role-draft-note">
                    역할 ID 는 시스템이 쓰는 이름입니다. 새 역할은 저장할 때 자동으로 만듭니다. 현행 화면처럼 「메뉴 ID + ID」 를 직접 조합해
                    넣지 않습니다. 사용을 중지하면 이 역할로 받던 화면 권한이 모든 사람에게서 빠집니다.
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="role-draft-summary__muted role-draft-note">왼쪽에서 역할을 고르세요.</div>
          )}
        </ContentPanel>
      </ContentBody>

      <Modal
        open={confirmOpen}
        title={`저장 전 확인 — 바뀌는 내용 ${totalChanges}건`}
        size="xl"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>더 고치기</Button>
            <Button variant="primary" onClick={commitSave}>
              저장
            </Button>
          </>
        }
      >
        <div className="role-draft-summary__muted role-draft-note">행을 누르면 창을 닫고 그 역할·화면으로 갑니다.</div>
        <AgDataGrid
          gridId="roleChanges"
          rowKey="key"
          columns={CHANGE_COLUMNS}
          data={changeRows}
          columnSizing="fit"
          height="auto"
          onRowClick={jumpToChange}
        />
      </Modal>
    </PageLayout>
  );
}
