/** 편집 메뉴(3단계 계획 P4·스펙 B7, Task 8) — 편집 모드의 룰·분기·선·빈 곳 항목(룰 바꾸기·복사·붙여넣기·끼우기·분기 바꾸기·풀기·삭제 등). */
import type { MenuProvider } from "../context-menu";

export const editMenu: MenuProvider = () => []; // SEAM(T8): 스펙 B7 편집 항목(P4 id 표 — via:"plus" 면 선 끼우기 넷만)
