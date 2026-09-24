"use client";

/**
 * dataItemMng — 항목 관리 화면(05 「화면」 항목 관리, TSK-07-03 design.md §2).
 *
 * 마루 데이터를 고르면 머리(view)로 동적 열(계층 1차~lvl_cnt차, 라벨 있는 추가 컬럼, Q5)을 만들고 서버 페이징(search)으로
 * 한 쪽을 받는다. 열린 행의 칸은 그 자리에서 고치고 행의 「저장」으로 1건을 저장한다. 행마다 닫기·다시 열기·이력 버튼이
 * 있다. 등록은 오른쪽 등록 패널로 한다. EXTERNAL 원천이거나 DEPRECATED 면 조회 전용이다(Q6).
 *
 * 충돌 문구("다른 사용자가 수정했습니다")를 받으면 안내를 보이고 목록을 다시 부른다(F1, 수용 기준 4). 「이력」은 탭을
 * 옮기지 않고 아래 이력 패널에 같은 타임라인 컴포넌트로 연다(D8).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, Pagination } from "@dk-oasis/shared/grid";
import { Button, Checkbox, Input, Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout } from "@/shell";

import { DataHistoryTimeline } from "../dataHistory/DataHistoryTimeline";
import { searchDataHistory } from "../dataHistory/api";
import type { DataHistoryResult } from "../dataHistory/types";
import {
  closeDataItem,
  modifyDataItem,
  registerDataItem,
  reopenDataItem,
  searchDataItems,
  viewDataItems,
} from "./api";
import { buildItemColumns, isRowEditable, isRowVersionConflict, toSaveParams } from "./columns";
import {
  LVL_FIELDS,
  PAGE_SIZE,
  emptyFilters,
  emptyItemForm,
  type AttrField,
  type DataItemFilters,
  type DataItemForm,
  type DataItemHeader,
  type DataItemRow,
  type MaruDataOption,
} from "./types";

const SCREEN_ID = "dataItemMng";

type Draft = Record<string, unknown>;

export default function DataItemMngPage() {
  const rbac = useUserButtonRbac(true);
  const { showMessage } = useMessage();

  const [options, setOptions] = useState<MaruDataOption[]>([]);
  const [filters, setFilters] = useState<DataItemFilters>(emptyFilters);
  const [header, setHeader] = useState<DataItemHeader | null>(null);
  const [rows, setRows] = useState<DataItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [form, setForm] = useState<DataItemForm | null>(null);
  const [history, setHistory] = useState<DataHistoryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 마지막으로 조회한 조건·쪽 — 쪽 이동과 재조회(F1)가 쓴다. */
  const applied = useRef<{ filters: DataItemFilters; page: number }>({ filters: emptyFilters(), page: 0 });

  const runSearch = useCallback(async (f: DataItemFilters, p: number) => {
    if (!f.maruDataId) return;
    setBusy(true);
    try {
      const res = await searchDataItems(f, p, PAGE_SIZE);
      setRows(res.list ?? []);
      setTotal(res.totalCount ?? 0);
      setPage(res.page ?? p);
      setDrafts({});
      applied.current = { filters: f, page: res.page ?? p };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const reload = useCallback(
    () => runSearch(applied.current.filters, applied.current.page),
    [runSearch],
  );

  const loadHistory = useCallback(async (maruDataId: string, code: string) => {
    setHistory(await searchDataHistory({ maruDataId, target: "ITEM", cateId: "", key: code }));
  }, []);

  /** 쓰기 실패 — 문구를 그대로 보이고, 충돌이면 목록을 다시 부른다(F1). */
  const handleWriteError = useCallback(
    async (e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      if (isRowVersionConflict(message)) {
        await reload();
      }
    },
    [reload],
  );

  const afterWrite = useCallback(
    async (code: string, message: string) => {
      showMessage({ message, toast: true });
      await reload();
      if (history?.key === code && filters.maruDataId) {
        await loadHistory(filters.maruDataId, code);
      }
    },
    [filters.maruDataId, history?.key, loadHistory, reload, showMessage],
  );

  const selectMaruData = useCallback(
    async (maruDataId: string) => {
      const next = { ...emptyFilters(), maruDataId };
      setFilters(next);
      setForm(null);
      setHistory(null);
      setRows([]);
      setTotal(0);
      if (!maruDataId) {
        setHeader(null);
        return;
      }
      try {
        const view = await viewDataItems(maruDataId);
        setHeader(view.header ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      await runSearch(next, 0);
    },
    [runSearch],
  );

  useEffect(() => {
    void (async () => {
      try {
        const view = await viewDataItems();
        const list = view.maruDataOptions ?? [];
        setOptions(list);
        if (list.length > 0) await selectMaruData(list[0].maruDataId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [selectMaruData]);

  // ── 행 동작 ─────────────────────────────────────────────────────────────

  const rowAction = useCallback(
    async (row: Record<string, unknown>, action: "save" | "close" | "reopen" | "history") => {
      const md = applied.current.filters.maruDataId;
      const code = String(row.code ?? "");
      const rowVersion = Number(row.rowVersion ?? 0);
      setBusy(true);
      try {
        if (action === "save") {
          await modifyDataItem(toSaveParams(md, row));
          await afterWrite(code, "저장했습니다");
        } else if (action === "close") {
          await closeDataItem(md, code, rowVersion);
          await afterWrite(code, "닫았습니다");
        } else if (action === "reopen") {
          await reopenDataItem(md, code, rowVersion);
          await afterWrite(code, "다시 열었습니다");
        } else {
          await loadHistory(md, code);
        }
      } catch (e) {
        await handleWriteError(e);
      } finally {
        setBusy(false);
      }
    },
    [afterWrite, handleWriteError, loadHistory],
  );

  const cancelDraft = useCallback((code: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }, []);

  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canClose = canDoButton(rbac, SCREEN_ID, "delete");
  const canReopen = canDoButton(rbac, SCREEN_ID, "restore");
  const canReg = canDoButton(rbac, SCREEN_ID, "reg");

  const renderActions = useCallback(
    (row: Record<string, unknown>) => {
      const code = String(row.code ?? "");
      const editable = !!header?.editable;
      const hasDraft = !!drafts[code];
      const historyButton = (
        <Button size="mini" data-testid={`item-history-${code}`} onClick={() => void rowAction(row, "history")}>
          이력
        </Button>
      );
      if (editable && row.open === true && hasDraft) {
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            <Button
              size="mini"
              variant="primary"
              data-testid={`item-save-${code}`}
              disabled={busy || !canSave}
              onClick={() => void rowAction(row, "save")}
            >
              저장
            </Button>
            <Button size="mini" data-testid={`item-cancel-${code}`} onClick={() => cancelDraft(code)}>
              취소
            </Button>
          </span>
        );
      }
      if (editable && row.open === true) {
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            <Button
              size="mini"
              data-testid={`item-close-${code}`}
              disabled={busy || !canClose}
              onClick={() => void rowAction(row, "close")}
            >
              닫기
            </Button>
            {historyButton}
          </span>
        );
      }
      if (editable) {
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            <Button
              size="mini"
              data-testid={`item-reopen-${code}`}
              disabled={busy || !canReopen}
              onClick={() => void rowAction(row, "reopen")}
            >
              다시 열기
            </Button>
            {historyButton}
          </span>
        );
      }
      return historyButton;
    },
    [busy, canClose, canReopen, canSave, cancelDraft, drafts, header?.editable, rowAction],
  );

  const columns = useMemo(() => buildItemColumns(header, { renderActions }), [header, renderActions]);

  const gridRows = useMemo(
    () => rows.map((r) => ({ ...r, ...(drafts[r.code] ?? {}) }) as Record<string, unknown>),
    [rows, drafts],
  );

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown; row: Record<string, unknown> }) => {
      if (!isRowEditable(header, p.row)) return;
      const code = String(p.rowKey);
      setDrafts((prev) => ({ ...prev, [code]: { ...(prev[code] ?? {}), [p.field]: p.newValue ?? "" } }));
    },
    [header],
  );

  // ── 등록 패널 ───────────────────────────────────────────────────────────

  const handleRegister = useCallback(async () => {
    if (!form) return;
    const md = applied.current.filters.maruDataId;
    setBusy(true);
    try {
      const params = toSaveParams(md, form);
      await registerDataItem(params);
      setForm(null);
      await afterWrite(String(params.code ?? ""), "등록했습니다");
    } catch (e) {
      await handleWriteError(e);
    } finally {
      setBusy(false);
    }
  }, [afterWrite, form, handleWriteError]);

  const formFields = useMemo(() => {
    const fields: { key: keyof DataItemForm; label: string }[] = [
      { key: "code", label: "키 *" },
      { key: "name", label: "이름 *" },
      { key: "alterName", label: "약칭" },
      { key: "seq", label: "순서" },
      { key: "description", label: "설명" },
    ];
    LVL_FIELDS.slice(0, Math.max(0, Math.min(5, header?.lvlCnt ?? 0))).forEach((f, i) =>
      fields.push({ key: f, label: `${i + 1}차` }),
    );
    for (const label of header?.attrLabels ?? []) {
      fields.push({ key: label.field as AttrField, label: label.label });
    }
    return fields;
  }, [header]);

  const maruOptions = useMemo(
    () => options.map((o) => ({ value: o.maruDataId, label: `${o.maruDataName} (${o.maruDataId})` })),
    [options],
  );
  const cateOptions = useMemo(
    () => [
      { value: "", label: "전체" },
      ...(header?.categories ?? [])
        .filter((c) => c.cateId !== "BASE")
        .map((c) => ({ value: c.cateId, label: `${c.cateName ?? c.cateId} (${c.cateId})` })),
    ],
    [header],
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <MdmPageLayout
      group="dmd"
      screenId={SCREEN_ID}
      title="항목 관리"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: () => void runSearch(filters, 0),
          type: "primary" as const,
          disabled: busy || !filters.maruDataId,
          action: "search",
        },
        {
          id: "btn_add",
          label: "항목 추가",
          onClick: () => setForm(emptyItemForm()),
          disabled: busy || !header?.editable || !canReg,
          action: "reg",
        },
      ]}
    >
      <SearchArea onSearch={() => void runSearch(filters, 0)}>
        <SearchField label="마루 데이터">
          <Select
            data-testid="item-search-maru"
            aria-label="마루 데이터"
            value={filters.maruDataId}
            options={maruOptions}
            onChange={(v) => void selectMaruData(v)}
          />
        </SearchField>
        <SearchField label="키">
          <Input
            data-testid="item-search-code"
            aria-label="키"
            value={filters.code}
            onChange={(v) => setFilters((prev) => ({ ...prev, code: v }))}
          />
        </SearchField>
        <SearchField label="이름">
          <Input
            data-testid="item-search-name"
            aria-label="이름"
            value={filters.name}
            onChange={(v) => setFilters((prev) => ({ ...prev, name: v }))}
          />
        </SearchField>
        <SearchField label="카테고리">
          <Select
            data-testid="item-search-cate"
            aria-label="카테고리"
            value={filters.cateId}
            options={cateOptions}
            onChange={(v) => setFilters((prev) => ({ ...prev, cateId: v }))}
          />
        </SearchField>
        <SearchField label="닫힌 항목">
          <Checkbox
            label="닫힌 항목 보기"
            aria-label="닫힌 항목 보기"
            checked={filters.showClosed}
            onChange={(checked) => setFilters((prev) => ({ ...prev, showClosed: checked }))}
          />
        </SearchField>
      </SearchArea>

      <ContentBody root direction="column">
        <ContentBody>
          <ContentPanel flex={1}>
            <div data-testid="item-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <GridPanel title={header ? `항목 — ${header.maruDataName}` : "항목"} count={total}>
                {header && !header.editable && (
                  <p data-testid="item-readonly" style={{ color: "var(--color-text-muted)", margin: 0 }}>
                    조회 전용입니다(원천 {header.sourceSystem ?? header.sourceKind}, 상태 {header.status}).
                  </p>
                )}
                <AgDataGrid
                  columns={columns}
                  data={gridRows}
                  rowKey="code"
                  sortable={false}
                  columnSizing="fit"
                  singleClickEdit
                  onCellValueChanged={handleCellChange}
                  loading={busy}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 항목이 없습니다."
                />
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  totalElements={total}
                  onPageChange={(p) => void runSearch(applied.current.filters, p)}
                  disabled={busy}
                />
              </GridPanel>
            </div>
          </ContentPanel>

          {form && (
            <ContentPanel width={360}>
              <div data-testid="item-form">
                <p style={{ padding: "0 var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  항목 추가
                </p>
                <table style={DETAIL_TABLE_STYLE}>
                  <tbody>
                    {formFields.map((f) => (
                      <tr key={f.key}>
                        <th style={DETAIL_LABEL_CELL}>{f.label}</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            data-testid={`item-form-${f.key}`}
                            value={form[f.key]}
                            disabled={busy}
                            onChange={(v) => setForm((prev) => (prev ? { ...prev, [f.key]: v } : prev))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: "flex", gap: "var(--spacing-sm)", padding: "var(--spacing-sm) var(--spacing-md)" }}>
                  <Button
                    variant="primary"
                    data-testid="item-form-submit"
                    disabled={busy || !canReg}
                    onClick={() => void handleRegister()}
                  >
                    등록
                  </Button>
                  <Button data-testid="item-form-cancel" onClick={() => setForm(null)}>
                    취소
                  </Button>
                </div>
              </div>
            </ContentPanel>
          )}
        </ContentBody>

        {history && (
          <ContentPanel height={280}>
            <div data-testid="item-history" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>이력 — {history.key}</span>
                <Button size="mini" data-testid="item-history-close" onClick={() => setHistory(null)}>
                  이력 닫기
                </Button>
              </div>
              <DataHistoryTimeline result={history} />
            </div>
          </ContentPanel>
        )}
      </ContentBody>

      {error && <ErrorModal message={error} onClose={() => setError(null)} />}
    </MdmPageLayout>
  );
}
