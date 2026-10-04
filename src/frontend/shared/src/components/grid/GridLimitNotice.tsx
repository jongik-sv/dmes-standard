"use client";

/**
 * 첫 조회 상한 안내 — 서버가 목록을 상한(예: 1,000건)으로 잘라 보냈을 때 「전체 N건 중 M건을 표시합니다」와 [전체 보기] 단추를 보인다
 * (화면 성능 가이드 R1). `GridPanel` 의 `titleExtra` 자리(제목·건수 오른쪽)에 넣도록 한 줄로 그린다.
 * - 잘리지 않았으면(`shownCount >= totalCount`) 아무것도 그리지 않는다. 화면은 응답의 `truncated` 를 따로 볼 필요 없이 건수만 넘긴다.
 * - [전체 보기] 는 누르면 `onShowAll` 만 부른다. 상한 없는 재조회는 화면이 한다.
 * - 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import { Button } from "../form/Button";

export interface GridLimitNoticeProps {
  /** 지금 그리드에 실린 행 수(상한으로 잘린 목록의 길이). */
  shownCount: number;
  /** 조건에 맞는 전체 건수(서버 `totalCount`). 비우면 그리지 않는다. */
  totalCount?: number | null;
  /** [전체 보기] 를 눌렀을 때. */
  onShowAll: () => void;
  /** 조회 중이면 단추를 비활성으로 둔다. */
  disabled?: boolean;
  /** 안내 줄의 data-testid. 단추는 `<testId>-show-all`. 기본 `grid-limit-notice`. */
  testId?: string;
}

const STYLE_HREF = "cm-grid-limit-notice";

export const GRID_LIMIT_NOTICE_CSS = `
.cm-grid-limit-notice { display: inline-flex; align-items: center; gap: var(--spacing-xs); min-width: 0; font-size: var(--font-size-xs); color: var(--color-warning); }
.cm-grid-limit-notice__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 상한 안내 문구 — 화면 시험·문서가 같은 글을 쓰도록 내보낸다. */
export function gridLimitNoticeText(shownCount: number, totalCount: number): string {
  return `전체 ${fmt(totalCount)}건 중 ${fmt(shownCount)}건을 표시합니다. 조건을 좁히거나 [전체 보기]를 누르세요.`;
}

/** 스타일을 한 번만 넣는다(React 19 가 같은 href 의 style 을 하나로 합친다). */
function GridLimitNoticeStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {GRID_LIMIT_NOTICE_CSS}
    </style>
  );
}

export function GridLimitNotice({
  shownCount,
  totalCount,
  onShowAll,
  disabled,
  testId = "grid-limit-notice",
}: GridLimitNoticeProps) {
  if (totalCount == null || shownCount >= totalCount) return null;
  const text = gridLimitNoticeText(shownCount, totalCount);
  return (
    <>
      <GridLimitNoticeStyle />
      <span className="cm-grid-limit-notice" role="status" data-testid={testId}>
        <span className="cm-grid-limit-notice__text" title={text}>
          {text}
        </span>
        <Button size="mini" onClick={onShowAll} disabled={disabled} data-testid={`${testId}-show-all`}>
          전체 보기
        </Button>
      </span>
    </>
  );
}
