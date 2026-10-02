/**
 * 위젯 정의·기본 배치가 바뀌었음을 같은 포털 창의 홈 화면에 알리는 window 이벤트.
 * 홈 탭은 포털에서 계속 마운트돼 있어 정의를 처음 한 번만 받으면, 위젯관리에서 새로 만든 위젯이 [배치 편집] 서랍에 보이지 않는다.
 * 위젯관리 화면이 저장·삭제에 성공하면 알리고, 홈 화면이 듣고 widgetDef/list 를 다시 받는다.
 */
export const WIDGET_DEFS_CHANGED = "mcm:widget-defs-changed";

export function notifyWidgetDefsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WIDGET_DEFS_CHANGED));
}

/** 구독하고 해지 함수를 돌려준다. */
export function onWidgetDefsChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(WIDGET_DEFS_CHANGED, listener);
  return () => window.removeEventListener(WIDGET_DEFS_CHANGED, listener);
}
