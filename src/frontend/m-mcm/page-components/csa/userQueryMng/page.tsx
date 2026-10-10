"use client";

/**
 * userQueryMng — 공용 쿼리 정의 관리(SYSADMIN). 스펙 2026-10-10-user-query-program-design §8.2.
 * 상단 버튼(조회 F8·신규·저장·삭제) → 조회조건 5개 → 왼쪽 목록(40%) + 오른쪽 탭 [정의] [할당].
 * - 정의 폼 state 는 DefTab 에만 있다(R12). 화면 루트는 ref 핸들(load·getForm)과 단추 활성용 mode·dirty 만 쥔다.
 * - 저장하지 않은 고침(정의·할당)이 있을 때 다른 행·신규를 고르면 확인 창을 띄운다.
 * - 목록은 수백 행 규모라 첫 조회 상한을 두지 않는다. 정의 상세(SQL 포함)는 행을 고를 때 get 으로 받는다.
 * - [정의] 와 [할당] 은 탭을 바꿔도 입력이 남도록 둘 다 마운트해 두고 보이는 쪽만 연다.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import { canDoButton, ContentBody, ContentPanel, SearchArea, SearchField, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { PageLayout, type PageButton } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { deleteUserQuery, getUserQueryDef, saveUserQuery, searchUserQueries } from "../../_userq/api";
import type { UserQueryListRow } from "../../_userq/types";
import { useUsrqCategories } from "../../_userq/use-usrq-categories";

import { AssignTab } from "./AssignTab";
import { DefTab, type DefTabHandle } from "./DefTab";
import {
  SCREEN_ID,
  USE_FILTER_OPTIONS,
  emptyDef,
  emptyFilters,
  toGridRows,
  toSearchCond,
  validateDef,
  type QueryGridRow,
  type SearchFilters,
} from "./form-model";
import { QueryListPanel } from "./QueryListPanel";

type Mode = "none" | "new" | "edit";
type DetailTab = "def" | "assign";

const TAB_ITEMS: TabItem[] = [
  { key: "def", label: "정의" },
  { key: "assign", label: "할당" },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function UserQueryMngPage() {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canSaveAssign = canDoButton(rbac, SCREEN_ID, "saveAssign");
  const { options: categoryOptions, titles: categoryTitles } = useUsrqCategories();

  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [rows, setRows] = useState<UserQueryListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** 마지막 조회가 실패했는가 — 성공하면 지운다. 첫 그림에는 거짓이라 진입 때 오류 문구가 깜빡이지 않는다. */
  const [loadError, setLoadError] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("none");
  /** 고른(저장된) 쿼리 ID. 신규·선택 없음은 "". */
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<DetailTab>("def");
  const [assignBusy, setAssignBusy] = useState(false);
  const [defDirty, setDefDirty] = useState(false);
  const [assignDirty, setAssignDirty] = useState(false);
  const defRef = useRef<DefTabHandle>(null);
  /** 조회조건의 최신 값 — 글자를 칠 때마다 load·저장·삭제 콜백이 바뀌어 하위 패널이 다시 그려지지 않게 ref 로 읽는다. */
  const filtersRef = useRef(filters);
  /** 목록 조회 번호·처리 중 표시 — 늦게 온 응답이 최신 목록을 덮지 않게, 처리 중 Enter 조회는 무시한다. */
  const listSeq = useRef(0);
  const listInFlight = useRef(false);

  const isBusy = listBusy || detailBusy || assignBusy;
  const dirty = defDirty || assignDirty;
  const gridRows = useMemo<QueryGridRow[]>(() => toGridRows(rows, categoryTitles), [rows, categoryTitles]);

  const showError = useCallback(
    (e: unknown) => showMessage({ title: "오류", message: errorText(e), alertType: "error" }),
    [showMessage]
  );

  /** 저장하지 않은 고침이 있으면 확인을 거친다. */
  const guard = useCallback(
    (action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      showMessage({ title: "확인", message: "저장하지 않은 변경을 버릴까요?", alertType: "confirm", onConfirm: action });
    },
    [dirty, showMessage]
  );

  const load = useCallback(async () => {
    if (listInFlight.current) return;
    listInFlight.current = true;
    const seq = ++listSeq.current;
    setListBusy(true);
    try {
      const found = await searchUserQueries(toSearchCond(filtersRef.current));
      if (seq === listSeq.current) {
        setRows(found);
        setLoaded(true);
        setLoadError(false);
      }
    } catch (e) {
      if (seq === listSeq.current) setLoadError(true);
      showError(e);
    } finally {
      listInFlight.current = false;
      setListBusy(false);
    }
  }, [showError]);

  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    const next = { ...filtersRef.current, [key]: value };
    filtersRef.current = next;
    setFilters(next);
  };

  /** 정의 1건을 받아 폼에 연다. 실패하면 지금 화면을 그대로 둔다. */
  const openDef = useCallback(
    async (queryId: string) => {
      setDetailBusy(true);
      try {
        const def = await getUserQueryDef(queryId);
        defRef.current?.load(def);
        setSelectedId(queryId);
        setMode("edit");
      } catch (e) {
        showError(e);
      } finally {
        setDetailBusy(false);
      }
    },
    [showError]
  );

  const handleSelect = useCallback(
    (row: QueryGridRow) => {
      if (isBusy || (row.queryId === selectedId && mode === "edit")) return;
      guard(() => void openDef(row.queryId));
    },
    [isBusy, selectedId, mode, guard, openDef]
  );

  const handleNew = useCallback(() => {
    guard(() => {
      defRef.current?.load(emptyDef());
      setSelectedId("");
      setMode("new");
      setTab("def");
    });
  }, [guard]);

  const handleSave = useCallback(async () => {
    const def = defRef.current?.getForm();
    if (!def || mode === "none") return;
    const problem = validateDef(def, mode === "new");
    if (problem) {
      showMessage({ message: problem, alertType: "warning" });
      return;
    }
    setDetailBusy(true);
    try {
      const saved = await saveUserQuery(def);
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      // 저장은 끝났으므로 재조회가 실패해도 신규 상태로 되돌아가지 않는다(다시 저장하면 「같은 ID 가 있다」 로 거절된다).
      setSelectedId(saved.queryId);
      setMode("edit");
      try {
        // 새로 받은 ver 로 폼을 다시 열어야 이어서 저장해도 충돌하지 않는다.
        defRef.current?.load(await getUserQueryDef(saved.queryId), true);
      } catch (e) {
        // 재조회가 실패해도 이어서 저장할 수 있게, 저장 응답의 ver 로 폼을 기준값부터 다시 연다.
        defRef.current?.load({ ...def, queryId: saved.queryId, ver: saved.ver }, true);
        showError(e);
      }
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setDetailBusy(false);
    }
  }, [mode, load, showMessage, showError]);

  const handleDelete = useCallback(() => {
    const def = defRef.current?.getForm();
    if (mode !== "edit" || !def || def.ver === null) return;
    const ver = def.ver;
    showMessage({
      title: "확인",
      message: "선택한 쿼리를 삭제하시겠습니까? 할당도 함께 삭제됩니다.",
      alertType: "confirm",
      onConfirm: async () => {
        setDetailBusy(true);
        try {
          await deleteUserQuery(def.queryId, ver);
          showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
          defRef.current?.load(null);
          setSelectedId("");
          setMode("none");
          await load();
        } catch (e) {
          showError(e);
        } finally {
          setDetailBusy(false);
        }
      },
    });
  }, [mode, load, showMessage, showError]);

  const handleAssignSaved = useCallback(() => void load(), [load]);

  const buttons: PageButton[] = [
    { id: "btn_search", label: "조회", onClick: () => void load(), type: "primary", action: "search", disabled: isBusy },
    { id: "btn_new", label: "신규", onClick: handleNew, action: "save", disabled: isBusy || !loaded },
    { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save", action: "save", disabled: isBusy || mode === "none" },
    { id: "btn_delete", label: "삭제", onClick: handleDelete, action: "delete", disabled: isBusy || mode !== "edit" },
  ];

  return (
    <PageLayout
      title="쿼리 정의 관리"
      breadcrumb="공통관리 > 시스템관리 > 쿼리 정의 관리"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={buttons}
    >
      <SearchArea onSearch={() => void load()} autoSearch>
        <SearchField
          label="분류"
          name="categoryCd"
          meta={false}
          type="select"
          options={[{ value: "", label: "전체" }, ...categoryOptions]}
          value={filters.categoryCd}
          onChange={(v) => setFilter("categoryCd", v)}
        />
        <SearchField
          label="쿼리 이름·ID"
          name="keyword"
          meta={false}
          value={filters.keyword}
          onChange={(v) => setFilter("keyword", v)}
          placeholder="이름 또는 ID"
          historyKey="userQueryMng.keyword"
        />
        <SearchField
          label="사용 여부"
          name="useYn"
          meta={false}
          type="select"
          options={USE_FILTER_OPTIONS}
          value={filters.useYn}
          onChange={(v) => setFilter("useYn", v as SearchFilters["useYn"])}
        />
        <SearchField
          label="담당 부서"
          name="ownerDept"
          meta={false}
          value={filters.ownerDept}
          onChange={(v) => setFilter("ownerDept", v)}
          placeholder="부서 코드 또는 이름"
          historyKey="userQueryMng.ownerDept"
        />
        <SearchField
          label="할당 사용자"
          name="assignUser"
          meta={false}
          value={filters.assignUser}
          onChange={(v) => setFilter("assignUser", v)}
          placeholder="사용자 ID 또는 이름"
          historyKey="userQueryMng.assignUser"
        />
      </SearchArea>

      <ContentBody root resizable storageKey="mcm.csa.userQueryMng">
        <ContentPanel width="40%">
          <div data-testid="userq-admin-list" style={{ display: "contents" }}>
            <QueryListPanel
              rows={gridRows}
              selectedId={selectedId}
              loading={listBusy}
              loadFailed={loadError}
              onSelect={handleSelect}
            />
          </div>
        </ContentPanel>

        <ContentPanel>
          <div data-testid="userq-admin-detail" style={{ display: "contents" }}>
            <Tabs items={TAB_ITEMS} activeKey={tab} onChange={(k) => setTab(k as DetailTab)} />
            <div hidden={tab !== "def"} style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
              <DefTab
                ref={defRef}
                isNew={mode === "new"}
                disabled={detailBusy || !canSave}
                categoryOptions={categoryOptions}
                onDirtyChange={setDefDirty}
              />
            </div>
            <div hidden={tab !== "assign"} style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
              <AssignTab
                queryId={selectedId || null}
                active={tab === "assign"}
                canSave={canSaveAssign}
                onDirtyChange={setAssignDirty}
                onBusyChange={setAssignBusy}
                onSaved={handleAssignSaved}
              />
            </div>
          </div>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
