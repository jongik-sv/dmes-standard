/** 메뉴 제공자 등록(3단계 계획 P4) — 이 순서대로 항목을 잇는다(편집 · 접기 · 디버그 · 보기). 같은 id 는 앞 것이 이긴다. */
import type { MenuProvider } from "../context-menu";
import { collapseMenu } from "./collapse-menu";
import { debugMenu } from "./debug-menu";
import { editMenu } from "./edit-menu";
import { viewMenu } from "./view-menu";

export const MENU_PROVIDERS: readonly MenuProvider[] = [editMenu, collapseMenu, debugMenu, viewMenu];
