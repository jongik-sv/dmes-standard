"use client";

/**
 * dataMng — 마루 데이터 조회·등록·수정 화면(2026-09-29 사용자 결정: dataMng+dataEdit 통합, D-104, codeMng 선례 D-101).
 *
 * 정본: 05 「화면」 마루 데이터 조회·등록, TSK-07-02 design.md §1·§2. 왼쪽은 목록(조회·행 클릭으로 선택), 오른쪽은
 * 선택한 데이터의 상세(헤더·라벨·카테고리 요약, 옛 dataEdit 본문 — `DataDetail.tsx`)다. 등록은 목록 헤더의
 * [데이터 등록]이 여는 팝업(`components/DataRegisterForm.tsx`)에서 하며 팝업을 여닫아도 선택·상세는 그대로다. 새 탭을 열지 않는다 — 등록 뒤에도 같은 화면에서 방금 만든 데이터를 고른 채 보인다. 항목 편집은 [항목 편집 →]
 * 으로 dataItemMng 탭을 열어 `{ maruDataId }` 를 넘긴다.
 * 상세의 쓰기(저장·폐기)는 옛 dataEdit 그대로 `dataEdit` 서비스를 부르고 권한도 `canDoButton(rbac,"dataEdit",action)`
 * 으로 본다. 등록만 `canDoButton(rbac,"dataMng","reg")`. 진입 데이터는 handoff(openMdmPage) > snapshot 순서로 정한다.
 *
 * 선택과 응답의 정합(codeMng 와 같음): 목록 강조(`selectedId`)와 상세(view·form)는 늘 같은 데이터를 가리켜야 하므로
 * 선택을 바꾸는 길은 `select` 하나로 모은다. 데이터에서 데이터로 옮길 때는 이전 상세를 새 상세가 올 때까지 잠근 채
 * (`stale`) 두었다가 같은 DOM 위에 바꿔 그린다. 상세 응답은 요청 순번(`detailSeq`)이 지금 것과 다르면 버린다.
 * 쓰기(저장·폐기·등록)가 진행 중이면 목록 행 클릭을 받지 않는다 — 결과(토스트, 충돌 모달과 다시 불러오기)를 그
 * 데이터 위에서 보게 하려는 것이다. handoff 는 쓰기 중에도 받으므로 응답 가드는 그대로 둔다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  ContentBody,
  ContentPanel,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { Input, Select } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout, openMdmPage, useMdmPageParams } from "@/shell";

import { registerDataMng, searchDataMng } from "./api";
import { buildDataMngColumns } from "./columns";
import { DataRegisterForm } from "./components/DataRegisterForm";
import { DataCategoryCard, DataHeaderCard, DataLabelsCard, mutedText, type Allowed } from "./DataDetail";
import { deprecateData, saveHeader, viewDataEdit } from "./edit-api";
import { headerFormOf, type DataEditView, type HeaderForm } from "./edit-types";
import { ROW_VERSION_CONFLICT_PREFIX } from "./messages";
import { STATUS_OPTIONS, errorMessage, type DataMngRegForm, type DataMngRow } from "./types";

export interface DataMngPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

const COMPONENT_PATH = "dmd/dataMng";

// 이전 데이터 상세를 잠근 채 두는 동안의 모습. 흐림은 늦게 걸어 짧은 조회(대부분)에서는 보이지 않게 한다.
const VEIL_FRESH = { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, transition: "opacity 120ms ease" } as const;
const VEIL_STALE = { ...VEIL_FRESH, opacity: 0.5, pointerEvents: "none", transitionDelay: "300ms" } as const;

function DetailVeil({ stale, children }: { stale: boolean; children: ReactNode }) {
  return (
    <div data-testid={stale ? "detail-stale" : undefined} aria-busy={stale || undefined} style={stale ? VEIL_STALE : VEIL_FRESH}>
      {children}
    </div>
  );
}

type Mode = "none" | "detail";

function snapshotId(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === "object" && "maruDataId" in snapshot) {
    const id = (snapshot as Record<string, unknown>).maruDataId;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

export default function DataMngPage({ tabId, snapshot, onSnapshotChange }: DataMngPageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac(true);

  // ── 목록(조회조건·그리드) ──
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<DataMngRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  // 마지막으로 조회에 쓴 조건 — 액션 뒤 목록 재조회는 입력만 하고 [조회] 하지 않은 값이 아니라 이 값을 쓴다.
  const appliedQuery = useRef({ id: "", name: "", status: "" });

  // ── 화면 모드·선택 ──
  const [mode, setMode] = useState<Mode>("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRegOpen, setIsRegOpen] = useState(false);
  // 응답 가드용 — 지금 고른 데이터와 상세 요청 순번. 선택을 바꾸거나 새 상세 요청을 낼 때마다 순번을 올린다.
  const selectedIdRef = useRef<string | null>(null);
  const detailSeq = useRef(0);
  // 진행 중인 쓰기 수 — 0 이 아니면 목록 행 클릭을 받지 않는다.
  const writing = useRef(0);

  // ── 오른쪽 상세(옛 dataEdit) ──
  const [view, setView] = useState<DataEditView | null>(null);
  const [form, setForm] = useState<HeaderForm | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<{ message: string; reload: boolean } | null>(null);
  const handedOff = useRef(false);
  // 사용자가 상세 폼을 고친 횟수와 지금 보이는 상세의 데이터 ID — 조회 응답이 사용자가 방금 고친 폼을 덮지 않게 하는 데 쓴다.
  const editSeq = useRef(0);
  const shownId = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const begin = useCallback(() => setPending((n) => n + 1), []);
  const end = useCallback(() => setPending((n) => Math.max(0, n - 1)), []);

  const writeSnapshotId = useCallback(
    (next: string) => {
      onSnapshotChange?.({ ...((snapshotRef.current as Record<string, unknown> | null) ?? {}), maruDataId: next });
    },
    [onSnapshotChange],
  );

  const clearSnapshotId = useCallback(() => {
    const base = { ...((snapshotRef.current as Record<string, unknown> | null) ?? {}) };
    delete base.maruDataId;
    onSnapshotChange?.(base);
  }, [onSnapshotChange]);

  // current=false 는 이미 다른 데이터로 옮긴 뒤 도착한 쓰기 실패 — 알리기는 하되 지금 데이터를 다시 불러오지는 않는다.
  const fail = useCallback((e: unknown, current = true) => {
    const message = errorMessage(e);
    setError({ message, reload: current && message.startsWith(ROW_VERSION_CONFLICT_PREFIX) });
  }, []);

  const loadList = useCallback(
    async (i: string, n: string, s: string) => {
      appliedQuery.current = { id: i, name: n, status: s };
      setListLoading(true);
      try {
        const result = await searchDataMng(i, n, s);
        setRows(result.list ?? []);
      } catch (e) {
        fail(e);
      } finally {
        setListLoading(false);
      }
    },
    [fail],
  );

  const reloadList = useCallback(
    () => loadList(appliedQuery.current.id, appliedQuery.current.name, appliedQuery.current.status),
    [loadList],
  );

  /**
   * 선택을 바꾸는 유일한 길(목록 행·handoff·snapshot·조회 실패). 순번을 올려 이전 데이터로 가던 응답이
   * 도착해도 버려지게 한다. keepDetail 이면 이전 상세를 새 상세가 올 때까지 잠근 채 남기고(`stale`), 아니면 바로 비운다.
   */
  const select = useCallback((next: string | null, nextMode: Mode, keepDetail = false) => {
    selectedIdRef.current = next;
    detailSeq.current += 1;
    setSelectedId(next);
    setMode(nextMode);
    if (!keepDetail) {
      shownId.current = null;
      setView(null);
      setForm(null);
    }
  }, []);

  // keepForm 이면 보이는 상세(auditVer·항목 수·카테고리)만 새 값으로 바꾸고 사용자가 고친 폼은 그대로 둔다.
  const apply = useCallback((next: DataEditView, keepForm = false) => {
    shownId.current = next.maruDataId;
    setView(next);
    if (!keepForm) setForm(headerFormOf(next));
  }, []);

  const loadDetail = useCallback(
    async (target: string) => {
      if (!target) return;
      const seq = ++detailSeq.current;
      const editsAtStart = editSeq.current;
      begin();
      try {
        const next = await viewDataEdit(target);
        if (seq !== detailSeq.current) return; // 그사이 다른 데이터를 골랐거나 더 새 요청이 나갔다
        // 같은 데이터를 다시 불러오는 사이 사용자가 폼을 고쳤으면 그 입력을 늦게 온 응답으로 덮지 않는다.
        apply(next, editSeq.current !== editsAtStart && shownId.current === next.maruDataId);
      } catch (e) {
        if (seq !== detailSeq.current) return;
        // 강조만 남고 상세가 이전 데이터로 남지 않게 선택을 비운다. snapshot 도 바로 지워 다시 열 때 같은 오류를 또 띄우지 않는다.
        select(null, "none");
        clearSnapshotId();
        fail(e);
      } finally {
        end();
      }
    },
    [apply, begin, end, select, clearSnapshotId, fail],
  );

  const chooseDetail = useCallback(
    (target: string) => {
      select(target, "detail", true);
      writeSnapshotId(target);
      return loadDetail(target);
    },
    [select, writeSnapshotId, loadDetail],
  );

  const handleRowClick = useCallback(
    (target: string) => {
      if (writing.current > 0) return; // 쓰기 결과를 그 데이터 위에서 보이도록 쓰기 중에는 선택을 바꾸지 않는다
      void chooseDetail(target);
    },
    [chooseDetail],
  );

  // 진입 값: handoff(마운트 때·자기 탭 재활성화 때마다) > snapshot. handoff 는 목록도 함께 조회한다 — 이미 열린 탭이
  // 다시 handoff 를 받을 때 방금 등록된 데이터가 목록에 보이도록.
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.maruDataId) {
      handedOff.current = true;
      setId("");
      setName("");
      setStatus("");
      void loadList("", "", "");
      void chooseDetail(params.maruDataId);
    }
  });

  useEffect(() => {
    const fromSnapshot = snapshotId(snapshotRef.current);
    if (!handedOff.current && fromSnapshot) {
      select(fromSnapshot, "detail");
      void loadDetail(fromSnapshot);
    }
    // handoff 콜백(위, 같은 커밋에서 먼저 실행)이 이미 목록을 조회했으면 다시 조회하지 않는다.
    if (!handedOff.current) void loadList("", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => void loadList(id, name, status), [loadList, id, name, status]);

  // 상세를 바꾸는 액션(저장·폐기) 뒤에는 목록의 이름·상태도 다시 조회한다. 응답이 올 때 이미 다른 데이터를 골랐으면
  // (handoff) 그 view 는 버린다 — 쓰기 자체는 끝났으므로 토스트·목록 재조회는 한다.
  const run = useCallback(
    async (task: () => Promise<DataEditView>, done?: string) => {
      const seq = ++detailSeq.current;
      writing.current += 1;
      begin();
      try {
        const next = await task();
        if (seq === detailSeq.current) apply(next);
        if (done) showMessage({ message: done, toast: true });
        void reloadList();
      } catch (e) {
        fail(e, seq === detailSeq.current);
      } finally {
        writing.current -= 1;
        end();
      }
    },
    [apply, begin, end, fail, showMessage, reloadList],
  );

  // 목록에서 다른 데이터를 골랐고 그 상세가 아직 오지 않았다 — 보이는 상세는 이전 데이터 것이라 아무 쓰기도 받지 않는다.
  const stale = mode === "detail" && !!view && view.maruDataId !== selectedId;
  const busy = pending > 0 || stale;

  const setField = useCallback((key: keyof HeaderForm, value: string) => {
    editSeq.current += 1;
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSaveHeader = useCallback(() => {
    if (!view || !form) return;
    if (!form.maruDataName.trim() || !form.codePattern.trim()) {
      setError({ message: "이름·키 패턴을 입력하세요.", reload: false });
      return;
    }
    void run(() => saveHeader(view.maruDataId, view.auditVer, form), "저장했습니다");
  }, [view, form, run]);

  const handleDeprecate = useCallback(() => {
    if (!view) return;
    void run(() => deprecateData(view.maruDataId, view.auditVer), "폐기했습니다");
  }, [view, run]);

  const handleItemEdit = useCallback(() => {
    if (!view) return;
    openMdmPage("dmd/dataItemMng", { maruDataId: view.maruDataId });
  }, [view]);

  // ── 등록(팝업) ──
  // 성공하면 팝업을 닫고 새 데이터를 고른다. 실패하면 팝업을 입력값과 함께 열어 둔 채 오류창을 위에 띄운다.
  const handleRegister = useCallback(
    async (regForm: DataMngRegForm) => {
      if (!regForm.maruDataId.trim() || !regForm.maruDataName.trim() || !regForm.codePattern.trim()) {
        setError({ message: "마루 데이터 ID·이름·키 패턴을 입력하세요.", reload: false });
        return;
      }
      writing.current += 1;
      begin();
      try {
        const result = await registerDataMng(regForm);
        showMessage({ message: "등록했습니다", toast: true });
        const registeredId = result.maruDataId ?? regForm.maruDataId.trim();
        setIsRegOpen(false);
        await reloadList();
        // 새 데이터의 상세가 올 때까지 busy 를 쥐고 있는다 — 그 전에 풀리면 안내 문구가 잠깐 보인다.
        await chooseDetail(registeredId);
      } catch (e) {
        fail(e);
      } finally {
        writing.current -= 1;
        end();
      }
    },
    [begin, end, reloadList, chooseDetail, showMessage, fail],
  );

  const columns = useMemo(() => buildDataMngColumns(), []);

  const canReg = canDoButton(rbac, "dataMng", "reg");
  const editable = !!view?.editable;
  const allowed = useCallback<Allowed>(
    (enabled, action) => !busy && enabled && canDoButton(rbac, "dataEdit", action),
    [busy, rbac],
  );
  const disabledInput = !editable || busy;

  return (
    <MdmPageLayout
      group="dmd"
      screenId="dataMng"
      title="마루 데이터"
      buttons={[
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: listLoading, action: "search" },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="ID">
          <Input
            data-testid="data-mng-search-id"
            value={id}
            onChange={setId}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="이름">
          <Input
            data-testid="data-mng-search-name"
            value={name}
            onChange={setName}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
        </SearchField>
        <SearchField label="상태">
          <Select data-testid="data-mng-search-status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dmd.dataMng">
        <ContentPanel key="list" width="42%">
          <div data-testid="data-mng-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <GridPanel
                title="마루 데이터 목록"
                count={rows.length}
                buttons={[
                  {
                    id: "btn_data_reg",
                    label: "데이터 등록",
                    onClick: () => setIsRegOpen(true),
                    // 권한이 없으면 숨기지 않고 비활성으로 둔다.
                    disabled: !canReg || busy || listLoading,
                  },
                ]}
              >
                <AgDataGrid
                  columnSizing="fit"
                  columns={columns}
                  data={rows as unknown as Record<string, unknown>[]}
                  rowKey="maruDataId"
                  sortable
                  loading={listLoading}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 마루 데이터가 없습니다"
                  emptyTestId="data-mng-list-empty"
                  highlightedRowKey={selectedId}
                  onRowClick={(r) => handleRowClick(String(r.maruDataId))}
                />
              </GridPanel>
            </div>
          </div>
        </ContentPanel>

        {mode === "detail" && view && form ? (
          // Part B §4-3 MUST: 분할 골격(ContentBody/ContentPanel)은 이 위치의 직접 자식이어야 drag bar 가 붙는다 —
          // 그래서 DataDetail.tsx 는 카드 "내용"만 내려주고, 골격은 여기서 직접 그린다.
          <ContentBody key="right" direction="column" resizable storageKey="mdm.dmd.dataMng.detail" flex="1 1 0">
            <ContentBody resizable storageKey="mdm.dmd.dataMng.detail.top">
              <ContentPanel flex="1 1 0">
                <DetailVeil stale={stale}>
                  <DataHeaderCard view={view} form={form} disabled={disabledInput} onFieldChange={setField} />
                </DetailVeil>
              </ContentPanel>
              <ContentPanel width={360}>
                <DetailVeil stale={stale}>
                  <DataLabelsCard form={form} disabled={disabledInput} onFieldChange={setField} />
                </DetailVeil>
              </ContentPanel>
            </ContentBody>
            <ContentPanel>
              <DetailVeil stale={stale}>
                <DataCategoryCard
                  view={view}
                  allowed={allowed}
                  editable={editable}
                  itemEditEnabled={!stale}
                  onSaveHeader={handleSaveHeader}
                  onDeprecate={handleDeprecate}
                  onItemEdit={handleItemEdit}
                />
              </DetailVeil>
            </ContentPanel>
          </ContentBody>
        ) : mode === "detail" ? (
          <ContentPanel key="right" flex="1 1 0">
            <p data-testid="detail-loading" style={{ padding: "var(--spacing-md)", ...mutedText }}>상세를 불러오는 중입니다</p>
          </ContentPanel>
        ) : (
          <ContentPanel key="right" flex="1 1 0">
            <p data-testid="data-mng-empty" style={{ padding: "var(--spacing-md)", ...mutedText }}>
              목록에서 마루 데이터를 고르거나 [데이터 등록] 을 누르세요
            </p>
          </ContentPanel>
        )}
      </ContentBody>

      {/* 열 때만 마운트한다 — 열 때마다 칸이 비고, ErrorModal 보다 먼저 그려 오류창이 위에 뜬다.
          오류창이 떠 있는 동안에는 Escape 한 번에 두 창이 함께 닫히지 않도록 팝업의 닫기를 무시한다(Local-Rules §18). */}
      {isRegOpen && (
        <Modal
          open
          title="마루 데이터 등록"
          size="md"
          onClose={() => {
            if (!error) setIsRegOpen(false);
          }}
        >
          <DataRegisterForm
            busy={busy}
            canRegister={canReg}
            onSubmit={(f) => void handleRegister(f)}
            onCancel={() => setIsRegOpen(false)}
          />
        </Modal>
      )}

      {error && (
        <ErrorModal
          message={error.message}
          onClose={() => {
            const reload = error.reload;
            setError(null);
            // 렌더 때 값이 아니라 지금 선택을 본다 — 모달이 떠 있는 사이 선택이 바뀌었을 수 있다.
            if (reload && selectedIdRef.current) void loadDetail(selectedIdRef.current);
          }}
        />
      )}
    </MdmPageLayout>
  );
}
