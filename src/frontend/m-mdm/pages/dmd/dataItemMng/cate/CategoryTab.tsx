"use client";

/**
 * 항목 편집 화면의 [카테고리] 탭 본문(D-104 — 옛 dataCateEdit 화면 본문을 옮김, TSK-07-02 design.md §2).
 *
 * 왼쪽은 고정 폭 카테고리 목록+등록 폼, 오른쪽은 고른 카테고리의 defKind 에 따라 REGEX 정의 편집 또는 TABLE 소속
 * transfer-list 다. 탭 안 분할은 고정 폭 div 로 둔다(resizable ContentBody 를 탭 안에 중첩하는 것은 shared 가 보장하지
 * 않는다). 미리보기·카테고리 이력은 화면 오른쪽 열에 page 가 놓는다. 상태는 page 의 useDataCategories 가 들고 여기는
 * props 만 받는다 — 탭을 오가도 옮겨 두고 적용하지 않은 소속이 남는다.
 */
import type { DataCategoriesState } from "./useDataCategories";
import { CategoryListPanel } from "./components/CategoryListPanel";
import { RegexEditPanel } from "./components/RegexEditPanel";
import { TransferListPanel } from "./components/TransferListPanel";

const hint = { color: "var(--color-text-muted)", margin: 0, padding: "var(--spacing-sm)" } as const;

export interface CategoryTabProps {
  cate: DataCategoriesState;
  /** 마루 데이터 머리를 읽었는지 — 아니면 "마루 데이터를 고르세요". */
  loaded: boolean;
  /** 마루 데이터가 편집 가능한지(header.editable — EXTERNAL·DEPRECATED 면 false). */
  editable: boolean;
  /** 카테고리 쓰기 권한 — 옛 화면 OBJECT(dataCateEdit)의 save 권한 그대로. */
  canSave: boolean;
}

export function CategoryTab({ cate, loaded, editable, canSave }: CategoryTabProps) {
  const { selectedRow, detail } = cate;
  const canEdit = editable && canSave;
  // 다른 카테고리를 고른 뒤 새 상세(view)가 올 때까지는 이전 소속 목록을 잠가 둔다 — 그 사이 [적용]하면 이전 카테고리의
  // 소속으로 낸 diff 가 새 카테고리에 저장된다(Local-Rules §11, 비웠다 다시 그리지 않고 잠근다).
  const detailCurrent = !!detail && detail.cate?.cateId === selectedRow?.cateId;

  if (!loaded) {
    return <p data-testid="cate-empty" style={hint}>마루 데이터를 고르세요</p>;
  }

  return (
    <div data-testid="cate-tab" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {!editable && (
        <p data-testid="cate-readonly" style={{ ...hint, paddingBottom: 0 }}>
          조회 전용 마루 데이터라 카테고리를 편집할 수 없습니다.
        </p>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 360, flexShrink: 0, borderRight: "1px solid var(--color-border)" }}>
          <CategoryListPanel
            rows={cate.rows}
            selectedCateId={cate.selectedCateId}
            onSelect={cate.select}
            canEdit={canEdit}
            onClose={(id) => void cate.close(id)}
            onReopen={(id) => void cate.reopen(id)}
            onAdd={(id, name, kind) => void cate.add(id, name, kind)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {selectedRow && selectedRow.defKind === "REGEX" && (
            <RegexEditPanel
              cate={selectedRow}
              lvlCnt={cate.lvlCnt}
              attrLabels={cate.attrLabels}
              canEdit={canEdit}
              onSave={(name, expr, target, desc) => void cate.saveRegex(name, expr, target, desc)}
              onPreview={(expr, target) => void cate.previewCandidate(expr, target)}
            />
          )}
          {selectedRow && selectedRow.defKind === "TABLE" && detail && (
            <TransferListPanel
              items={detail.items ?? []}
              memberCodes={cate.memberCodes}
              canEdit={canEdit && selectedRow.open && detailCurrent}
              onChange={cate.setMemberCodes}
              onApply={() => void cate.applyMembers()}
            />
          )}
          {!selectedRow && (
            <p data-testid="cate-edit-empty" style={hint}>
              왼쪽에서 카테고리를 고르세요
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
