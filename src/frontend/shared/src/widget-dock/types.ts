/**
 * 업무 화면 도구 창(위젯 도크) 계약 — 포털 머리 「도구」 로 floatable 위젯을 업무 화면 위에 떠 있는 창으로 띄운다.
 * 좌표·크기는 화면(뷰포트) 픽셀이다. 위젯 보드의 격자 칸과 다르다.
 */

/** 떠 있는 창 하나. id 는 위젯 본체의 instanceId 로 넘어간다(메모처럼 instanceId 로 서버에 저장하는 위젯이 있다). */
export interface DockWindow {
  /** `[A-Za-z0-9_-]{1,40}` — 메모 서버 키 규칙과 같다. */
  id: string;
  widgetId: string;
  /** 왼쪽 위 모서리(px). 접힌 아이콘도 같은 자리에 놓인다. */
  x: number;
  y: number;
  /** 펼친 창 크기(px). 접혀 있어도 펼칠 때 쓰려고 기억한다. */
  w: number;
  h: number;
  collapsed: boolean;
  /** 쌓임 순서 — 클수록 앞. */
  z: number;
}

/**
 * 사용자별 창 배치 저장소. 1차 구현은 브라우저 저장(createBrowserDockStore)이고, 서버 저장은 같은 계약으로 바꿔 끼운다.
 * load 는 저장값이 없거나 읽을 수 없으면 빈 배열을 돌려준다. save 실패는 화면을 막지 않는다(구현이 삼키거나 호출부가 무시).
 */
export interface WidgetDockStore {
  load(): Promise<DockWindow[]>;
  save(windows: DockWindow[]): Promise<void>;
}

/** 등록부 준비 상태 — WidgetWorkspace.registryStatus 와 같은 값. ready 일 때만 없는 위젯 창을 정리한다. */
export type DockRegistryStatus = "loading" | "ready" | "error";

/** 창이 놓일 영역 크기(px). */
export interface DockViewport {
  width: number;
  height: number;
}
