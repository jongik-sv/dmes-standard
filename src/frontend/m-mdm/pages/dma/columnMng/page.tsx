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
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
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
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { FIRST_SEARCH_LIMIT } from "@/oasis-screen";
import { MdmPageLayout, badgeStyle } from "@/shell";

import { compareName, saveColumn, searchColumns, loadColumnOptions, viewColumn } from "./api";
import {
  ColumnDetailForm,
  SYSTEM_ROW_KEY,
  type ColumnDetailHandle,
} from "./ColumnDetailForm";
import { formatLabels } from "./labels";
import { saveFormError, toSaveParams } from "./save-form";
import {
  PLACEHOLDER,
  composeLogicalName,
  composePhysName,
  hasPlaceholder,
  replaceToken,
  TOKEN_COLUMN_SIZES,
} from "./tokens";
import { mutedText, panelScrollStyle, panelTitleStyle, rowStyle } from "./styles";
import {
  emptyForm,
  type ColumnListRow,
  type CompareResult,
  type Direction,
  type NameToken,
  type PickedTerm,
  type SystemOption,
} from "./types";
import { TermRegPopModal } from "../termRegPop";

const SCREEN_ID = "columnMng";

const LIST_COLUMNS: GridColumn[] = [
  { key: "columnName", header: "논리명", width: 170 },
  { key: "physName", header: "표준 물리명", width: 170 },
  { key: "labels", header: "표시명(긴/중간/짧은)", width: 240 },
  { key: "domain", header: "도메인", width: 190 },
  { key: "required", header: "필수", width: 60, align: "center" },
  { key: "termNames", header: "구성 용어", width: 200 },
  { key: "systemFields", header: "시스템 필드", width: 220 },
];

const STATUS_TEXT: Record<NameToken["status"], string> = {
  MATCHED: "등록됨",
  SYNONYM: "동의어",
  AMBIGUOUS: "동음이의어",
  NO_ABBR: "약어 없음",
  UNKNOWN: "미등록",
};

/** 사용자가 고른 동음이의어 — compare 를 다시 불러도 seq·surface 가 같으면 되살린다. */
type Picks = Record<number, { surface: string; term: PickedTerm }>;

export default function ColumnMngPage() {
  const rbac = useUserButtonRbac(true);
  const { showMessage } = useMessage();

  const [keyword, setKeyword] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [list, setList] = useState<ColumnListRow[]>([]);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState<number | null>(null);

  const [direction, setDirection] = useState<Direction>("FORWARD");
  const [genInput, setGenInput] = useState("");
  const [gen, setGen] = useState<CompareResult | null>(null);
  const [genTokens, setGenTokens] = useState<NameToken[]>([]);
  const [genDomain, setGenDomain] = useState("");
  const [picks, setPicks] = useState<Picks>({});
  const [popToken, setPopToken] = useState<NameToken | null>(null);

  /** 컬럼 상세 — 입력 값은 ColumnDetailForm 이 갖는다(R12: 한 글자마다 루트가 다시 그려지지 않게). */
  const detailRef = useRef<ColumnDetailHandle>(null);
  const [formTerms, setFormTerms] = useState<(number | null)[]>([]);

  const [busy, setBusy] = useState(false);
  // 목록 그리드의 로딩 표시는 목록 조회만 켠다 — 상세·분해 호출까지 따라 켜면 행을 누를 때마다 목록이 깜빡인다.
  const [listLoading, setListLoading] = useState(false);
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [listTotal, setListTotal] = useState<number | null>(null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지. */
  const [showAll, setShowAll] = useState(false);
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
    async (kw: string, domainKeyword: string, all = false) => {
      setBusy(true);
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
        setBusy(false);
        setListLoading(false);
      }
    },
    [fail],
  );

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
    async (columnId: number) => {
      setBusy(true);
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
      } finally {
        setBusy(false);
      }
    },
    [fail, list],
  );

  // ── 자동 생성 ─────────────────────────────────────────────────────────
  const runCompare = useCallback(
    async (dir: Direction, input: string, keep: Picks) => {
      setBusy(true);
      try {
        const result = await compareName(dir, input);
        let tokens = result.tokens ?? [];
        for (const [seq, pick] of Object.entries(keep)) {
          const t = tokens.find((x) => x.seq === Number(seq));
          if (t && t.surface === pick.surface && t.status === "AMBIGUOUS") {
            tokens = replaceToken(tokens, t.seq, pick.term).map((x) =>
              x.seq === t.seq ? { ...x, status: "AMBIGUOUS" } : x,
            );
          }
        }
        setGen(result);
        setGenTokens(tokens);
        setGenDomain(
          result.recommendedDomainId != null
            ? String(result.recommendedDomainId)
            : "",
        );
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [fail],
  );

  const handleDecompose = useCallback(() => {
    setPicks({});
    void runCompare(direction, genInput, {});
  }, [direction, genInput, runCompare]);

  const handlePickCandidate = useCallback(
    (token: NameToken, termId: string) => {
      const cand = token.candidates.find((c) => String(c.termId) === termId);
      if (!cand) return;
      const term: PickedTerm = {
        termId: cand.termId,
        termName: cand.termName,
        senseNo: cand.senseNo,
        engAbbr: cand.engAbbr ?? null,
      };
      setPicks((prev) => ({
        ...prev,
        [token.seq]: { surface: token.surface, term },
      }));
      setGenTokens((prev) =>
        replaceToken(prev, token.seq, term).map((x) =>
          x.seq === token.seq ? { ...x, status: "AMBIGUOUS" } : x,
        ),
      );
    },
    [],
  );

  /** 팝업에서 용어를 고르면(새로 등록했든 기존 유사어든) 그 자리를 바꾸고 compare 를 다시 불러 추천·중복·표시명을 새로 받는다. */
  const handleTermPicked = useCallback(
    (term: PickedTerm) => {
      if (!popToken) return;
      const replaced = replaceToken(genTokens, popToken.seq, term);
      const logical = composeLogicalName(replaced);
      setPopToken(null);
      setGenInput(logical);
      void runCompare("FORWARD", logical, picks);
    },
    [genTokens, picks, popToken, runCompare],
  );

  const previewPhys = gen
    ? gen.direction === "FORWARD"
      ? composePhysName(genTokens)
      : gen.physName
    : "";

  const handleApply = useCallback(() => {
    if (!gen) return;
    const forward = gen.direction === "FORWARD";
    const phys = forward ? composePhysName(genTokens) : gen.physName;
    const logical = forward ? composeLogicalName(genTokens) : gen.logicalName;
    const rec = genDomain
      ? gen.domains.find((d) => String(d.domainId) === genDomain)
      : undefined;
    detailRef.current?.apply({
      patch: {
        columnName: logical,
        physName: phys,
        ...(forward && gen.labels
          ? {
              labelLong: gen.labels.labelLong,
              labelMid: gen.labels.labelMid,
              labelShort: gen.labels.labelShort,
            }
          : {}),
        ...(genDomain ? { domainId: genDomain } : {}),
      },
      domainLabel: genDomain
        ? (rec?.domainName ?? `도메인 ${genDomain}`)
        : undefined,
      appliedPhys: hasPlaceholder(genTokens) ? null : phys,
    });
    setFormTerms(
      genTokens.map((t) =>
        t.status === "UNKNOWN" || t.status === "NO_ABBR" ? null : t.termId,
      ),
    );
  }, [gen, genDomain, genTokens]);

  // ── 상세·저장 ─────────────────────────────────────────────────────────
  const handleNew = useCallback(() => {
    setSelectedColumnId(null);
    detailRef.current?.load({ form: emptyForm(), domainLabel: "", systemRows: [] });
    setFormTerms([]);
    setGen(null);
    setGenTokens([]);
    setGenInput("");
    setGenDomain("");
    setPicks({});
  }, []);

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
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }, [
    domainFilter,
    fail,
    formTerms,
    keyword,
    loadList,
    openColumn,
    showAll,
    showMessage,
  ]);

  // ── 분해 토큰 그리드 ──────────────────────────────────────────────────
  // 처리 칸은 ACTION 값으로 그린다 — 행 키로 갱신하는 그리드는 값이 바뀐 칸만 다시 그리므로, 보이는 내용(상태·용어·방향)이
  // 바뀌면 값도 바뀌게 한다. 동음이의(AMBIGUOUS) 행은 칸을 눌러 후보를 고르며 값은 고른 termId 다.
  const genDirection = gen?.direction;
  const tokenRows = useMemo(
    () =>
      genTokens.map((t) => ({
        seq: t.seq,
        surface: t.surface,
        status: t.status,
        MATCH_TEXT: t.termName
          ? `${t.termName}${t.senseNo && t.senseNo > 1 ? ` (${t.senseNo})` : ""}`
          : "—",
        ABBR_TEXT:
          t.status === "UNKNOWN" || t.status === "NO_ABBR" ? PLACEHOLDER : t.abbr,
        ACTION:
          t.status === "AMBIGUOUS"
            ? t.termId != null
              ? String(t.termId)
              : ""
            : `${t.status}|${t.termId ?? ""}|${t.termName ?? ""}|${genDirection ?? ""}`,
      })),
    [genTokens, genDirection],
  );
  const tokenColumns = useMemo<GridColumn[]>(
    () => [
      {
        key: "seq",
        header: "순서",
        ...TOKEN_COLUMN_SIZES.seq,
        align: "right",
        render: (v) => <span data-testid={`token-row-${v}`}>{String(v)}</span>,
      },
      { key: "surface", header: "토큰", ...TOKEN_COLUMN_SIZES.surface },
      { key: "MATCH_TEXT", header: "매칭", ...TOKEN_COLUMN_SIZES.MATCH_TEXT },
      { key: "ABBR_TEXT", header: "약어", ...TOKEN_COLUMN_SIZES.ABBR_TEXT },
      {
        key: "ACTION",
        header: "처리",
        ...TOKEN_COLUMN_SIZES.ACTION,
        tooltip: false,
        editable: (row) => row.status === "AMBIGUOUS",
        cellEditor: "select",
        cellEditorOptionsGetter: (row) =>
          (genTokens.find((t) => t.seq === row.seq)?.candidates ?? []).map((c) => ({
            value: String(c.termId),
            label: `${c.termName} (${c.senseNo}) ${c.engAbbr ?? ""}`,
          })),
        render: (_v, row) => {
          const t = genTokens.find((x) => x.seq === row.seq);
          return t ? renderAction(t) : null;
        },
      },
    ],
    // renderAction 은 gen 방향·후보 선택 처리기를 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [genTokens, genDirection, handlePickCandidate],
  );
  const handleTokenCellChange = useCallback(
    (p: { rowKey: string | number; newValue: unknown }) => {
      const t = genTokens.find((x) => String(x.seq) === String(p.rowKey));
      if (t && p.newValue != null && p.newValue !== "") handlePickCandidate(t, String(p.newValue));
    },
    [genTokens, handlePickCandidate],
  );

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
        <SearchField label="검색어">
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
        <SearchField label="도메인">
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
                <AgDataGrid
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
            <div style={panelScrollStyle}>
              <p style={panelTitleStyle}>컬럼명 자동 생성</p>
              <div style={rowStyle}>
                <Select
                  data-testid="gen-direction"
                  value={direction}
                  options={[
                    { value: "FORWARD", label: "한국어 → 물리명" },
                    { value: "REVERSE", label: "물리명 → 논리명" },
                  ]}
                  onChange={(v) => setDirection(v as Direction)}
                  style={{ width: 160 }}
                />
                <Input
                  data-testid="gen-input"
                  value={genInput}
                  placeholder={
                    direction === "FORWARD"
                      ? "예: 원재료 코일두께"
                      : "예: RMTL_COIL_THK"
                  }
                  onChange={setGenInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canCompare && genInput.trim())
                      handleDecompose();
                  }}
                  style={{ width: 240 }}
                />
                <Button
                  data-testid="gen-decompose"
                  variant="primary"
                  onClick={handleDecompose}
                  disabled={busy || !canCompare || !genInput.trim()}
                >
                  분해
                </Button>
              </div>

              {gen ? (
                <>
                  <div style={{ marginTop: "var(--spacing-sm)" }}>
                    <AgDataGrid
                      columnSizing="fit"
                      columns={tokenColumns}
                      data={tokenRows}
                      rowKey="seq"
                      height="auto"
                      singleClickEdit
                      stopEditingWhenCellsLoseFocus
                      onCellValueChanged={handleTokenCellChange}
                    />
                  </div>

                  <table
                    style={{
                      ...DETAIL_TABLE_STYLE,
                      marginTop: "var(--spacing-sm)",
                    }}
                  >
                    <tbody>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>
                          {gen.direction === "FORWARD"
                            ? "물리명 미리보기"
                            : "논리명"}
                        </th>
                        <td style={DETAIL_VALUE_CELL} data-testid="gen-preview">
                          {gen.direction === "FORWARD"
                            ? previewPhys
                            : gen.logicalName}
                        </td>
                      </tr>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>추천 도메인</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Select
                            data-testid="gen-domain"
                            value={genDomain}
                            options={[
                              {
                                value: "",
                                label:
                                  gen.domains.length === 0
                                    ? "추천 없음"
                                    : "선택 안 함",
                              },
                              ...gen.domains.map((d) => ({
                                value: String(d.domainId),
                                label: `${d.domainName} (${d.stdName})`,
                              })),
                            ]}
                            onChange={setGenDomain}
                          />
                        </td>
                      </tr>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>중복 검사</th>
                        <td
                          style={DETAIL_VALUE_CELL}
                          data-testid="gen-duplicates"
                        >
                          {gen.duplicates.length === 0 ? (
                            <span style={badgeStyle("success")}>신규</span>
                          ) : (
                            gen.duplicates.map((d, i) => (
                              <div
                                key={`${d.columnId}-${d.matchedBy}-${i}`}
                                style={rowStyle}
                              >
                                <span style={badgeStyle("warning")}>
                                  {d.matchedBy}
                                </span>
                                <span>
                                  {d.systemCode ? `${d.systemCode} · ` : ""}
                                  {d.columnName} ({d.physName}) —{" "}
                                  {d.domainName ?? "-"}
                                </span>
                                <Button
                                  size="mini"
                                  onClick={() => void openColumn(d.columnId)}
                                >
                                  열기
                                </Button>
                              </div>
                            ))
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ ...rowStyle, marginTop: "var(--spacing-sm)" }}>
                    <Button
                      data-testid="gen-apply"
                      onClick={handleApply}
                      disabled={busy}
                    >
                      상세에 적용
                    </Button>
                  </div>
                </>
              ) : (
                <p style={{ ...mutedText, marginTop: "var(--spacing-sm)" }}>
                  한국어 논리명을 넣고 [분해]를 누르면 용어로 나눠 표준 물리명을
                  만듭니다.
                </p>
              )}
            </div>
          </ContentPanel>

          <ColumnDetailForm ref={detailRef} systems={systems} confirm={askConfirm} />
        </ContentBody>
      </ContentBody>

      <TermRegPopModal
        open={popToken != null}
        token={popToken?.surface ?? ""}
        onSelect={handleTermPicked}
        onClose={() => setPopToken(null)}
      />

      {errorMessage && (
        <ErrorModal
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
        />
      )}
    </MdmPageLayout>
  );

  // 처리 칸은 render 전용이라 셀 툴팁을 끈다(tooltip:false). 최소 폭(220px)에서 긴 후보 이름·안내가 말줄임돼도 전체를 보도록
  // 글자·버튼마다 제목(title)을 붙인다(Local-Rules §30, 2026-10-03).
  function renderAction(t: NameToken) {
    const titled = (text: string) => <span title={text}>{text}</span>;
    switch (t.status) {
      case "MATCHED":
        return titled("등록됨");
      case "SYNONYM":
        return titled(`동의어 → ${t.termName ?? ""}`);
      case "AMBIGUOUS": {
        // 칸을 누르면 후보 편집기가 열린다(그리드 인라인 편집)
        const picked = t.candidates.find((c) => c.termId === t.termId);
        const text = picked ? `${picked.termName} (${picked.senseNo}) ${picked.engAbbr ?? ""}` : "후보를 고르세요";
        return (
          <span data-testid={`token-candidate-${t.seq}`} title={text}>
            {picked ? text : <span style={mutedText}>{text}</span>}
          </span>
        );
      }
      case "NO_ABBR":
        return titled("약어 없음 — 용어 관리에서 약어 등록");
      case "UNKNOWN":
        return gen?.direction === "FORWARD" ? (
          <Button
            size="mini"
            data-testid={`token-placeholder-${t.seq}`}
            title={`${PLACEHOLDER} 용어 등록`}
            onClick={() => setPopToken(t)}
          >
            {PLACEHOLDER} 용어 등록
          </Button>
        ) : (
          <span data-testid={`token-placeholder-${t.seq}`} title={STATUS_TEXT.UNKNOWN}>
            {STATUS_TEXT.UNKNOWN}
          </span>
        );
      default:
        return titled(STATUS_TEXT[t.status]);
    }
  }
}
