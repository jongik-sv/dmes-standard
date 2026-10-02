"use client";

/**
 * 홈 배치 버튼 — 인사말 줄 오른쪽 [위젯 추가](편집 모드에서만) · [배치 편집]/[완료] · [배치 초기화].
 * 배치 상태·편집·저장은 shared 보드(useDashboardBoard)가 맡고, 여기서는 그 동작을 shared Button 으로 부른다.
 * 공지 카드 안 목록·본문 분할 크기(ContentBody 저장값)는 배치 초기화로 되돌리지 않는다.
 */
import { Button } from "@dk-oasis/shared/form";
import { DashboardWidgetPicker, type DashboardBoardApi } from "@dk-oasis/shared/dashboard";

export function LayoutControls({ board }: { board: DashboardBoardApi }) {
  return (
    <>
      {board.editing && (
        <DashboardWidgetPicker
          board={board}
          testId="home-widget-picker"
          renderTrigger={(t) => (
            <Button
              size="mini"
              onClick={t.onClick}
              aria-haspopup={t["aria-haspopup"]}
              aria-expanded={t["aria-expanded"]}
              aria-controls={t["aria-controls"]}
              data-testid="home-widget-add"
            >
              {t.count > 0 ? `위젯 추가 (${t.count})` : "위젯 추가"}
            </Button>
          )}
        />
      )}
      <Button
        size="mini"
        variant={board.editing ? "primary" : "default"}
        onClick={() => board.setEditing(!board.editing)}
        aria-pressed={board.editing}
        title={
          board.editing
            ? "배치 편집을 마칩니다"
            : "카드를 끌어 옮기고 크기를 바꾸고 숨기거나 다시 놓습니다"
        }
        data-testid="home-layout-edit"
      >
        {board.editing ? "완료" : "배치 편집"}
      </Button>
      <Button
        size="mini"
        onClick={board.reset}
        disabled={!board.customized}
        title="카드 배치·접힘·폭·높이·숨김을 기본 배치로 되돌립니다"
        data-testid="home-layout-reset"
      >
        배치 초기화
      </Button>
    </>
  );
}

/** 긴급 공지 띠의 [내용 보기] — 공지 위젯을 숨겼으면 다시 놓고, 행이 접혀 있으면 펼친 뒤 그 공지를 고른다. */
export function OpenNoticeButton({
  board,
  widgetId,
  onOpen,
}: {
  board: DashboardBoardApi;
  widgetId: string;
  onOpen: () => void;
}) {
  return (
    <Button
      size="mini"
      onClick={() => {
        board.reveal(widgetId);
        onOpen();
      }}
    >
      내용 보기
    </Button>
  );
}
