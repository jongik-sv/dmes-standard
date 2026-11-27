"use client";

/**
 * commPermMng 화면 — 퍼미션 관리(perm-bench 새 설계, 시안 v16 lgPermNext · decompose.md §0.4).
 *
 * 한 줄 = 퍼미션 한 건(역할 × 오브젝트). 버튼·팝업 권한은 오브젝트 허용 값 안에서만 켠다(D15).
 * - 조회 조건: 역할 · 메뉴(전체 · 모듈 · 폴더) · 오브젝트(ID · 이름) · 버튼/팝업 코드 + 「퍼미션 없는 오브젝트도」(역할을 고를 때만).
 * - 왼쪽 목록 칩으로 바로 켜고 끈다. 오른쪽 「퍼미션 한 건」 에서 값을 적어 고치고, 퍼미션 없는 오브젝트는 만든다.
 * - 바뀐 값은 화면이 들고 있다가(키 ROLE_ID|OBJECT_ID) [저장] 때 바뀐 건만 보낸다(MERGE·DEL, grids.perms — D36).
 * - 마지막 버튼을 끄면 퍼미션 빼기(D14). 「조회만」 = 서버 OBJ_READ_PERM(D18). DATA_PERM 은 보기·통과만(D21).
 *
 * 렌더 구조(화면 성능 가이드 R7·R12): 열 정의는 한 번만 만들고 동작은 고정 묶음(actions)으로 넘긴다.
 * 바뀐 건이 없는 줄은 조회 줄 객체를 그대로(보기 줄 캐시) 두어 그리드가 바뀐 줄만 다시 그린다.
 * 값 글 칸 입력 중 상태는 PermOnePane 안에만 있다.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, Pagination, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Checkbox } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { lov, saveCmPerm, searchCmPerm, searchPermOne } from "./api";
import { PermChips } from "./PermChips";
import { PermOnePane, type PermActions, type PermOneInfo } from "./PermOnePane";
import {
  NO_PERM,
  allowedOf,
  baseValue,
  entryOf,
  deleteConfirmText,
  findEmptyBtn,
  foldSaved,
  makeValue,
  permKey,
  toSaveRows,
  setCodes,
  toViewRow,
  type PermEntry,
  type PermKind,
  type PermValue,
  type PermViewRow,
} from "./perm-chips";
import { PERM_MNG_CSS, PERM_MNG_STYLE_HREF } from "./perm-styles";
import { roleFilterOptions } from "./role-filter";
import { RoleFilterCombo } from "./RoleFilterCombo";
import type { PermMenuLov, PermRoleLov, PermRow, PermSaveRow, PermSearchParams } from "./types";

const SCREEN_ID = "commPermMng";
/** 한 쪽 줄 수(서버 페이지). */
const PAGE_SIZE = 200;

interface PermFilters {
  roleId: string;
  menuId: string;
  objectQ: string;
  codeQ: string;
  showEmpty: boolean;
}

const DEFAULT_FILTERS: PermFilters = { roleId: "", menuId: "", objectQ: "", codeQ: "", showEmpty: false };

const toParams = (f: PermFilters, pageNo: number): PermSearchParams => ({
  roleId: f.roleId,
  menuId: f.menuId,
  objectQ: f.objectQ.trim(),
  codeQ: f.codeQ.trim(),
  showEmpty: f.roleId && f.showEmpty ? "Y" : "N",
  pageNo,
  pageSize: PAGE_SIZE,
});

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** save 거절(UserException) 코드를 알기 쉬운 문구로. 원래 문구는 뒤에 붙인다. */
function saveErrorText(e: unknown): string {
  const m = errorText(e);
  if (m.includes("PERM_NOT_IN_OBJ")) return `오브젝트에 없는 값이 있어 저장하지 못했습니다. 오브젝트 값을 확인하세요.\n${m}`;
  if (m.includes("PERM_EMPTY_BTN")) return `버튼 권한이 빈 퍼미션은 저장할 수 없습니다. 버튼을 하나 이상 켜거나 퍼미션을 빼세요.\n${m}`;
  return m;
}

const EMPTY_WITH_ROLE = "조건에 맞는 퍼미션이 없습니다. 「퍼미션 없는 오브젝트도」를 켜면 만들 수 있습니다.";
const EMPTY_NO_ROLE = "조건에 맞는 퍼미션이 없습니다. 역할을 고르면 퍼미션 없는 오브젝트도 볼 수 있습니다.";

const ROW_HEIGHT = 40;
const getRowHeight = () => ROW_HEIGHT;
const getRowClassExtra = (r: Record<string, unknown>) =>
  (r as PermViewRow).__state === "empty" ? "cpm-row-empty" : undefined;

function Cell2({ main, sub, mono }: { main: string; sub?: string; mono?: "main" | "sub" }) {
  return (
    <span className="cpm-cell2">
      <span className={mono === "main" ? "cpm-mono" : undefined}>{main}</span>
      {sub ? <span className={mono === "sub" ? "cpm-sub cpm-mono" : "cpm-sub"}>{sub}</span> : null}
    </span>
  );
}

function buildColumns(actions: PermActions): GridColumn[] {
  return [
    {
      key: "ROLE_ID",
      header: "역할",
      width: 150,
      minWidth: 140,
      align: "left",
      render: (_v, r) => <Cell2 main={String(r.ROLE_NM ?? r.ROLE_ID)} sub={String(r.ROLE_ID)} mono="sub" />,
    },
    {
      key: "MENU_PATH",
      header: "메뉴",
      width: 150,
      minWidth: 140,
      align: "left",
      render: (_v, r) => <Cell2 main={String(r.MENU_PATH ?? "-")} sub={r.MENU_NM ? String(r.MENU_NM) : undefined} />,
    },
    {
      key: "OBJECT_ID",
      header: "오브젝트",
      width: 150,
      minWidth: 140,
      align: "left",
      render: (_v, r) => (
        <Cell2 main={String(r.OBJECT_ID)} sub={r.OBJECT_NM ? String(r.OBJECT_NM) : undefined} mono="main" />
      ),
    },
    {
      key: "BTN_PERM",
      header: "버튼 권한",
      width: 300,
      minWidth: 220,
      align: "left",
      tooltip: false,
      render: (_v, r) => {
        const v = r as PermViewRow;
        const chips = (
          <PermChips
            chips={v.__btnChips}
            onChange={(next) => actions.set(v.__key, "btn", next)}
            ariaLabel={`${v.ROLE_ID} × ${v.OBJECT_ID} 버튼 권한`}
            line
          />
        );
        // D15 — 오브젝트 밖 값이 있으면 저장 때 빠진다는 한 줄을 칩 아래에 둔다.
        if (!v.__btnOut) return chips;
        return (
          <span className="cpm-cell2">
            {chips}
            <span className="cpm-warn" title={v.__btnOut}>
              {v.__btnOut}
            </span>
          </span>
        );
      },
    },
    {
      key: "POPUP_PERM",
      header: "팝업 권한",
      width: 180,
      minWidth: 120,
      align: "left",
      tooltip: false,
      render: (_v, r) => {
        const v = r as PermViewRow;
        const chips = (
          <PermChips
            chips={v.__popChips}
            onChange={(next) => actions.set(v.__key, "pop", next)}
            ariaLabel={`${v.ROLE_ID} × ${v.OBJECT_ID} 팝업 권한`}
            line
          />
        );
        // D15 — 오브젝트 밖 값이 있으면 저장 때 빠진다는 한 줄을 칩 아래에 둔다.
        if (!v.__popOut) return chips;
        return (
          <span className="cpm-cell2">
            {chips}
            <span className="cpm-warn" title={v.__popOut}>
              {v.__popOut}
            </span>
          </span>
        );
      },
    },
    {
      key: "DATA_PERM",
      header: "데이터 권한",
      width: 100,
      minWidth: 90,
      align: "left",
      render: (v) => (v ? String(v) : "-"),
    },
    {
      key: "__act",
      header: "",
      meta: false,
      width: 90,
      minWidth: 84,
      align: "center",
      sortable: false,
      tooltip: false,
      filter: false,
      render: (_v, r) => {
        const v = r as PermViewRow;
        if (v.__cur.has) {
          return (
            <Button size="mini" onClick={() => actions.remove(v.__key)}>
              빼기
            </Button>
          );
        }
        if (v.__base.has) {
          return (
            <Button size="mini" onClick={() => actions.undo(v.__key)}>
              되돌리기
            </Button>
          );
        }
        const canRead = v.__allowed.read.length > 0;
        return (
          <Button
            size="mini"
            disabled={!canRead}
            title={canRead ? "조회만으로 만듭니다" : "조회 값이 없습니다 — 오른쪽에서 「오브젝트 값 모두로 만들기」"}
            onClick={() => actions.make(v.__key, "read")}
          >
            만들기
          </Button>
        );
      },
    },
  ];
}

interface ViewCacheItem {
  entry: PermEntry | undefined;
  codeQ: string;
  view: PermViewRow;
}

export default function CommPermMngPage() {
  const { showMessage } = useMessage();

  // 새 창으로 분리할 때 이어받는 상태 — 조건·마지막 조회 조건·선택 키는 가볍게, 조회 결과 행은 bulky.
  const [filters, setFilters] = useCarryState<PermFilters>("filters", DEFAULT_FILTERS);
  const [query, setQuery] = useCarryState<PermSearchParams | null>("query", null);
  const [rows, setRows] = useCarryState<PermRow[]>("rows", [], { bulky: true });
  const [total, setTotal] = useCarryState<number>("total", 0);
  const [selectedKey, setSelectedKey] = useCarryState<string | null>("selectedKey", null);
  const restored = useCarryRestored();

  const [roles, setRoles] = useState<PermRoleLov[]>([]);
  const [menus, setMenus] = useState<PermMenuLov[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /** 바뀐 퍼미션(키 ROLE_ID|OBJECT_ID). ref 가 정본이고 state 는 다시 그리기용 거울이다. */
  const [pending, setPending] = useState<ReadonlyMap<string, PermEntry>>(() => new Map());
  const pendingRef = useRef<ReadonlyMap<string, PermEntry>>(pending);
  const commitPending = useCallback((next: ReadonlyMap<string, PermEntry>) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const [one, setOne] = useState<PermOneInfo | null>(null);
  const [oneTick, setOneTick] = useState(0);
  const oneSeqRef = useRef(0);
  const searchSeqRef = useRef(0);

  const busy = isSearching || isSaving;
  const codeQ = query?.codeQ ?? "";
  // 이벤트 안에서 쓰는 최신 값(Enter 조회·저장 다시 들어오기 막기, 저장 뒤 마지막 조건 다시 조회).
  const busyRef = useRef(busy);
  const savingRef = useRef(false);
  const queryRef = useRef(query);
  useLayoutEffect(() => {
    busyRef.current = busy;
  });

  // ── 보기 줄: 바뀐 건이 없고 조건(codeQ)이 같으면 전에 만든 보기 줄을 그대로 쓴다 ──
  const [viewCache] = useState(() => new WeakMap<PermRow, ViewCacheItem>());
  const viewRows = useMemo<PermViewRow[]>(
    () =>
      rows.map((r) => {
        const entry = pending.get(permKey(r.ROLE_ID, r.OBJECT_ID));
        const hit = viewCache.get(r);
        if (hit && hit.entry === entry && hit.codeQ === codeQ) return hit.view;
        const view = toViewRow(r, entry, codeQ);
        viewCache.set(r, { entry, codeQ, view });
        return view;
      }),
    [rows, pending, codeQ, viewCache],
  );
  const viewByKey = useMemo(() => new Map(viewRows.map((v) => [v.__key, v])), [viewRows]);
  const rowByKey = useMemo(() => new Map(rows.map((r) => [permKey(r.ROLE_ID, r.OBJECT_ID), r])), [rows]);
  const loadedKeys = useMemo<ReadonlySet<string>>(() => new Set(rowByKey.keys()), [rowByKey]);
  const selectedView = selectedKey ? viewByKey.get(selectedKey) ?? null : null;

  // ── 조회 ──
  /** 조회. 받은 줄을 화면에 넣었으면 true. */
  const runSearch = useCallback(
    async (q0: PermSearchParams): Promise<boolean> => {
      const seq = ++searchSeqRef.current;
      setIsSearching(true);
      try {
        // 서버 페이지(한 쪽 PAGE_SIZE 줄)라 조건이 없어도 한 번에 PAGE_SIZE 줄만 받는다(R1).
        let q = q0;
        let res = await searchCmPerm({ ...q, pageSize: PAGE_SIZE });
        // 저장으로 마지막 쪽 줄이 모두 빠졌으면 남은 마지막 쪽으로 간다.
        if (res.perms.length === 0 && q.pageNo > 1 && res.TOTAL_CNT > 0) {
          q = { ...q, pageNo: Math.ceil(res.TOTAL_CNT / PAGE_SIZE) };
          res = await searchCmPerm({ ...q, pageSize: PAGE_SIZE });
        }
        if (seq !== searchSeqRef.current) return false;
        setRows(res.perms);
        setTotal(res.TOTAL_CNT);
        setQuery(q);
        queryRef.current = q;
        const keys = res.perms.map((r) => permKey(r.ROLE_ID, r.OBJECT_ID));
        setSelectedKey((prev) => (prev && keys.includes(prev) ? prev : keys[0] ?? null));
        return true;
      } catch (e) {
        if (seq === searchSeqRef.current) showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        return false;
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    },
    [showMessage, setRows, setTotal, setQuery, setSelectedKey],
  );

  /** 바뀐 값이 있으면 묻고 지운 뒤 run 을 부른다. */
  const confirmDiscard = useCallback(
    (run: () => void) => {
      if (pendingRef.current.size === 0) {
        run();
        return;
      }
      showMessage({
        title: "확인",
        message: "저장하지 않은 변경이 있습니다. 조회하시겠습니까?",
        alertType: "confirm",
        onConfirm: () => {
          commitPending(new Map());
          run();
        },
      });
    },
    [showMessage, commitPending],
  );

  const handleSearch = useCallback(() => {
    // SearchArea 의 Enter 는 단추 disabled 를 보지 않는다 — 조회·저장 중에는 받지 않는다.
    if (busyRef.current) return;
    const q = toParams(filters, 1);
    confirmDiscard(() => void runSearch(q));
  }, [filters, confirmDiscard, runSearch]);

  /** 쪽 넘기기 — 같은 조건이라 바뀐 값은 그대로 둔다(키로 들고 있어 다른 쪽 줄도 저장된다). */
  const handlePage = useCallback(
    (page0: number) => {
      if (query && !busyRef.current) void runSearch({ ...query, pageNo: page0 + 1 });
    },
    [query, runSearch],
  );

  const handleReset = useCallback(() => setFilters(DEFAULT_FILTERS), [setFilters]);

  useEffect(() => {
    // 복원됐는데 행이 없으면 이어받은 조건으로 조회한다. 복원 아닌 첫 조회는 SearchArea autoSearch 가 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored && rows.length === 0 && query) void runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 역할·메뉴 고르기 목록 — 진입 때 한 번(조회가 아니다).
  useEffect(() => {
    let alive = true;
    lov()
      .then((r) => {
        if (!alive) return;
        setRoles(r.roles);
        setMenus(r.menus);
      })
      .catch((e) => {
        if (alive) showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      });
    return () => {
      alive = false;
    };
  }, [showMessage]);

  // 고른 퍼미션의 받는 사람·같은 화면 다른 퍼미션 — 낡은 응답은 버린다.
  useEffect(() => {
    if (!selectedKey) return;
    const seq = ++oneSeqRef.current;
    const i = selectedKey.indexOf("|");
    const roleId = selectedKey.slice(0, i);
    const objectId = selectedKey.slice(i + 1);
    searchPermOne(roleId, objectId)
      .then((r) => {
        if (seq === oneSeqRef.current) setOne({ key: selectedKey, ...r });
      })
      .catch((e) => {
        if (seq !== oneSeqRef.current) return;
        setOne({ key: selectedKey, others: [], groups: [], USER_CNT: 0 });
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      });
  }, [selectedKey, oneTick, showMessage]);

  // ── 저장 ──
  /** 바뀐 건 저장 — 확인을 거친 뒤(또는 확인이 필요 없을 때) 부른다. */
  const runSave = useCallback(
    async (saved: ReadonlyMap<string, PermEntry>, saveRows: PermSaveRow[]) => {
      savingRef.current = true;
      setIsSaving(true);
      try {
        await saveCmPerm(saveRows);
        // 저장한 값을 조회 줄에 먼저 접어 넣고 바뀐 값을 비운다 — 다시 조회가 실패해도 저장 전 값으로 돌아가 보이지 않는다.
        setRows((prev) => foldSaved(prev, saved));
        commitPending(new Map());
        showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
        const q = queryRef.current;
        if (q) await runSearch(q);
        setOneTick((n) => n + 1);
      } catch (e) {
        showMessage({ title: "오류", message: saveErrorText(e), alertType: "error" });
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [showMessage, commitPending, runSearch, setRows],
  );

  const handleSave = useCallback(async () => {
    if (savingRef.current || busyRef.current) return;
    const saved = pendingRef.current;
    // D14 — 저장하면 버튼이 하나도 남지 않는 퍼미션(버튼 값이 모두 오브젝트 밖)은 서버가 거절하므로 먼저 막는다.
    const empty = findEmptyBtn(saved.values());
    if (empty.length > 0) {
      const k = permKey(empty[0].roleId, empty[0].objectId);
      if (rowByKey.has(k)) setSelectedKey(k);
      showMessage({
        message: `버튼 권한이 하나도 남지 않는 퍼미션이 있어 저장하지 않았습니다: ${empty
          .map((e) => `${e.roleId} × ${e.objectId}`)
          .join(", ")}. 버튼을 하나 이상 켜거나 퍼미션을 빼세요.`,
        alertType: "warning",
      });
      return;
    }
    const saveRows = toSaveRows(saved.values());
    if (saveRows.length === 0) {
      showMessage({ message: "변경된 데이터가 없습니다.", alertType: "warning" });
      return;
    }
    // z2 F2 — 마지막 버튼 끄기·퍼미션 빼기로 지워지는 퍼미션이 있으면 묻는다(확인 = 저장, 취소 = 저장 안 함·바뀐 값 그대로).
    const delText = deleteConfirmText(saved.values());
    if (delText) {
      showMessage({
        title: "확인",
        message: delText,
        alertType: "confirm",
        onConfirm: () => {
          // 창이 열린 사이 바뀐 값·다른 저장이 생겼으면 저장하지 않는다(다시 [저장])
          if (pendingRef.current !== saved || savingRef.current || busyRef.current) return;
          void runSave(saved, saveRows);
        },
      });
      return;
    }
    await runSave(saved, saveRows);
  }, [showMessage, rowByKey, setSelectedKey, runSave]);

  // ── 퍼미션 한 건 바꾸기 ──
  /** 지금 값에 fn 을 적용해 바뀐 건 목록을 고친다. 조회 때와 같아지면 목록에서 뺀다. */
  const updateCur = (key: string, fn: (cur: PermValue, row: PermRow) => PermValue): { prev: PermValue; next: PermValue } | null => {
    const row = rowByKey.get(key);
    if (!row) return null;
    const map = pendingRef.current;
    const prev = map.get(key)?.cur ?? baseValue(row);
    const next = fn(prev, row);
    if (next === prev) return { prev, next };
    const entry = entryOf(row, next);
    const nextMap = new Map(map);
    if (entry) nextMap.set(key, entry);
    else nextMap.delete(key);
    commitPending(nextMap);
    return { prev, next };
  };

  const impl: PermActions = {
    select: (key) => {
      if (rowByKey.has(key)) setSelectedKey(key);
    },
    set: (key, kind: PermKind, next) => {
      if (busy) return;
      const r = updateCur(key, (cur, row) => setCodes(cur, kind, next, allowedOf(row)[kind]));
      if (r && r.prev.has && !r.next.has) {
        showMessage({
          message: "버튼 권한을 모두 꺼서 이 퍼미션을 뺍니다. 저장하기 전에는 [되돌리기]로 되돌릴 수 있습니다.",
          alertType: "info",
          toast: true,
        });
      }
    },
    make: (key, level) => {
      if (busy) return;
      updateCur(key, (cur, row) => (cur.has ? cur : makeValue(level, allowedOf(row)) ?? cur));
    },
    remove: (key) => {
      if (busy) return;
      updateCur(key, () => NO_PERM);
    },
    undo: (key) => {
      if (busy) return;
      if (!pendingRef.current.has(key)) return;
      const nextMap = new Map(pendingRef.current);
      nextMap.delete(key);
      commitPending(nextMap);
    },
  };
  const implRef = useRef(impl);
  useLayoutEffect(() => {
    implRef.current = impl;
  });
  /** 참조가 바뀌지 않는 동작 묶음 — 열 정의와 오른쪽 패널이 받는다. */
  const actions = useMemo<PermActions>(
    () => ({
      select: (k) => implRef.current.select(k),
      set: (k, kind, next) => implRef.current.set(k, kind, next),
      make: (k, lv) => implRef.current.make(k, lv),
      remove: (k) => implRef.current.remove(k),
      undo: (k) => implRef.current.undo(k),
    }),
    [],
  );
  // actions 는 implRef 를 이벤트 때만 읽는다(렌더 중에는 읽지 않는다) — 최신 함수 ref 패턴이라 규칙의 오탐이다.
  // eslint-disable-next-line react-hooks/refs
  const columns = useMemo(() => buildColumns(actions), [actions]);

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => setSelectedKey(String((row as PermViewRow).__key)),
    [setSelectedKey],
  );

  // ── 조회 조건 ──
  const roleOptions = useMemo(() => roleFilterOptions(roles), [roles]);
  const handleRoleFilter = useCallback((v: string) => setFilters((p) => ({ ...p, roleId: v })), [setFilters]);
  const menuOptions = useMemo(
    () => [
      { value: "", label: "전체 메뉴" },
      ...menus.map((m) => ({ value: m.MENU_ID, label: m.MENU_PATH ?? m.MENU_NM ?? m.MENU_ID })),
    ],
    [menus],
  );
  const setFilter = <K extends keyof PermFilters>(k: K, v: PermFilters[K]) => setFilters((p) => ({ ...p, [k]: v }));

  const totalPages = query ? Math.ceil(total / PAGE_SIZE) : 0;
  const pageIndex = query ? query.pageNo - 1 : 0;

  return (
    <PageLayout
      title="퍼미션 관리"
      breadcrumb="공통관리 > 시스템관리 > 퍼미션 관리"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary", disabled: busy, action: "search" },
        { id: "btn_reset", label: "초기화", onClick: handleReset, disabled: busy, action: "cancel" },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save",
          disabled: busy || pending.size === 0,
          action: "save",
        },
      ]}
    >
      <style href={PERM_MNG_STYLE_HREF} precedence="default">
        {PERM_MNG_CSS}
      </style>

      <SearchArea onSearch={handleSearch} autoSearch>
        {/* 역할이 많아 입력해서 찾는다(z2 F4) — options·value·onChange 를 함께 넘겨 조회 기본값 대상으로 둔다(그리기는 children) */}
        <SearchField label="역할" name="ROLE_ID" type="select" options={roleOptions} value={filters.roleId} onChange={handleRoleFilter}>
          <RoleFilterCombo options={roleOptions} value={filters.roleId} onChange={handleRoleFilter} />
        </SearchField>
        <SearchField
          label="메뉴"
          name="MENU_ID"
          type="select"
          options={menuOptions}
          value={filters.menuId}
          onChange={(v) => setFilter("menuId", v)}
        />
        <SearchField
          label="오브젝트"
          defaultKey="objectQ"
          placeholder="ID · 이름"
          value={filters.objectQ}
          onChange={(v) => setFilter("objectQ", v)}
        />
        <SearchField
          label="버튼 · 팝업 코드"
          defaultKey="codeQ"
          placeholder="예: send"
          value={filters.codeQ}
          onChange={(v) => setFilter("codeQ", v)}
        />
        <SearchField label="퍼미션 없는 오브젝트도" defaultable={false}>
          <Checkbox
            checked={!!filters.roleId && filters.showEmpty}
            disabled={!filters.roleId}
            label={filters.roleId ? "함께 봅니다" : "역할을 고르면 켤 수 있습니다"}
            aria-label="퍼미션 없는 오브젝트도"
            onChange={(c) => setFilter("showEmpty", c)}
          />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey="mcm.csa.commPermMng">
        <ContentPanel>
          <GridPanel
            title="퍼미션 목록"
            count={total}
            serverPaged
            loading={isSaving}
            titleExtra={
              <span className="cpm-inline">
                {pending.size > 0 && <Badge tone="warning" label={`바뀐 퍼미션 ${pending.size}건`} />}
                <Pagination
                  page={pageIndex}
                  totalPages={totalPages}
                  totalElements={total}
                  onPageChange={handlePage}
                  disabled={busy}
                />
              </span>
            }
          >
            {/* key = 조회한 codeQ — 칩의 「조건에 맞음」 강조는 칸 값에 없어 AG Grid 가 다시 그리지 않으므로, 조건이 바뀌면 그리드를 새로 만든다(조회 때만). */}
            <AgDataGrid
              key={codeQ}
              gridId="perms"
              rowKey="__key"
              columns={columns}
              data={viewRows}
              columnSizing="fit"
              personalize={{ sort: false }}
              getRowHeight={getRowHeight}
              getRowClassExtra={getRowClassExtra}
              highlightedRowKey={selectedKey}
              scrollToRow={selectedKey}
              onRowClick={handleRowClick}
              loading={isSearching}
              emptyMessage={query?.roleId ? EMPTY_WITH_ROLE : EMPTY_NO_ROLE}
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel width={460} scrollY>
          <PermOnePane row={selectedView} one={one} loadedKeys={loadedKeys} actions={actions} busy={busy} />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
