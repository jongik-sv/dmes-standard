"use client";

/**
 * 위젯 관리 「위젯 목록」 탭 — 조회조건 + 왼쪽 목록(코드 + 정의, 사용 중지 포함) + 오른쪽 상세·유형 편집기·미리보기.
 * 스펙 2026-10-02-widget-admin-generic §10.1, 계획 Task 4.
 * - 목록은 commWidgetMng/search 를 한 번 받아 buildAdminRows(코드 등록부·유형 등록부와 합치기)로 만들고, 검색·구분·사용은 화면에서 거른다.
 * - [새 위젯](유형 고르기) → 빈 상세(newDefForm). [저장] → toSaveParams(화면 전용 `__*` 키 제거) → save → 다시 조회·그 행 선택.
 * - [삭제](정의 위젯, 사용자 수 0)·[코드 값으로 되돌리기](덮어쓰기 행이 있을 때) → 확인 후 delete.
 * - 바뀐 값이 있는데 다른 행·새 위젯을 고르면 「저장하지 않은 변경을 버릴까요?」.
 * - 첫 조회가 실패하면(목록을 한 번도 못 받으면) 목록을 비우고 편집을 막는다(계획 Review Focus 1 과 같은 부류). [조회]로 다시 받는다.
 * - 상세 안 실행 버튼은 PageLayout 을 거치지 않으므로 canDoButton 으로 직접 권한을 본다(서버도 메뉴 RBAC 로 막는다).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { canDoButton, ContentBody, ContentPanel, SearchArea, SearchField, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { toWidgetDefRow, type WidgetDefRow } from "@dk-oasis/shared/widget";

import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";
import { WIDGET_TYPE_REGISTRY } from "@/lib/generated/widget-type-registry";

import { deleteWidgetDef, saveWidgetDef, searchWidgetDefs } from "./api";
import {
  blankOverrideNotice,
  buildAdminRows,
  canSaveForm,
  codeForm,
  filterAdminRows,
  isFormDirty,
  newDefForm,
  rowToForm,
  toSaveParams,
  validateDefForm,
} from "./form-model";
import {
  KIND_OPTIONS,
  SCREEN_ID,
  USE_FILTER_OPTIONS,
  emptyAdminFilters,
  type AdminFilters,
  type AdminRow,
  type DefForm,
  type WidgetAdminSearchResult,
} from "./types";
import { WidgetDetailForm } from "./WidgetDetailForm";
import { WidgetPreview } from "./WidgetPreview";

const COLUMNS: GridColumn[] = [
  { key: "widgetId", header: "ID", width: 3, minWidth: 120, align: "left" },
  { key: "title", header: "이름", width: 4, minWidth: 120, align: "left" },
  {
    key: "kind",
    header: "구분",
    width: 1,
    minWidth: 56,
    align: "center",
    render: (v) =>
      v === "정의" ? (
        <GridBadge label="정의" bg="var(--color-primary-soft)" color="var(--color-primary)" />
      ) : (
        <GridBadge label="코드" muted />
      ),
  },
  {
    key: "typeTitle",
    header: "유형",
    width: 2,
    minWidth: 90,
    align: "left",
    cellClassRules: { "cell-warning": (r: Record<string, unknown>) => r.unknownType === true },
  },
  {
    key: "useYn",
    header: "사용",
    width: 1,
    minWidth: 56,
    align: "center",
    render: (v) =>
      v === "N" ? (
        <GridBadge label="중지" muted />
      ) : (
        <GridBadge label="사용" bg="var(--color-success-soft)" color="var(--color-success)" />
      ),
  },
  { key: "defaultSize", header: "기본 크기", width: 1, minWidth: 72, align: "center" },
  { key: "userCount", header: "사용자 수", width: 1, minWidth: 72, align: "right" },
  {
    key: "overridden",
    header: "덮어씀",
    width: 1,
    minWidth: 60,
    align: "center",
    render: (v) => (v === true ? <GridBadge label="덮어씀" bg="var(--color-warning-soft)" color="var(--color-warning)" /> : null),
  },
];

/** [새 위젯] 선택지 — 유형 등록부(생성물, 정적). 제목 — 설명. */
const TYPE_OPTIONS = Object.values(WIDGET_TYPE_REGISTRY).map((t) => ({
  value: t.meta.id,
  label: t.meta.description ? `${t.meta.title} — ${t.meta.description}` : t.meta.title,
}));

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const formForRow = (row: AdminRow): DefForm =>
  row.kind === "코드" ? codeForm(row.widgetId, row.def) : rowToForm(row.def as WidgetDefRow);

export interface WidgetListTabProps {
  /** 값이 바뀌면 다시 조회한다(상단 [조회] 버튼). 0 은 첫 조회. */
  reloadSignal: number;
  /** 저장하지 않은 변경이 있는지 — 탭을 바꿀 때 화면이 확인을 묻는다. */
  onDirtyChange?: (dirty: boolean) => void;
  /** 조회·저장·삭제 처리 중인지 — 화면이 상단 [조회] 를 막는다. */
  onBusyChange?: (busy: boolean) => void;
}

export function WidgetListTab({ reloadSignal, onDirtyChange, onBusyChange }: WidgetListTabProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canDelete = canDoButton(rbac, SCREEN_ID, "delete");

  const [defs, setDefs] = useState<WidgetDefRow[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<AdminFilters>(emptyAdminFilters);
  /** 고른 행의 widgetId. 새 위젯(저장 전)은 "". */
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<DefForm | null>(null);
  const [baseline, setBaseline] = useState<DefForm | null>(null);
  const [editorErrors, setEditorErrors] = useState<string[]>([]);
  /** 유형 편집기가 첫 검사 결과를 알렸는가 — React.lazy 로 불러오는 동안은 오류 0건처럼 보이므로 그 사이 [저장]을 막는다. */
  const [editorReady, setEditorReady] = useState(false);
  /** 상세를 새로 열 때마다 올린다 — 유형 편집기·미리보기를 다시 마운트한다. */
  const [openSeq, setOpenSeq] = useState(0);
  /** 첫 조회 중으로 시작한다(첫 조회 effect 가 setState 를 동기로 부르지 않게). */
  const [isBusy, setIsBusy] = useState(true);
  /**
   * search 가 한 번이라도 성공했는가(applyList 에서만 true, 다시 false 로 두지 않는다).
   * 아니면 덮어쓰기(C) 행을 몰라 빈 코드 폼이 열리고, 그 저장이 기존 덮어쓰기(사용 중지 등)를 NULL 로 지운다 —
   * 목록을 비우고 [새 위젯]·[저장]·[삭제]·상세를 막는다. 나중 [조회] 실패는 이전 목록을 그대로 둔다.
   */
  const [loaded, setLoaded] = useState(false);
  const loadFailed = !loaded && !isBusy;

  const rows = useMemo(
    () => (loaded ? buildAdminRows(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defs, usage) : []),
    [loaded, defs, usage]
  );
  const visibleRows = useMemo(() => filterAdminRows(rows, filters), [rows, filters]);
  const selectedRow = useMemo(() => (selectedId ? (rows.find((r) => r.widgetId === selectedId) ?? null) : null), [rows, selectedId]);
  const dirty = isFormDirty(baseline, form);
  const formErrors = useMemo(() => (form ? validateDefForm(form) : []), [form]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  const openForm = useCallback((next: DefForm | null, widgetId: string) => {
    setSelectedId(widgetId);
    setForm(next);
    setBaseline(next);
    setEditorErrors([]);
    setEditorReady(false);
    setOpenSeq((n) => n + 1);
  }, []);

  /** 받은 목록을 반영하고 selectAfter 행을 연다(없으면 선택 해제). */
  const applyList = useCallback(
    (out: WidgetAdminSearchResult, selectAfter?: string) => {
      const nextDefs = out.defs.map(toWidgetDefRow).filter((d): d is WidgetDefRow => d !== null);
      setDefs(nextDefs);
      setUsage(out.usage);
      setLoaded(true);
      const nextRows = buildAdminRows(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, nextDefs, out.usage);
      const target = selectAfter ? nextRows.find((r) => r.widgetId === selectAfter) : undefined;
      if (target) openForm(formForRow(target), target.widgetId);
      else openForm(null, "");
    },
    [openForm]
  );

  const showError = useCallback(
    (e: unknown) => showMessage({ title: "오류", message: errorText(e), alertType: "error" }),
    [showMessage]
  );

  /** 다시 조회 — 처리 중 표시를 켜고 목록을 받는다. */
  const load = useCallback(
    async (selectAfter?: string) => {
      setIsBusy(true);
      try {
        applyList(await searchWidgetDefs(), selectAfter);
      } catch (e) {
        showError(e);
      } finally {
        setIsBusy(false);
      }
    },
    [applyList, showError]
  );

  /** 바뀐 값이 있으면 확인을 거친다. */
  const guard = useCallback(
    (message: string, action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      showMessage({ title: "확인", message, alertType: "confirm", onConfirm: action });
    },
    [dirty, showMessage]
  );

  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const requestReload = useCallback(() => {
    guard("저장하지 않은 변경이 있습니다. 조회하시겠습니까?", () => void load(selectedIdRef.current || undefined));
  }, [guard, load]);

  // 첫 조회 — 필수 조회조건이 없는 화면(screen-patterns §조회조건). isBusy 는 true 로 시작하므로 여기서는 결과만 반영한다.
  useEffect(() => {
    let cancelled = false;
    searchWidgetDefs()
      .then((out) => {
        if (!cancelled) applyList(out);
      })
      .catch((e: unknown) => {
        if (!cancelled) showError(e);
      })
      .finally(() => {
        if (!cancelled) setIsBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyList, showError]);

  // 상단 [조회] — 첫 렌더(0)는 위 첫 조회가 맡는다.
  const lastSignal = useRef(reloadSignal);
  useEffect(() => {
    if (reloadSignal === lastSignal.current) return;
    lastSignal.current = reloadSignal;
    requestReload();
  }, [reloadSignal, requestReload]);

  const handleRowClick = useCallback(
    (r: Record<string, unknown>) => {
      const row = r as AdminRow;
      if (row.widgetId === selectedId && form) return;
      guard("저장하지 않은 변경을 버릴까요?", () => openForm(formForRow(row), row.widgetId));
    },
    [selectedId, form, guard, openForm]
  );

  const handleNew = useCallback(
    (typeId: string) => {
      const type = WIDGET_TYPE_REGISTRY[typeId];
      if (!type || !loaded) return;
      guard("저장하지 않은 변경을 버릴까요?", () => openForm(newDefForm(type.meta), ""));
    },
    [loaded, guard, openForm]
  );

  const handleFormChange = useCallback((patch: Partial<DefForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleConfigChange = useCallback((next: unknown) => {
    setForm((prev) => (prev ? { ...prev, config: next } : prev));
  }, []);

  const handleEditorValidate = useCallback((errors: string[]) => {
    setEditorReady(true);
    setEditorErrors((prev) => (prev.join("\n") === errors.join("\n") ? prev : errors));
  }, []);

  const isDef = form?.srcTp === "D";
  const typeEntry = isDef && form?.typeId ? WIDGET_TYPE_REGISTRY[form.typeId] : undefined;
  const codeEntry = form && !isDef ? WIDGET_REGISTRY[form.widgetId] : undefined;
  const unknownType = isDef && !typeEntry;
  const clearedNotice = blankOverrideNotice(baseline, form);
  const allErrors = unknownType ? formErrors : [...formErrors, ...editorErrors];
  const shownErrors = clearedNotice ? [...allErrors, clearedNotice] : allErrors;

  const handleSave = useCallback(async () => {
    if (!form || !loaded) return;
    const errs = [...validateDefForm(form), ...editorErrors];
    if (errs.length > 0) {
      showMessage({ message: errs[0], alertType: "warning" });
      return;
    }
    setIsBusy(true);
    try {
      const saved = await saveWidgetDef(toSaveParams(form));
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      // 다시 조회가 실패해도 폼이 widgetId "" 로 남아 [저장]이 정의 행을 하나 더 만들지 않게, 받은 ID 를 폼·기준값에 먼저 넣는다.
      const savedId = saved.widgetId || form.widgetId;
      const savedForm = { ...form, widgetId: savedId };
      setSelectedId(savedId);
      setForm(savedForm);
      setBaseline(savedForm);
      await load(savedId);
    } catch (e) {
      showMessage({ title: "오류", message: errorText(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  }, [form, loaded, editorErrors, load, showMessage]);

  const handleDelete = useCallback(() => {
    const row = selectedRow;
    if (!row?.def) return;
    const isCode = row.kind === "코드";
    showMessage({
      title: "확인",
      message: isCode ? "덮어쓴 값을 지우고 코드 값으로 되돌리시겠습니까?" : "선택한 행을 삭제하시겠습니까?",
      alertType: "confirm",
      onConfirm: async () => {
        setIsBusy(true);
        try {
          await deleteWidgetDef(row.widgetId);
          showMessage({
            message: isCode ? "코드 값으로 되돌렸습니다." : "삭제되었습니다.",
            alertType: "success",
            toast: true,
          });
          await load(isCode ? row.widgetId : undefined);
        } catch (e) {
          showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        } finally {
          setIsBusy(false);
        }
      },
    });
  }, [selectedRow, load, showMessage]);

  const setFilter = <K extends keyof AdminFilters>(key: K, value: AdminFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const isCodeRow = selectedRow?.kind === "코드";
  const inUse = (selectedRow?.userCount ?? 0) > 0;
  /** 목록을 받았고 처리 중이 아니다 — 상세 칸·[새 위젯]·[삭제] 를 쓸 수 있다. */
  const editable = loaded && !isBusy;
  const deleteEnabled =
    editable && canDelete && !!selectedRow?.def && (isCodeRow ? selectedRow.overridden : !inUse);
  const saveEnabled = canSaveForm({
    loaded,
    busy: isBusy,
    canSave,
    form,
    baseline,
    unknownType,
    errorCount: allErrors.length,
    editorReady: editorReady || !typeEntry,
  });

  return (
    <>
      <SearchArea onSearch={requestReload}>
        <SearchField
          label="검색"
          value={filters.keyword}
          onChange={(v) => setFilter("keyword", v)}
          placeholder="이름·ID"
          historyKey="commWidgetMng.keyword"
        />
        <SearchField
          label="구분"
          type="select"
          options={KIND_OPTIONS}
          value={filters.kind}
          onChange={(v) => setFilter("kind", v as AdminFilters["kind"])}
        />
        <SearchField
          label="사용"
          type="select"
          options={USE_FILTER_OPTIONS}
          value={filters.useYn}
          onChange={(v) => setFilter("useYn", v as AdminFilters["useYn"])}
        />
      </SearchArea>

      <ContentBody root resizable storageKey="mcm.csa.commWidgetMng">
        <ContentPanel>
          {/* data-testid 를 받지 않는 래퍼라 레이아웃에 끼지 않는 display:contents 로 감싼다. */}
          <div data-testid="widget-admin-grid" style={{ display: "contents" }}>
            <GridPanel
              title="위젯 목록"
              count={visibleRows.length}
              titleExtra={
                loadFailed ? (
                  <span className="form-error-message" role="alert" data-testid="widget-admin-load-error">
                    위젯 목록을 불러오지 못했습니다. [조회]로 다시 시도하세요.
                  </span>
                ) : null
              }
              headerExtra={
                <Select
                  value=""
                  options={TYPE_OPTIONS}
                  placeholder="새 위젯(유형 고르기)"
                  disabled={!editable || !canSave || TYPE_OPTIONS.length === 0}
                  aria-label="새 위젯 유형"
                  data-testid="widget-admin-new"
                  onChange={handleNew}
                />
              }
            >
              <AgDataGrid
                rowKey="widgetId"
                columns={COLUMNS}
                data={visibleRows}
                columnSizing="fit"
                highlightedRowKey={selectedId || null}
                onRowClick={handleRowClick}
                loading={isBusy}
              />
            </GridPanel>
          </div>
        </ContentPanel>

        <ContentPanel width="50%">
          <div data-testid="widget-admin-detail" style={{ display: "contents" }}>
            {/* ContentPanel 은 overflow:hidden 이라 긴 상세(유형 편집기·미리보기)는 안쪽에서 스크롤한다. 버튼 줄은 아래에 고정한다. */}
            <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
              <WidgetDetailForm
                form={form}
                codeMeta={codeEntry?.meta}
                typeEntry={typeEntry}
                editorKey={String(openSeq)}
                disabled={!editable}
                errors={shownErrors}
                preview={
                  form && (codeEntry || typeEntry) ? (
                    <WidgetPreview key={openSeq} form={form} codeEntry={codeEntry} typeEntry={typeEntry} />
                  ) : null
                }
                onChange={handleFormChange}
                onConfigChange={handleConfigChange}
                onEditorValidate={handleEditorValidate}
              />
            </div>
            <div style={{ flex: "0 0 auto", display: "flex", gap: "var(--spacing-sm)", justifyContent: "flex-end", padding: "var(--spacing-sm)" }}>
              <Button
                variant="primary"
                disabled={!saveEnabled}
                data-testid="widget-admin-save"
                onClick={() => void handleSave()}
              >
                저장
              </Button>
              <Button
                variant={isCodeRow ? "default" : "danger"}
                disabled={!deleteEnabled}
                title={!isCodeRow && inUse ? "사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요" : undefined}
                data-testid="widget-admin-delete"
                onClick={handleDelete}
              >
                {isCodeRow ? "코드 값으로 되돌리기" : "삭제"}
              </Button>
            </div>
          </div>
        </ContentPanel>
      </ContentBody>
    </>
  );
}
