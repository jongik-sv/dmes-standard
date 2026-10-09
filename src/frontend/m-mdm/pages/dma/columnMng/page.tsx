"use client";

/**
 * columnMng — 컬럼 사전(TSK-04-04 design.md §6.16). 정본: docs/mdm/tasks/TSK-04-04/design.md.
 *
 * 위: 컬럼 목록(검색어는 논리명·표준 물리명·시스템별 실제 필드명). 아래 왼쪽: 컬럼명 자동 생성(한국어 ↔ 물리명 분해,
 * `***` 자리에서 용어 인라인 등록 팝업). 아래 오른쪽: 컬럼 상세와 시스템별 실제 필드명 그리드.
 *
 * 분해 규칙은 서버(compare)가 가진다. 토큰을 고친 뒤의 추천 도메인·중복·표시명 재계산도 compare 재호출로 서버에 맡긴다.
 * 오류는 서버 `meta.message` 만 화면에 온다(F12) — ErrorModal 에 그대로 보인다.
 * 쓰기 권한: [저장]·[신규]는 action "save", [분해]는 columnMng × "compare"(D6). 서버도 표준 관리자 역할을 다시 본다(D1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridLimitNotice,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import { Input, useBusy } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRefetch, useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { FIRST_SEARCH_LIMIT } from "@/oasis-screen";
import { MdmPageLayout } from "@/shell";

import { saveColumn, searchColumns, loadColumnOptions, viewColumn } from "./api";
import {
  ColumnDetailForm,
  SYSTEM_ROW_KEY,
  type ColumnDetailHandle,
} from "./ColumnDetailForm";
import { formatLabels } from "./labels";
import { NameGenPanel, type NameGenApply, type NameGenHandle } from "./NameGenPanel";
import { saveFormError, toSaveParams } from "./save-form";
import { mutedText } from "./styles";
import { emptyForm, type ColumnListRow, type SystemOption } from "./types";
import { uiCols } from "@/ui-meta";

const SCREEN_ID = "columnMng";

const LIST_COLUMNS: GridColumn[] = uiCols([
  { key: "columnName", header: "논리명", width: 170 },
  { key: "physName", header: "표준 물리명", width: 170 },
  { key: "labels", header: "표시명(긴/중간/짧은)", width: 240 },
  { key: "domain", header: "도메인", width: 190 },
  { key: "required", header: "필수", width: 60, align: "center" },
  { key: "termNames", header: "구성 용어", width: 200 },
  { key: "systemFields", header: "시스템 필드", width: 220 },
], ["columnName", "physName", "required"]);

export default function ColumnMngPage() {
  const rbac = useUserButtonRbac(true);
  const { showMessage } = useMessage();

  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·조회 결과(bulky)·건수·전체 보기 여부·선택 컬럼(selectedColumnId).
  // 선택한 컬럼의 상세(입력 값은 ColumnDetailForm 이 가진다)는 이어받지 않는다 — 새 창에서 selectedColumnId 로 `openColumn` 을 한 번 불러 서버에서 다시 읽는다.
  const [keyword, setKeyword] = useCarryState("keyword", "");
  const [domainFilter, setDomainFilter] = useCarryState("domainFilter", "");
  const [list, setList] = useCarryState<ColumnListRow[]>("list", [], { bulky: true });
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useCarryState<number | null>("selectedColumnId", null);

  /** 컬럼명 자동 생성 영역 — 입력·분해 결과는 NameGenPanel 이 갖는다(R12). */
  const genRef = useRef<NameGenHandle>(null);

  /** 컬럼 상세 — 입력 값은 ColumnDetailForm 이 갖는다(R12: 한 글자마다 루트가 다시 그려지지 않게). */
  const detailRef = useRef<ColumnDetailHandle>(null);
  const [formTerms, setFormTerms] = useState<(number | null)[]>([]);

  // 용도별 busy(R5) — list·detail·save·compare. 단추·[전체 보기]는 어느 작업이든 진행 중이면 잠근다(isBusy()).
  const { isBusy, run } = useBusy();
  const busy = isBusy();
  // 목록 그리드의 로딩 표시는 목록 조회만 켠다 — 상세·분해 호출까지 따라 켜면 행을 누를 때마다 목록이 깜빡인다.
  const [listLoading, setListLoading] = useState(false);
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [listTotal, setListTotal] = useCarryState<number | null>("listTotal", null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지. */
  const [showAll, setShowAll] = useCarryState("showAll", false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fail = useCallback(
    (e: unknown) => setErrorMessage(e instanceof Error ? e.message : String(e)),
    [],
  );
  /** 설명 칸의 형식 바꾸기 확인(공용 확인창). */
  const askConfirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) =>
        showMessage({
          title: "확인",
          message,
          alertType: "confirm",
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        }),
      ),
    [showMessage],
  );

  // ── 목록 ──────────────────────────────────────────────────────────────
  // [조회] 는 첫 조회 상한(R1)을 걸고, [전체 보기] 는 상한 없이 받는다. 저장 뒤 재조회는 지금 모드를 따른다.
  const loadList = useCallback(
    (kw: string, domainKeyword: string, all = false) =>
      run("list", async () => {
        setListLoading(true);
        try {
          const result = await searchColumns(kw, domainKeyword, all ? undefined : FIRST_SEARCH_LIMIT);
          setList(result.list ?? []);
          setListTotal(result.truncated ? (result.totalCount ?? null) : null);
          setShowAll(all);
          setSystems(result.systems ?? []);
        } catch (e) {
          fail(e);
        } finally {
          setListLoading(false);
        }
      }),
    [fail, run, setList, setListTotal, setShowAll],
  );

  // 분리 창이 조회 결과(행)를 못 받았을 때만 이어받은 조건으로 한 번 다시 조회한다(조회 안 한 탭은 재조회하지 않는다).
  useCarryRefetch(() => loadList(keyword, domainFilter, showAll));

  // 첫 진입 자동 목록 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청).
  // 진입 때 시스템 콤보 값만 받는다(optionsOnly — 서버 목록 조회 없음). 목록(list)은 채우지 않는다.
  useEffect(() => {
    let alive = true;
    loadColumnOptions()
      .then((result) => {
        if (!alive) return;
        setSystems(result.systems ?? []);
      })
      .catch(fail);
    return () => {
      alive = false;
    };
  }, [fail]);

  const listRows = useMemo(
    () =>
      list.map((r) => ({
        ...r,
        labels: formatLabels(r),
        domain: r.domainName
          ? `${r.domainName} (${r.domainStdName ?? ""})`
          : "",
      })),
    [list],
  );

  const openColumn = useCallback(
    (columnId: number) =>
      run("detail", async () => {
      try {
        const result = await viewColumn(columnId);
        const c = result.column;
        setSelectedColumnId(c.columnId);
        const listed = list.find((r) => r.columnId === c.columnId);
        detailRef.current?.load({
          domainLabel:
            c.domainId == null
              ? ""
              : listed?.domainName || `도메인 ${c.domainId}`,
          form: {
          columnId: c.columnId,
          columnName: c.columnName ?? "",
          physName: c.physName ?? "",
          labelLong: c.labelLong ?? "",
          labelMid: c.labelMid ?? "",
          labelShort: c.labelShort ?? "",
          description: c.description ?? "",
          domainId: c.domainId != null ? String(c.domainId) : "",
          required: c.required ? "Y" : "N",
          defaultValue: c.defaultValue ?? "",
          refKind: c.refKind ?? "",
          refTarget: c.refTarget ?? "",
          refCateId: c.refCateId ?? "",
          usageNote: c.usageNote ?? "",
          },
          systemRows: (result.systems ?? []).map((s, i) => ({
            [SYSTEM_ROW_KEY]: `r-${c.columnId}-${i}`,
            systemCode: s.systemCode,
            physName: s.physName,
            transform: s.transform ?? "",
            note: s.note ?? "",
          })),
        });
        setFormTerms(
          (result.terms ?? []).map((t) => (t.missing ? null : t.termId)),
        );
      } catch (e) {
        fail(e);
      }
      }),
    [fail, list, run, setSelectedColumnId],
  );

  // 분리 창이 이어받은 선택 컬럼이 있으면 마운트 직후 한 번 상세를 서버에서 다시 읽는다(상세는 컬럼 ID 로 읽는다). 목록 도착을 기다리지 않는다 —
  // 기다리면 목록이 0건이거나 재조회가 실패했을 때 대기가 남아, 나중에 사용자가 [조회]·저장한 뒤 이어받은 컬럼이 몰래 열려 작성 중인 폼을 덮는다.
  // 행이 함께 왔으면 도메인 이름은 목록 행에서, 행 없이 재조회 중이면 `openColumn` 의 물러서는 표시(「도메인 N」)로 둔다.
  // 포털 탭은 복원값이 없어 아무것도 하지 않는다. 한 번 쓰면 비워 두므로 openColumn 이 바뀌어 effect 가 다시 돌아도(StrictMode 포함) 다시 열지 않는다.
  const restored = useCarryRestored();
  const pendingRestoreId = useRef<number | null>(restored ? selectedColumnId : null);
  useEffect(() => {
    const id = pendingRestoreId.current;
    if (id == null) return;
    pendingRestoreId.current = null;
    void openColumn(id);
  }, [openColumn]);

  // ── 자동 생성 결과 적용 ───────────────────────────────────────────────
  /** NameGenPanel 의 [상세에 적용] — 상세 폼의 일부 칸을 덮어쓰고 구성 용어를 갱신한다. */
  const handleApply = useCallback((next: NameGenApply) => {
    detailRef.current?.apply({
      patch: next.patch,
      domainLabel: next.domainLabel,
      appliedPhys: next.appliedPhys,
    });
    setFormTerms(next.terms);
  }, []);

  // ── 상세·저장 ─────────────────────────────────────────────────────────
  const handleNew = useCallback(() => {
    setSelectedColumnId(null);
    detailRef.current?.load({ form: emptyForm(), domainLabel: "", systemRows: [] });
    setFormTerms([]);
    genRef.current?.reset();
  }, [setSelectedColumnId]);

  const handleSave = useCallback(async () => {
    // 서버와 같은 문구로 선검사한다(I12). 서버도 다시 막는다. 도메인은 필수가 아니다(D-141).
    const detail = detailRef.current;
    if (!detail) return;
    const form = detail.getForm();
    const blocked = saveFormError(form, formTerms);
    if (blocked) {
      setErrorMessage(blocked);
      return;
    }
    await run("save", async () => {
      try {
        const params = toSaveParams(form);
        const systemsPayload = detail.getSystemRows().map((r) => ({
          systemCode: String(r.systemCode ?? ""),
          physName: String(r.physName ?? ""),
          transform: String(r.transform ?? ""),
          note: String(r.note ?? ""),
        }));
        const termsPayload = formTerms.map((termId) => ({ termId }));
        const result = await saveColumn(params, systemsPayload, termsPayload);
        showMessage({ message: "저장했습니다", toast: true });
        await loadList(keyword, domainFilter, showAll);
        await openColumn(result.columnId);
      } catch (e) {
        fail(e);
      }
    });
  }, [
    domainFilter,
    fail,
    formTerms,
    keyword,
    loadList,
    openColumn,
    run,
    showAll,
    showMessage,
  ]);

  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canCompare = canDoButton(rbac, SCREEN_ID, "compare");

  return (
    <MdmPageLayout
      group="dma"
      screenId={SCREEN_ID}
      title="컬럼 사전"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: () => void loadList(keyword, domainFilter),
          type: "primary",
          disabled: busy,
          action: "search",
        },
        {
          id: "btn_new",
          label: "신규",
          onClick: handleNew,
          type: "light",
          disabled: busy,
          action: "save",
        },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save",
          disabled: busy,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={() => void loadList(keyword, domainFilter)}>
        <SearchField label="검색어" name="keyword" meta={false} type="text" value={keyword} onChange={setKeyword}>
          <Input
            data-testid="column-search-keyword"
            value={keyword}
            placeholder="논리명·표준 물리명·시스템별 실제 필드명"
            onChange={setKeyword}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loadList(keyword, domainFilter);
            }}
          />
        </SearchField>
        <SearchField label="도메인" defaultKey="domainFilter" type="text" value={domainFilter} onChange={setDomainFilter}>
          <Input
            data-testid="column-search-domain"
            value={domainFilter}
            placeholder="도메인 ID·도메인명·표준명"
            onChange={setDomainFilter}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loadList(keyword, domainFilter);
            }}
          />
        </SearchField>
      </SearchArea>

      <ContentBody root direction="column" resizable storageKey="mdm.dma.columnMng">
        <ContentPanel height={230}>
          <div
            data-testid="column-list"
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
          >
            {/* .grid-panel 은 contain: strict + height 100% 라 부모가 높이를 정해야 한다. */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <GridPanel
                title="컬럼 목록"
                count={list.length}
                titleExtra={
                  <GridLimitNotice
                    shownCount={list.length}
                    totalCount={listTotal}
                    onShowAll={() => void loadList(keyword, domainFilter, true)}
                    disabled={busy}
                    testId="column-list-limit"
                  />
                }
              >
                <AgDataGrid gridId="columnList"
                  columnSizing="fit"
                  columns={LIST_COLUMNS}
                  data={listRows}
                  rowKey="columnId"
                  sortable
                  highlightedRowKey={selectedColumnId}
                  onRowClick={(row) => void openColumn(Number(row.columnId))}
                  loading={listLoading}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 컬럼이 없습니다."
                />
              </GridPanel>
            </div>
            {list.length === 0 && !listLoading ? (
              <p
                data-testid="column-list-empty"
                style={{ ...mutedText, margin: "0 var(--spacing-sm)" }}
              >
                아래 자동 생성으로 첫 컬럼을 만드세요.
              </p>
            ) : null}
          </div>
        </ContentPanel>

        <ContentBody resizable storageKey="mdm.dma.columnMng.bottom">
          <ContentPanel flex="1 1 0">
            <NameGenPanel
              ref={genRef}
              canCompare={canCompare}
              busy={busy}
              run={run}
              onApply={handleApply}
              onOpenColumn={openColumn}
              onError={fail}
            />
          </ContentPanel>

          <ColumnDetailForm ref={detailRef} systems={systems} confirm={askConfirm} />
        </ContentBody>
      </ContentBody>

      {errorMessage && (
        <ErrorModal
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}
    </MdmPageLayout>
  );
}
