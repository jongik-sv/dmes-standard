/** 디버그 메뉴(3단계 계획 P4, Task 10) — 디버그 모드의 `bp-toggle` 중단점 켜기/끄기·`run-to` 여기까지 실행. */
import type { MenuProvider } from "../context-menu";

export const debugMenu: MenuProvider = () => []; // SEAM(T10): bp-toggle·run-to(RULE·IF·PARALLEL·MERGE, debug 모드)
