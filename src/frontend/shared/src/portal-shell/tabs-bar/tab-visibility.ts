export interface TabVisibilityMetrics {
  currentScrollLeft: number;
  viewportLeft: number;
  viewportRight: number;
  tabLeft: number;
  tabRight: number;
}

type ScheduleTimeout = (callback: () => void, delay: number) => number;
type CancelTimeout = (timeoutId: number) => void;

/** 연속 resize 이벤트가 끝난 뒤 레이아웃 측정을 한 번만 실행한다. */
export function createTrailingResizeScheduler(
  scheduleTimeout: ScheduleTimeout,
  cancelTimeout: CancelTimeout,
  callback: () => void,
  delay: number
) {
  let timeoutId: number | null = null;

  return {
    schedule() {
      if (timeoutId !== null) cancelTimeout(timeoutId);
      timeoutId = scheduleTimeout(() => {
        timeoutId = null;
        callback();
      }, delay);
    },
    cancel() {
      if (timeoutId !== null) cancelTimeout(timeoutId);
      timeoutId = null;
    },
  };
}

/** 탭의 양 끝이 스크롤 viewport 안에 들어오도록 필요한 scrollLeft를 계산한다. */
export function getTabVisibilityScrollLeft({
  currentScrollLeft,
  viewportLeft,
  viewportRight,
  tabLeft,
  tabRight,
}: TabVisibilityMetrics): number {
  if (tabLeft < viewportLeft) {
    return Math.max(0, currentScrollLeft - (viewportLeft - tabLeft));
  }

  if (tabRight > viewportRight) {
    return currentScrollLeft + (tabRight - viewportRight);
  }

  return currentScrollLeft;
}
