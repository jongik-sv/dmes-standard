/**
 * 시험 사이 토스트 정리. shared `message-provider` 의 토스트는 Mantine 전역 알림 저장소(`limit={3}`)에 쌓여, 앞 시험의
 * 성공 알림이 뒤 시험의 알림을 대기열로 밀어낸다. m-mdm 은 `@mantine/notifications` 에 직접 의존하지 않으므로 shared 의
 * 의존성 경로로 불러온다 — 심볼릭 링크가 같은 실제 경로로 풀려 shared 가 쓰는 것과 같은 모듈이다.
 */
import { act } from "react";
import { notifications } from "../../../shared/node_modules/@mantine/notifications";

export function clearToasts(): void {
  act(() => {
    notifications.clean();
  });
}
