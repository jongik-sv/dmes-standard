/**
 * commUserRoleCopy 진입 조회 분기 — SearchArea autoSearch 가 조회 기본값을 넣은 다음 한 번 부른다.
 *
 * - source 사용자 칸에 값이 있으면(기본값이 들어왔거나 이어받은 값) 조회 단추와 같은 흐름(search)을 탄다.
 *   조회가 0건이면 사용자 List 가 비지 않게 전체 List 로 물러선다.
 * - 값이 없으면 지금처럼 전체 List 를 불러온다.
 */
export async function runEntrySearch(
  filterUserId: string,
  search: () => Promise<boolean>,
  loadUserList: () => Promise<void>,
): Promise<void> {
  if (!filterUserId.trim()) {
    await loadUserList();
    return;
  }
  const found = await search();
  if (!found) await loadUserList();
}
