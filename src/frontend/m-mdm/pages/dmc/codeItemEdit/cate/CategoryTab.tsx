"use client";

/**
 * 코드 편집 화면의 [카테고리] 탭 본문(TSK-06-04 design.md §1, D-101 로 codeCateEdit 화면 본문을 옮김).
 *
 * 왼쪽은 카테고리 목록+추가 폼, 오른쪽은 고른 카테고리의 defKind 에 따라 REGEX(이름·대상 칸·정규식) 또는 TABLE
 * (transfer-list) 편집 영역이다. BASE(cate_id="BASE")는 편집·닫기 버튼이 없고 안내만 보인다(불변 규칙 2). 미리보기는
 * 화면 오른쪽 공용 자리에 page 가 놓는다. 상태는 page 의 useCategoryEdit 가 들고 여기는 props 만 받는다 — 탭을 바꿔도
 * 편집이 남는다. 저장 버튼은 따로 없고 상단 [저장] 이 코드 행 변경과 함께 보낸다.
 */
import type { CategoryEditState } from "./useCategoryEdit";
import { CategoryListPanel } from "./components/CategoryListPanel";
import { RegexEditPanel } from "./components/RegexEditPanel";
import { TransferListPanel } from "./components/TransferListPanel";
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
}

export function CategoryTab({ cate, loaded, editable, canEdit, rowVersion }: CategoryTabProps) {
  const { selectedRow } = cate;

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
      <div style={{ display: "flex", flex: 1, minHeight: 0, borderTop: "1px solid var(--color-border)" }}>
        <div style={{ width: "36%", minWidth: 220, borderRight: "1px solid var(--color-border)" }}>
          <CategoryListPanel rows={cate.rows} selectedCateId={cate.selectedCateId} onSelect={cate.select}
            editable={editable} canEdit={canEdit} onAdd={cate.add} onRemove={cate.remove} onUndo={cate.undo}
            issues={cate.issuesByCate} />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {selectedRow && selectedRow.cateId !== BASE_CATE_ID && (
            <div style={{ padding: "var(--spacing-sm)" }}>
              {selectedRow.defKind === "REGEX" ? (
                <RegexEditPanel
                  cateName={selectedRow.cateName ?? ""} defExpr={selectedRow.defExpr ?? ""}
                  defTarget={selectedRow.defTarget ?? "CODE"} editable={editable && canEdit}
                  onChangeName={(v) => cate.edit(selectedRow.cateId, { cateName: v })}
                  onChangeExpr={(v) => cate.edit(selectedRow.cateId, { defExpr: v })}
                  onChangeTarget={(v) => cate.edit(selectedRow.cateId, { defTarget: v })}
                />
              ) : (
                <TransferListPanel items={cate.candidates}
                  memberCodes={cate.membersByCate.get(selectedRow.cateId) ?? new Set()}
                  editable={editable && canEdit} onChange={cate.changeMembers} />
              )}
            </div>
          )}
          {selectedRow && selectedRow.cateId === BASE_CATE_ID && (
            <p style={{ ...hint, padding: "var(--spacing-sm)" }} data-testid="cate-base-readonly">
              BASE 는 예약 카테고리라 편집·닫기를 할 수 없습니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
