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

/** 위젯이 업무 화면에 값을 넣은 결과. 키는 요청한 values 의 원래 표기. */
export interface ScreenApplyResult {
  /** 화면에 넣은 키. */
  applied: string[];
  /** 넣지 못한 키(받는 칸이 없거나 편집할 수 없음). */
  skipped: string[];
}

export interface ScreenApplyOptions {
  /** 사용자에게 보일 이름(예: "조업 계산 결과"). 받는 화면이 참고만 한다. */
  label?: string;
}

/** 화면이 등록하는 받기 처리기. 키 비교는 `normalizeScreenKey` 를 쓴다. */
export type ScreenApplyHandler = (
  values: Record<string, ScreenContextValue>,
  opts?: ScreenApplyOptions
) => ScreenApplyResult | Promise<ScreenApplyResult>;

/** 위젯이 받는 역방향 통로(`WidgetProps.screenApply`). 보드(위젯 화면)에서는 null. */
export interface ScreenApply {
  /** 활성 탭에 받는 쪽이 있는가. false 면 위젯은 버튼을 숨기거나 막는다. */
  available: boolean;
  apply(values: Record<string, ScreenContextValue>, opts?: ScreenApplyOptions): Promise<ScreenApplyResult>;
}
