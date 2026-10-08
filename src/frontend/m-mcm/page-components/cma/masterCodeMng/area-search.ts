/**
 * 마스터 코드 관리 — 조회 영역(SearchArea) 조회의 진입 분기 판정.
 *
 * SearchArea 는 autoSearch 가 조회 기본값을 넣은 뒤 onSearch("auto") 로 부르고, 사용자가 친 Enter 는 인자 없이 부른다.
 * 진입 자동 조회(가드 없는 loadMaster)는 autoSearch 호출에서만 타야 한다. 기본값을 기다리는 동안 사용자가 Enter 를 치면
 * 그 호출이 진입 대기 표지를 먼저 가져가 권한 가드를 건너뛰고, 뒤늦게 오는 autoSearch 는 조회가 두 번 돈다.
 * 순수 함수로 두어 시험한다(page.tsx 는 렌더 시험이 없다).
 */

import type { SearchTrigger } from "@dk-oasis/shared/layout";

/**
 * 진입 자동 조회를 탈지 정한다.
 * - "entry": autoSearch 호출이고 진입 대기 중이다. 권한 가드 없이 loadMaster 를 부른다(대기 표지를 내린다).
 * - "user": 그 밖의 모든 호출. 사용자 조회 단추와 같게 handleSearch(권한 가드 포함)를 탄다.
 */
export function decideAreaSearch(trigger: SearchTrigger | undefined, entryPending: boolean): "entry" | "user" {
  return trigger === "auto" && entryPending ? "entry" : "user";
}
