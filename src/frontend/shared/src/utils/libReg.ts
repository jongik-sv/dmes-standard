/**
 * 컨트롤러 레지스트리 관리
 * 페이지별 컨트롤러를 등록하고 조회하는 기능을 제공합니다.
 * @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다.
 */

export interface ControllerRegistry<T = unknown> {
  map: Record<string, T>;
  register(pageId: string, controller: T): void;
  get(pageId: string): T | null;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const controllerRegistry: ControllerRegistry = {
  map: {},

  register(pageId: string, controller: unknown): void {
    this.map[pageId] = controller;
  },

  get(pageId: string): unknown | null {
    return this.map[pageId] || null;
  },
};
