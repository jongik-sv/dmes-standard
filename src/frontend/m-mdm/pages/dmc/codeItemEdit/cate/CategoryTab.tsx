"use client";

/**
 * 코드 편집 화면의 [카테고리] 탭 본문(TSK-06-04 design.md §1, D-101 로 codeCateEdit 화면 본문을 옮김).
 *
 * 상단은 카테고리 목록을 ag-grid 로 보여주고, REGEX 카테고리는 정규식 컬럼을 테이블 안에서 직접 편집한다.
 * 하단은 고른 카테고리의 소속 리스트를 ag-grid 로 보여준다.
 * TABLE 형태의 카테고리는 편집 버튼을 두고 클릭 시 transfer-list 팝업을 띄운다.
 * BASE(cate_id="BASE")는 편집·닫기 버튼이 없고 안내만 보인다(불변 규칙 2).
 * 상태는 page 의 useCategoryEdit 가 들고 여기는 props 만 받는다 — 탭을 바꿔도 편집이 남는다.
 * 저장 버튼은 따로 없고 상단 [저장] 이 코드 행 변경과 함께 보낸다.
 */
import { useMemo, useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import type { CategoryEditState } from "./useCategoryEdit";
import { CategoryAddModal } from "./components/CategoryAddModal";
import { TransferListPanel } from "./components/TransferListPanel";
import { buildDefTargetOptions, type AttrLabel } from "./defTargetOptions";
import { hint, issueText, toolbar } from "./components/styles";
import { BASE_CATE_ID } from "./types";

export interface CategoryTabProps {
  cate: CategoryEditState;
  /** 코드 편집 view 를 읽었는지 — 아니면 "마루 코드를 고르세요". */
  loaded: boolean;
  editable: boolean;
  /**
   * 카테고리 추가·닫기·취소·REGEX 편집·소속 이동 권한 — 모두 상단 [저장]과 함께 codeItemEdit `save` 로 저장되므로
   * 그 save 버튼 권한 하나로 받는다(codeCateEdit OBJECT 의 save 권한이 아니다, § 결함 3). 실제 편집 가능 여부는
   * `editable && canEdit` 로 함께 본다.
   */
  canEdit: boolean;
  rowVersion: number | null;
  /**
   * 마루 코드의 정의 칸 — `codeCateEdit view` 의 headerMap 은 attrLabels 를 주지 않으므로, 같은 view 를 함께 읽는
   * 코드 편집 화면(`CodeItemEditService.headerMap`)이 가진 값을 내려준다. 대상 칸 후보를 이걸로 만든다.
   */
  lvlCnt: number;
  attrLabels: AttrLabel[];
}

export function CategoryTab({ cate, loaded, editable, canEdit, rowVersion, lvlCnt, attrLabels }: CategoryTabProps) {
  const { selectedRow } = cate;
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const targetOptions = useMemo(() => buildDefTargetOptions(lvlCnt, attrLabels), [lvlCnt, attrLabels]);
  // 행별 저장 검사 이슈는 `useCategoryEdit` 가 cateId 별로 모아 둔다(소속 코드 이슈는 탭 위 목록으로 간다).
  const issuesOf = (cateId: string) => cate.issuesByCate[cateId] ?? [];

  const categoryColumns = useMemo<GridColumn[]>(() => [
    {
      key: "cateId", header: "ID", width: 120,
      editable: () => editable && canEdit,
      cellEditor: "text",
      // `data-testid` 로 행을 집게 한다 — 목록·소속 전환 검증이 행을 "누르는" 계약을 쓴다(AgDataGrid 에 행 testid
      // prop 이 없어 ID 칸 내용에 단다).
      render: (value, row) => <span data-testid={`cate-row-${(row as { cateId: string }).cateId}`}>{String(value ?? "")}</span>,
    },
    {
      key: "cateName", header: "이름", width: 150,
      editable: () => editable && canEdit,
      cellEditor: "text",
      // 이 버전에 없는 카테고리 같은 저장 검사 오류는 그 행에 붙여 보인다(상단 `cate-issues` 요약과 짝).
      // 편집 모드일 때는 편집기가 값을 대신 그리므로 건드리지 않는다.
      render: (value, row) => {
        const r = row as { cateId: string };
        const rowIssues = issuesOf(r.cateId);
        if (rowIssues.length === 0) return String(value ?? "");
        return (
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span>{String(value ?? "")}</span>
            <span
              data-testid={`cate-row-issue-${r.cateId}`}
              style={{ ...issueText, fontSize: "var(--font-size-xs)" }}
              title={rowIssues.map((i) => i.code).join(", ")}
            >
              {rowIssues.map((i) => i.message).join(" · ")}
            </span>
          </span>
        );
      },
    },
    {
      key: "defKind", header: "종류", width: 80, align: "center",
      editable: () => editable && canEdit,
      cellEditor: "select",
      cellEditorOptionsGetter: () => [
        { value: "TABLE", label: "TABLE" },
        { value: "REGEX", label: "REGEX" },
      ],
    },
    {
      key: "defExpr", header: "정규식", width: 200,
      editable: (row) => {
        const r = row as { defKind: string };
        return r.defKind === "REGEX" && editable && canEdit;
      },
      cellEditor: "text",
    },
    {
      key: "defTarget", header: "대상 칸", width: 130,
      editable: (row) => {
        const r = row as { defKind: string };
        return r.defKind === "REGEX" && editable && canEdit;
      },
      cellEditor: "select",
      cellEditorOptionsGetter: () => targetOptions,
      // 저장은 키(LVL1·ATTR01)지만 화면에는 그 칸의 이름(1차·공장)을 보여준다 — 코드 그리드의 열 머리와 같은 말을 쓴다.
      // 저장된 키가 지금 정의에 없으면(라벨을 지운 ATTR 등) 키 그대로 보여 막히지 않게 한다.
      render: (value) => {
        if (value === null || value === undefined || value === "") return "";
        return targetOptions.find((o) => o.value === String(value))?.label ?? String(value);
      },
    },
    {
      // matchCount 는 서버가 categories 에 넣어 준다(CodeCateEditService.categoryMap — REGEX 는 정규식 매칭 수,
      // TABLE 은 저장된 소속 수, 닫힌 카테고리는 0). 목록 한 번으로 전부 온다.
      key: "matchCount", header: "해당", width: 70, align: "center", tooltip: false,
      render: (value) => `${value ?? 0}건`,
    },
    {
      key: "__action", header: "동작", width: 150, align: "center",
      render: (_v, row) => {
        const r = row as { cateId: string; defKind: string; __local: string };
        if (r.cateId === BASE_CATE_ID) return null;
        if (!editable || !canEdit) return null;
        // 저장하지 않은 변경이 있는 행은 [닫기] 대신 [취소]를 먼저 보여준다 — 한 칸에서 뒤집히면 헷갈린다.
        const dirty = r.__local !== "none";
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            {dirty && (
              <Button size="mini" data-testid={`cate-undo-${r.cateId}`} onClick={() => cate.undo(r.cateId)}>
                취소
              </Button>
            )}
            {/* TABLE 은 [편집] 으로 transfer-list 를 연다. 방금 추가한 카테고리(`__local: "new"`) 도 연다 —
                소속을 넣지 않은 새 TABLE 은 첫 저장에서 빈 카테고리로 굳기 때문이다. */}
            {r.defKind === "TABLE" && (
              <Button size="mini" data-testid={`cate-edit-${r.cateId}`} onClick={() => setTransferOpen(true)}>
                편집
              </Button>
            )}
            {!dirty && (
              <Button size="mini" data-testid={`cate-close-${r.cateId}`} onClick={() => cate.remove(r.cateId)}>
                닫기
              </Button>
            )}
          </span>
        );
      },
    },
  ], [editable, canEdit, cate, targetOptions, selectedRow?.cateId]);

  const memberColumns = useMemo<GridColumn[]>(() => [
    { key: "code", header: "코드", width: 120 },
    { key: "name", header: "이름", width: 150 },
    { key: "mark", header: "상태", width: 100, align: "center" },
  ], []);

  // REGEX 카테고리는 정규식에 매칭되는 코드를 동적으로 표시
  const memberRows = useMemo(() => {
    if (!selectedRow) return [];
    if (selectedRow.defKind === "REGEX") {
      // REGEX: 미리보기 결과에서 매칭되는 코드를 표시
      const previewRows = cate.preview?.rows ?? [];
      return previewRows
        .filter((r) => r.hit)
        .map((r) => ({ code: r.code, name: r.name, mark: "" }));
    }
    // TABLE: 소속 목록에서 매칭되는 코드를 표시
    const members = cate.membersByCate.get(selectedRow.cateId) ?? new Set();
    return cate.candidates
      .filter((it) => members.has(it.code))
      .map((it) => ({ ...it, mark: it.mark ?? "" }));
  }, [selectedRow, cate.preview, cate.membersByCate, cate.candidates]);

  if (!loaded) {
    return <p data-testid="cate-empty" style={{ ...hint, padding: "var(--spacing-sm)" }}>마루 코드를 고르세요</p>;
  }
  if (cate.loadError) {
    return (
      <p data-testid="cate-load-error" style={{ ...issueText, padding: "var(--spacing-sm)" }}>
        {`카테고리를 읽지 못했습니다: ${cate.loadError}`}
      </p>
    );
  }

  return (
    <div data-testid="cate-tab" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={toolbar}>
        <span style={hint}>카테고리·소속 변경은 코드 변경과 함께 상단 [저장] 한 번으로 저장합니다</span>
        {rowVersion !== null && <span style={hint} data-testid="cate-row-version">{`row_version = ${rowVersion}`}</span>}
      </div>
      {cate.otherIssues.length > 0 && (
        <div data-testid="cate-issues" style={{ padding: "0 var(--spacing-sm) var(--spacing-xs)" }}>
          {cate.otherIssues.map((i) => (
            <p key={`${i.code}-${i.field}-${i.itemKey}`} style={{ ...issueText, margin: 0 }}>
              {`${i.itemKey ?? ""} ${i.code} — ${i.message}`.trim()}
            </p>
          ))}
        </div>
      )}
      <ContentBody direction="column" resizable storageKey="mdm.dmc.codeItemEdit.cateSplit">
        <ContentPanel>
          <GridPanel
            title="카테고리"
            count={cate.rows.length}
            headerExtra={editable && canEdit ? (
              <Button data-testid="cate-add" size="sm" onClick={() => setAddOpen(true)}>카테고리 추가</Button>
            ) : undefined}
          >
            {/* `cate-list` — 카테고리 그리드 그 자체. 옛 좌측 목록 패널이 그려내던 자리를 이어받는다
                (행 testid 인 `cate-row-{cateId}` 를 안쪽에서 낸다). */}
            <div data-testid="cate-list" style={{ flex: 1, minHeight: 0 }}>
            <AgDataGrid
              columns={categoryColumns}
              data={cate.rows as unknown as Record<string, unknown>[]}
              rowKey="cateId"
              highlightedRowKey={cate.selectedCateId ?? undefined}
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              onRowClick={(row) => cate.select(String(row.cateId))}
              // 편집 가능한 칸이 있으면 ag-grid 가 ↑/↓ 를 먼저 먹어 onRowClick 이 돌지 않는다. 그래서 커서가 옮긴
              // 행을 따로 받아 카테고리 선택을 따라간다 — 오른쪽 편집 영역이 같이 따라 움직여야 한다.
              onFocusedRowChange={(row) => cate.select(String(row.cateId))}
              onCellValueChanged={({ rowKey, field, newValue }) => {
                const row = cate.rows.find((r) => r.cateId === rowKey);
                if (!row) return;
                cate.edit(row.cateId, { [field]: newValue });
              }}
              emptyMessage="카테고리가 없습니다"
            />
            </div>
          </GridPanel>
        </ContentPanel>
        {selectedRow && selectedRow.cateId === BASE_CATE_ID && (
          <p style={{ ...hint, padding: "var(--spacing-sm)" }} data-testid="cate-base-readonly">
            BASE 는 예약 카테고리라 편집·닫기를 할 수 없습니다
          </p>
        )}
        <ContentPanel>
          <GridPanel title={`소속 — ${selectedRow?.cateId ?? ""}`} count={memberRows.length}>
            <AgDataGrid
              columns={memberColumns}
              data={memberRows as unknown as Record<string, unknown>[]}
              rowKey="code"
              emptyMessage="소속된 코드가 없습니다"
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
      <CategoryAddModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={cate.add} />

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title={`소속 편집 — ${selectedRow?.cateId ?? ""}`}>
        {selectedRow && (
          <TransferListPanel items={cate.candidates}
            memberCodes={cate.membersByCate.get(selectedRow.cateId) ?? new Set()}
            editable={editable && canEdit} onChange={cate.changeMembers} />
        )}
      </Modal>
    </div>
  );
}
