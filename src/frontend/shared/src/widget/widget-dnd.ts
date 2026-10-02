/**
 * [위젯 추가] 서랍 → 격자 끌기 중인 위젯 ID. HTML5 dragover 에서는 dataTransfer 를 읽을 수 없어
 * 서랍이 dragstart 에 여기에 적고 보드가 dragover·drop 에서 읽는다.
 */
let dragging: string | null = null;

export function setDraggingWidget(id: string | null): void {
  dragging = id;
}

export function getDraggingWidget(): string | null {
  return dragging;
}
