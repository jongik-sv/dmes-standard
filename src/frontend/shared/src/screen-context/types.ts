/**
 * 화면 문맥(screen context): 업무 화면이 게시한 값(그리드 선택 행·폼 입력값 등)을 도크 위젯이 받는 통로의 계약.
 * 탭(pageId)마다 한 건씩 보관하고, 위젯에는 활성 탭의 문맥만 보인다. 보드(위젯 화면)에서는 늘 null 이다.
 */

/** 문맥 값 한 칸. 숫자·문자열·비어 있음(null)만 허용한다(위젯 입력 칸에 그대로 채울 수 있는 모양). */
export type ScreenContextValue = string | number | null;

/** 문맥을 만든 곳. 그리드 선택 행이면 "grid", 폼 입력값이면 "form", 화면이 직접 게시하면 그 화면이 정한 이름이다. */
export type ScreenContextSource = "grid" | "form" | (string & {});

export interface ScreenContext {
  source: ScreenContextSource;
  /** 문맥이 속한 포털 탭 id. 포털 밖이면 빈 문자열. */
  tabId: string;
  /** 문맥이 속한 화면(TabPage) id. 탭별 보관의 키다. */
  pageId: string;
  /** 필드 이름(colDef field·폼 name) → 값. 키는 게시한 화면의 원래 표기 그대로 두고, 비교할 때만 정규화한다. */
  values: Record<string, ScreenContextValue>;
  /** 게시한 시각(epoch ms). */
  at: number;
}
