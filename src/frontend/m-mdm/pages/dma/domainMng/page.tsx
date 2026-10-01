"use client";

/**
 * domainMng — 도메인 관리(TSK-04-03). 정본: docs/mdm/screens/domainMng/domainMng_기능설계서.md, design.md §3.5·§3.8.
 *
 * 들여쓴 상속 트리 + 기본 속성 + 두 칸 검증식 + 미리보기·테스트 케이스 + 영향도·변경 분류·diff·검사 목록.
 * 표준식 미리보기는 서버가 준 유효 표준 AST 를 화면 JS 로 즉시 평가하고, 비즈니스식과 편집 중인 식은
 * 400 ms 디바운스한 서버 `execute` 로 평가한다(편집 권한자만). 저장은 현재 초안으로 도메인검증을 통과한 뒤에만 열린다.
 * 부모 연결·교체·제거는 [부모 연결]·[연결 제거] 대화상자에서 저장된 행 기준으로 따로 검사·저장한다(D-132).
 * OBJECT_ID = screenId = BPMN process id = 'domainMng'(불변 I17).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import {
  ContentBody, ContentPanel, ErrorModal, SearchArea, SearchField, canDoButton, useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout } from "@/shell";
import { executePreview, saveDomain, searchDomains, validateDomain, viewDomain } from "./api";
import { parentCandidates } from "./domain-tree";
import { storedForm, type ParentLinkMode } from "./parent-link";
import { previewStandard } from "./preview";
import { DomainBasicForm, KIND_OPTIONS } from "./components/DomainBasicForm";
import { DomainCheckList } from "./components/DomainCheckList";
import { DomainImpactPanel } from "./components/DomainImpactPanel";
import { DomainPreviewPanel } from "./components/DomainPreviewPanel";
import { DomainRuleEditor } from "./components/DomainRuleEditor";
import { DomainTestCaseGrid } from "./components/DomainTestCaseGrid";
import { DomainTreeGrid } from "./components/DomainTreeGrid";
import { ParentLinkModal } from "./components/ParentLinkModal";
import { hint, sectionBody, sectionTitle } from "./components/styles";
import type {
  DomainDetail, DomainDraft, DomainRow, ExecuteResult, ImpactTable, RequiredVarRow, SearchFilters, TestCaseRow, ValidateResult,
} from "./types";

const SCREEN_ID = "domainMng";
const DEBOUNCE_MS = 400;

type Mode = "none" | "edit" | "new" | "child";

const EMPTY_DRAFT: DomainDraft = {
  domainId: null, ver: null, domainName: "", stdName: "", parentDomainId: null, domainKind: null, dataType: null,
  length: null, scale: null, unitCode: null, maruCodeId: null, cateId: null, stdRule: "", bizRule: "", description: "",
};

const KIND_FILTER = [{ value: "", label: "전체" }, ...KIND_OPTIONS];

function splitExamples(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

/** 식에 영향을 주는 칸 — 저장된 값과 같으면 저장된 유효 AST 로 즉시 판정, 다르면 서버가 새 AST 를 만든다. */
function exprKey(d: DomainDraft): string {
  return JSON.stringify([d.parentDomainId, d.domainKind, d.dataType, d.scale, d.maruCodeId || null, d.cateId || null,
    (d.stdRule ?? "").trim(), (d.bizRule ?? "").trim()]);
}

export default function DomainMngPage() {
  const rbac = useUserButtonRbac();
  const canEdit = canDoButton(rbac, SCREEN_ID, "save");
  const canValidate = canDoButton(rbac, SCREEN_ID, "validate");
  const canExecute = canDoButton(rbac, SCREEN_ID, "execute");
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<SearchFilters>({ keyword: "", domainKind: "" });
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<DomainDetail | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [draft, setDraft] = useState<DomainDraft>(EMPTY_DRAFT);
  const [storedExprKey, setStoredExprKey] = useState<string | null>(null);
  const [cases, setCases] = useState<TestCaseRow[]>([]);
  const [examplesText, setExamplesText] = useState("");
  const [requiredVars, setRequiredVars] = useState<RequiredVarRow[]>([]);
  const [impact, setImpact] = useState<ImpactTable | null>(null);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [validatedKey, setValidatedKey] = useState<string | null>(null);
  const [previewValue, setPreviewValue] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [server, setServer] = useState<ExecuteResult | null>(null);
  const [serverPending, setServerPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parentLink, setParentLink] = useState<ParentLinkMode | null>(null);
  const [storedKey, setStoredKey] = useState<string | null>(null);

  const readOnly = mode === "none" || !canEdit || busy;
  const currentKey = useMemo(() => JSON.stringify([draft, cases, examplesText]), [draft, cases, examplesText]);
  const parentRow = useMemo(
    () => rows.find((r) => r.DOMAIN_ID === draft.parentDomainId) ?? null,
    [rows, draft.parentDomainId],
  );

  // ── 조회 ──
  const runSearch = useCallback(async (f: SearchFilters) => {
    setLoading(true);
    try {
      const out = await searchDomains(f);
      setRows(out.domains ?? []);
      return out.domains ?? [];
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch({ keyword: "", domainKind: "" });
  }, [runSearch]);

  const resetResults = () => {
    setValidation(null);
    setValidatedKey(null);
    setServer(null);
  };

  // ── 행 선택 → view ──
  const openDomain = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const out = await viewDomain(id);
      const d = out.domain;
      if (!d) return;
      const stored = storedForm(d);
      const next = stored.draft;
      const examples = stored.examples.join(", ");
      setSelectedId(d.DOMAIN_ID);
      setSelectedRow(d);
      setDraft(next);
      setStoredExprKey(exprKey(next));
      setCases(stored.cases);
      setExamplesText(examples);
      setStoredKey(JSON.stringify([next, stored.cases, examples]));
      setRequiredVars(out.requiredVars ?? []);
      setImpact(out.impact ?? null);
      setMode("edit");
      setPreviewValue("");
      setVarValues({});
      resetResults();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // ── B-002 / B-003 ──
  const startNew = () => {
    setDraft({ ...EMPTY_DRAFT });
    setStoredExprKey(null);
    setCases([]);
    setExamplesText("");
    setRequiredVars([]);
    setImpact(null);
    setMode("new");
    setPreviewValue("");
    resetResults();
  };

  const startChild = () => {
    if (!selectedRow) return;
    setDraft({
      ...EMPTY_DRAFT, parentDomainId: selectedRow.DOMAIN_ID, domainKind: selectedRow.DOMAIN_KIND,
      dataType: selectedRow.DATA_TYPE,
    });
    setStoredExprKey(null);
    setCases([]);
    setExamplesText("");
    setRequiredVars([]);
    setImpact(null);
    setMode("child");
    setPreviewValue("");
    resetResults();
  };

  // ── B-004 도메인검증 ──
  const handleValidate = async () => {
    setBusy(true);
    try {
      const out = await validateDomain(draft, cases, splitExamples(examplesText));
      setValidation(out);
      setValidatedKey(currentKey);
      if (out.requiredVars) setRequiredVars(out.requiredVars);
      if (out.impact) setImpact(out.impact);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── B-005 저장 ──
  const doSave = async () => {
    setBusy(true);
    try {
      const out = await saveDomain(draft, cases, splitExamples(examplesText));
      showMessage({ message: "저장했습니다.", alertType: "info", toast: true });
      await runSearch(filters);
      if (out.domainId) await openDomain(out.domainId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    const warnW01 = (validation?.issues ?? []).find((i) => i.CODE === "W01");
    if (warnW01) {
      showMessage({ title: "확인", message: `${warnW01.MESSAGE} 그래도 저장할까요?`, alertType: "confirm", onConfirm: () => void doSave() });
      return;
    }
    void doSave();
  };

  const canSave = canEdit && mode !== "none" && !!validation?.ok && validatedKey === currentKey && !busy;

  // ── 미리보기 ──
  const editingExpr = mode !== "edit" || storedExprKey !== exprKey(draft);
  const storedAst = !editingExpr ? (selectedRow?.EFF_STD_AST ?? null) : null;
  const hasBiz = editingExpr ? (draft.bizRule ?? "").trim() !== "" || !!parentRow?.HAS_BIZ : !!selectedRow?.HAS_BIZ;
  const needServer = mode !== "none" && canExecute && (editingExpr || hasBiz);
  const bizVars = (editingExpr ? server?.bizRequiredVars : selectedRow?.BIZ_REQUIRED_VARS) ?? [];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewKey = JSON.stringify([exprKey(draft), draft.stdName, previewValue, varValues]);

  useEffect(() => {
    if (!needServer) return;
    if (timer.current) clearTimeout(timer.current);
    setServerPending(true);
    timer.current = setTimeout(() => {
      const vars = Object.entries(varValues).filter(([, v]) => v.trim() !== "").map(([NAME, VALUE]) => ({ NAME, VALUE }));
      executePreview({
        domainId: draft.domainId, parentDomainId: draft.parentDomainId, domainKind: draft.domainKind,
        dataType: draft.dataType, scale: draft.scale, stdName: draft.stdName, maruCodeId: draft.maruCodeId,
        cateId: draft.cateId, stdRule: draft.stdRule, bizRule: draft.bizRule, value: previewValue,
      }, vars)
        .then((out) => setServer(out))
        .catch(() => setServer(null))
        .finally(() => setServerPending(false));
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // previewKey 가 식·입력값·변수를 모두 담는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needServer, previewKey]);

  const stdAstForPreview = editingExpr ? (server?.effStdAst ?? null) : storedAst;
  const stdPreview = previewStandard(stdAstForPreview, previewValue, draft.dataType);
  const effStdExpr = editingExpr ? (server?.effStdExpr ?? null) : (selectedRow?.EFF_STD_EXPR ?? null);
  const effBizExpr = editingExpr ? (server?.effBizExpr ?? null) : (selectedRow?.EFF_BIZ_EXPR ?? null);

  const candidates = useMemo(() => parentCandidates(rows, draft.domainId), [rows, draft.domainId]);
  const results = validation?.testResults ?? [];

  return (
    <MdmPageLayout
      group="dma"
      screenId={SCREEN_ID}
      title="도메인 관리"
      buttons={[
        { id: "btn_search", label: "조회", type: "primary", action: "search", onClick: () => void runSearch(filters) },
        { id: "btn_new", label: "도메인 등록", action: "save", disabled: busy, onClick: startNew },
        { id: "btn_child", label: "하위 도메인 등록", action: "save", disabled: busy || !selectedRow, onClick: startChild },
        { id: "btn_link_parent", label: "부모 연결", action: "save", disabled: busy || mode !== "edit" || !selectedRow,
          onClick: () => setParentLink("link") },
        { id: "btn_unlink_parent", label: "연결 제거", action: "save",
          disabled: busy || mode !== "edit" || selectedRow?.PARENT_DOMAIN_ID == null, onClick: () => setParentLink("unlink") },
      ]}
    >
      <SearchArea onSearch={() => void runSearch(filters)}>
        <SearchField label="검색어" value={filters.keyword} placeholder="도메인명·표준명"
          onChange={(v) => setFilters((f) => ({ ...f, keyword: v }))} />
        <SearchField label="종류" type="select" value={filters.domainKind} options={KIND_FILTER}
          onChange={(v) => setFilters((f) => ({ ...f, domainKind: v }))} />
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dma.domainMng">
        <ContentPanel width="46%">
          <DomainTreeGrid rows={rows} selectedId={selectedId} loading={loading} onSelect={(r) => void openDomain(r.DOMAIN_ID)} />
        </ContentPanel>

        <ContentPanel>
          <div style={{ overflowY: "auto", height: "100%" }}>
            {mode === "none" && (
              <p style={{ ...hint, padding: "var(--spacing-md)" }}>
                목록에서 도메인을 선택하거나 [도메인 등록] 을 누르세요.
              </p>
            )}
            {mode !== "none" && (
              <>
                <p style={sectionTitle}>
                  기본 속성{mode === "new" ? " — 신규" : mode === "child" ? " — 하위 도메인 신규" : ""}
                </p>
                <div style={sectionBody}>
                  <DomainBasicForm
                    draft={draft}
                    structureLocked={mode === "child" || mode === "edit"}
                    parentLocked={mode === "child" || mode === "edit"}
                    readOnly={readOnly}
                    parentOptions={candidates}
                    parentRow={parentRow}
                    examplesText={examplesText}
                    onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                    onExamplesChange={setExamplesText}
                  />
                </div>

                <p style={sectionTitle}>검증식</p>
                <div style={sectionBody}>
                  <DomainRuleEditor draft={draft} readOnly={readOnly} effStdExpr={effStdExpr} effBizExpr={effBizExpr}
                    requiredVars={requiredVars} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
                </div>

                <p style={sectionTitle}>미리보기와 테스트 케이스</p>
                <div style={sectionBody}>
                  <DomainPreviewPanel value={previewValue} onValueChange={setPreviewValue} std={stdPreview}
                    biz={server?.biz} hasBiz={hasBiz} requiredVars={bizVars} varValues={varValues}
                    onVarChange={(n, v) => setVarValues((m) => ({ ...m, [n]: v }))}
                    serverEnabled={canExecute} pending={serverPending && needServer} />
                  <DomainTestCaseGrid cases={cases} results={results} readOnly={readOnly} showVars={hasBiz}
                    onChange={setCases} />
                </div>

                <p style={sectionTitle}>영향도와 처리</p>
                <div style={sectionBody}>
                  <DomainImpactPanel impact={impact} classification={validation?.classification} diff={validation?.diff ?? []} />
                  <DomainCheckList validated={validation !== null && validatedKey !== null} ok={validation?.ok}
                    issues={validation?.issues ?? []} descendantResults={results.filter((r) => !r.OWN)} />
                  {canValidate && canEdit && (
                    <div style={{ display: "flex", gap: "var(--spacing-sm)", marginTop: "var(--spacing-sm)" }}>
                      <Button onClick={() => void handleValidate()} disabled={busy}>도메인검증</Button>
                      <Button variant="primary" onClick={handleSave} disabled={!canSave}>저장</Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ContentPanel>
      </ContentBody>

      {selectedRow && (
        <ParentLinkModal open={parentLink !== null} mode={parentLink ?? "link"} domain={selectedRow}
          dirty={storedKey !== null && storedKey !== currentKey} onClose={() => setParentLink(null)}
          onChanged={(id) => {
            void runSearch(filters).then(() => openDomain(id));
          }} />
      )}
      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
