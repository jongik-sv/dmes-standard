"use client";

/**
 * 항목 편집 화면의 [카테고리 편집] 탭 본문 — 마루 코드(codeItemEdit/cate/CategoryTab)와 같은 모양으로 맞춘다
 * (D-104 로 옛 dataCateEdit 화면 본문을 옮김, TSK-07-02 design.md §2).
 *
 * 위는 카테고리 목록, 아래는 고른 카테고리의 소속 리스트다. 둘은 `ContentBody` 로 세로 분할해 경계를 끌어 크기를
 * 조절한다. 목록에서 [카테고리 추가]는 팝업을 열고, TABLE 은 [편집]으로 transfer-list, REGEX 는 [편집]으로
 * 정규식 폼을 팝업으로 낸다. BASE(cate_id="BASE")는 예약 카테고리라 닫기·편집 대상이 아니다(R6).
 *
 * 마루 코드와 달리 마루 데이터는 쓰기(`add`·`close`·`reopen`·`saveRegex`·`applyMembers`)가 서버로 바로 간다 —
 * 되돌릴 diff 버퍼가 없으므로 목록 칸은 읽기 전용이다. 그래서 편집은 동작 칸의 [편집]이 열고, 저장은 팝업의
 * [추가]·[저장]·[적용]이 각각 한다(상단 [저장] 없음).
 *
 * 대상 칸 후보는 `buildDefTargetOptions(lvlCnt, attrLabels)` — 서버 `CategoryOwner.MASTER_DATA` 허용 집합(KEY·
 * LVLn·ATTRn)에 정의에 실제로 있는 칸만 준다. 목록의 모든 행이 그 라벨(키·1차·공장 등)로 읽힌다.
 */
import { useMemo, useState } from "react";

import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";
import { TransferList } from "@dk-oasis/shared/transfer-list";

import { buildDefTargetOptions } from "./defTargetOptions";
import { CategoryAddModal } from "./components/CategoryAddModal";
import { RegexEditPanel } from "./components/RegexEditPanel";
import { BASE_CATE_ID } from "./types";
import { CategoryHistoryPanel } from "../history/CategoryHistoryPanel";
import type { DataCategoriesState } from "./useDataCategories";

const hint = { color: "var(--color-text-muted)", margin: 0, padding: "var(--spacing-sm)" } as const;
const toolbar = {
  display: "flex", alignItems: "center", gap: "var(--spacing-sm)",
  padding: "var(--spacing-sm)", borderBottom: "1px solid var(--color-border)",
} as const;
const transferPanel = {
  display: "flex", flexDirection: "column", gap: "var(--spacing-xs)", padding: "var(--spacing-sm)",
} as const;
const transferFooter = { display: "flex", justifyContent: "flex-end" } as const;

export interface CategoryTabProps {
  cate: DataCategoriesState;
  /** 마루 데이터 머리를 읽었는지 — 아니면 "마루 데이터를 고르세요". */
  loaded: boolean;
  /** 마루 데이터가 편집 가능한지(header.editable — EXTERNAL·DEPRECATED 면 false). */
  editable: boolean;
  /** 카테고리 쓰기 권한 — 옛 화면 OBJECT(dataCateEdit)의 save 권한 그대로. */
  canSave: boolean;
  /** 이력 조회 실패 문구를 페이지의 ErrorModal 로 올린다. */
  onError: (message: string) => void;
  /** 페이지의 ErrorModal 이 떠 있는지 — 떠 있는 동안에는 추가 팝업의 닫기를 무시한다. */
  errorShown?: boolean;
}

export function CategoryTab({ cate, loaded, editable, canSave, onError, errorShown = false }: CategoryTabProps) {
  const { selectedRow, detail } = cate;
  const canEdit = editable && canSave;
  // 훅 객체 전체가 아니라 안정된 함수만 열 정의에 건다.
  const { close: closeCate, reopen: reopenCate } = cate;
  const [addOpen, setAddOpen] = useState(false);
  const [regexOpen, setRegexOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  // 다른 카테고리를 고른 뒤 새 상세(view)가 올 때까지는 이전 소속 목록을 잠가 둔다 — 그 사이 [적용]하면 이전 카테고리의
  // 소속으로 낸 diff 가 새 카테고리에 저장된다(Local-Rules §11, 비웠다 다시 그리지 않고 잠근다).
  const detailCurrent = !!detail && detail.cate?.cateId === selectedRow?.cateId;
  // 소속 편집 팝업의 이동·[적용] 조건 — 새 상세가 오기 전에는 이전 카테고리의 소속을 잠근다.
  const transferEditable = canEdit && !!selectedRow?.open && detailCurrent;

  const targetOptions = useMemo(() => buildDefTargetOptions(cate.lvlCnt, cate.attrLabels), [cate.lvlCnt, cate.attrLabels]);

  // `data-testid` 로 행을 집게 한다 — 목록·소속 전환·닫기 검증이 행을 "누르는" 계약을 쓴다(AgDataGrid 에 행 testid
  // prop 이 없어 ID 칸 내용에 단다).
  const rowTestId = (row: unknown) => `cate-row-${(row as { cateId: string }).cateId}`;

  const categoryColumns = useMemo<GridColumn[]>(() => [
    {
      key: "cateId", header: "ID", width: 120,
      render: (value, row) => <span data-testid={rowTestId(row)}>{String(value ?? "")}</span>,
    },
    { key: "cateName", header: "이름", width: 150 },
    { key: "defKind", header: "종류", width: 80, align: "center" },
    // REGEX 의 정규식. TABLE 은 정규식이 없어 비운다.
    {
      key: "defExpr", header: "정규식", width: 200,
      render: (value, row) => ((row as { defKind: string }).defKind === "REGEX" ? String(value ?? "") : ""),
    },
    {
      // 저장은 키(KEY·LVL1·ATTR01)지만 화면에는 그 칸의 이름(키·1차·공장)을 보여준다 — 항목 그리드의 열 머리와
      // 같은 말을 쓴다. 지금 정의에 없는 키면(라벨을 지운 ATTR 등) 키 그대로 보여 막히지 않게 한다.
      key: "defTarget", header: "대상 칸", width: 130,
      render: (value, row) => {
        if ((row as { defKind: string }).defKind !== "REGEX") return "";
        if (value === null || value === undefined || value === "") return "";
        return targetOptions.find((o) => o.value === String(value))?.label ?? String(value);
      },
    },
    // matchCount 는 서버 `dataCateEdit.search` 가 카테고리마다 계산해 준다(REGEX 정규식 매칭 수 · TABLE 저장된 소속 수).
    { key: "matchCount", header: "해당", meta: false, width: 70, align: "center", tooltip: false, render: (value) => `${value ?? 0}건` },
    {
      key: "__action", header: "동작", meta: false, width: 170, align: "center", hideable: false,
      render: (_v, row) => {
        const r = row as { cateId: string; defKind: string; open: boolean };
        if (!canEdit || r.cateId === BASE_CATE_ID) return null;
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            {r.open ? (
              <Button size="mini" data-testid={`cate-close-${r.cateId}`}
                onClick={() => void closeCate(r.cateId)}>닫기</Button>
            ) : (
              <Button size="mini" data-testid={`cate-reopen-${r.cateId}`}
                onClick={() => void reopenCate(r.cateId)}>다시 열기</Button>
            )}
            <Button size="mini" data-testid={`cate-edit-${r.cateId}`}
              onClick={() => (r.defKind === "REGEX" ? setRegexOpen(true) : setTransferOpen(true))}>
              편집
            </Button>
          </span>
        );
      },
    },
  ], [canEdit, closeCate, reopenCate, targetOptions]);

  const memberColumns = useMemo<GridColumn[]>(() => [
    { key: "code", header: "코드", meta: false, width: 120 },
    { key: "name", header: "이름", meta: false, width: 150 },
  ], []);

  // REGEX 는 소속을 저장하지 않고 정규식이 정한다 — compare(서버 Pattern) 가 건 코드가 곧 소속 목록이라
  // 별도 미리보기 패널이 필요 없다. TABLE 은 저장된 memberCodes 가 소속이고, 후보 전체는 detail.items 다.
  const memberRows = useMemo(() => {
    if (!selectedRow) return [];
    if (selectedRow.defKind === "REGEX") {
      // 이름은 compare 응답의 `items` 에서 온다 — `detail.items` 는 TABLE 에서만 채워져 REGEX 는 비어 있다.
      if (cate.preview?.items) return cate.preview.items;
      // 서버를 못 올린 옛 응답 — 이름 없이 코드만이라도 보여준다.
      const byCode = new Map((detail?.items ?? []).map((it) => [it.code, it.name]));
      return (cate.preview?.codes ?? []).map((code) => ({ code, name: byCode.get(code) ?? null }));
    }
    if (!detail) return [];
    return (detail.items ?? []).filter((it) => cate.memberCodes.has(it.code));
  }, [selectedRow, detail, cate.preview, cate.memberCodes]);

  // 정규식이 틀리면 목록이 비는데, 비었다는 사실만으로는 원인을 알 수 없다 — 사유를 함께 보여 준다.
  const regexInvalid = selectedRow?.defKind === "REGEX" && cate.preview?.invalid === true;

  if (!loaded) {
    return <p data-testid="cate-empty" style={hint}>마루 데이터를 고르세요</p>;
  }

  return (
    <div data-testid="cate-tab" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={toolbar}>
        <span style={hint} data-testid="cate-save-hint">
          카테고리 변경은 [추가]·[편집]·[닫기] 마다 바로 저장됩니다
        </span>
      </div>
      {!editable && (
        <p data-testid="cate-readonly" style={{ ...hint, paddingTop: 0 }}>
          조회 전용 마루 데이터라 카테고리를 편집할 수 없습니다.
        </p>
      )}
      {/* 세로 2분할 — 위: 카테고리 섹션, 아래: 소속.
          소속이 항상 그 자리에 있어야 카테고리를 골라도 아래 격자가 밀리지 않는다. */}
      <ContentBody direction="column" resizable storageKey="mdm.dmd.dataItemMng.cateSplit">
        {/* 카테고리 섹션 = 세로 스택(카테고리 그리드 위, 카테고리 이력 아래).
            이력 칸은 고른 카테고리가 없어도 **항상** 그린다 — 조건부로 없애면 안쪽 스택이 무너져 카테고리 그리드가
            통째로 자리를 차지하고, 그 아래 있는 소속까지 같이 밀린다. */}
        <ContentBody direction="column" resizable storageKey="mdm.dmd.dataItemMng.cateGridVsHistory">
          <ContentPanel>
            <GridPanel
              title="카테고리"
              count={cate.rows.length}
              headerExtra={canEdit ? (
                <Button data-testid="cate-add" size="sm" onClick={() => setAddOpen(true)}>카테고리 추가</Button>
              ) : undefined}
            >
              <AgDataGrid gridId="dataCategories"
                columns={categoryColumns}
                data={cate.rows as unknown as Record<string, unknown>[]}
                rowKey="cateId"
                highlightedRowKey={cate.selectedCateId ?? undefined}
                onRowClick={(row) => cate.select(String(row.cateId))}
                // 목록에 편집 칸이 없어 ↑/↓ 는 기본적으로 선택을 옮기지 않는다. 커서가 옮긴 행을 받아 카테고리 선택을
                // 따라가게 하면 아래 소속 목록이 같은 카테고리를 계속 보여준다.
                onFocusedRowChange={(row) => cate.select(String(row.cateId))}
                emptyMessage="카테고리가 없습니다"
                emptyTestId="cate-list-empty"
              />
            </GridPanel>
          </ContentPanel>
          <ContentPanel>
            <CategoryHistoryPanel
              maruDataId={cate.maruDataId}
              cateId={selectedRow?.cateId ?? null}
              refreshToken={cate.writeCount}
              onError={onError}
            />
          </ContentPanel>
        </ContentBody>
        {selectedRow && selectedRow.cateId === BASE_CATE_ID && (
          <p style={hint} data-testid="cate-base-readonly">
            BASE 는 예약 카테고리라 편집·닫기를 할 수 없습니다
          </p>
        )}
        <ContentPanel>
          <GridPanel
            title={`소속 — ${selectedRow?.cateId ?? ""}`}
            count={memberRows.length}
            /* REGEX 문법 오류는 소속 목록이 그냥 비어 있는 것으로 보인다 — 이유를 잃지 않게 제목 자리에 남긴다.
               (옛 미리보기 패널이 이 문구를 홀로 담당했다. 목록이 곧 결과이므로 그 패널은 두지 않는다.) */
            titleExtra={regexInvalid ? (
              <span data-testid="cate-regex-invalid" style={{ color: "var(--color-danger)" }}>
                정규식 문법이 올바르지 않습니다
              </span>
            ) : undefined}
          >
            <AgDataGrid gridId="categoryMembers"
              columns={memberColumns}
              data={memberRows as unknown as Record<string, unknown>[]}
              rowKey="code"
              emptyMessage={regexInvalid ? "정규식 문법이 올바르지 않습니다" : "소속된 항목이 없습니다"}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      {/*
        등록 거부는 팝업을 닫지 않고 페이지 ErrorModal 로 알린다(입력을 고쳐 다시 보낼 수 있게). shared `Modal` 은 열린 창마다
        window Escape 를 받아 Escape 한 번에 두 창이 함께 닫힌다(ruleMng 등록 팝업과 같은 실측) — 오류창이 떠 있는 동안에는
        이 팝업의 닫기를 무시한다.
      */}
      <CategoryAddModal
        open={addOpen}
        onClose={() => {
          if (!errorShown) setAddOpen(false);
        }}
        busy={cate.busy}
        onAdd={cate.add}
      />

      <Modal open={regexOpen} onClose={() => setRegexOpen(false)} title={`REGEX 카테고리 — ${selectedRow?.cateId ?? ""}`}>
        {selectedRow && selectedRow.defKind === "REGEX" && (
          <div style={{ padding: "var(--spacing-sm)" }}>
            <RegexEditPanel
              cate={selectedRow}
              lvlCnt={cate.lvlCnt}
              attrLabels={cate.attrLabels}
              canEdit={canEdit && selectedRow.open}
              onSave={(name, expr, target, desc) => void cate.saveRegex(name, expr, target, desc)}
              onPreview={(expr, target) => void cate.previewCandidate(expr, target)}
              onFlushPreview={cate.flushPreview}
            />
          </div>
        )}
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title={`소속 편집 — ${selectedRow?.cateId ?? ""}`}>
        {selectedRow && detail && (
          // 이동(`>`·`>>`·`<`·`<<`)은 훅의 memberCodes 를 바로 바꾸고(서버 호출 없음), 서버 저장은 아래 [적용] 만 한다.
          <div data-testid="transfer-list-panel" style={transferPanel}>
            <TransferList
              items={detail.items ?? []}
              value={cate.memberCodes}
              onChange={cate.setMemberCodes}
              editable={transferEditable}
              testId="transfer"
            />
            <div style={transferFooter}>
              <Button data-testid="transfer-apply" size="sm" disabled={!transferEditable}
                onClick={() => void cate.applyMembers()}>적용</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
