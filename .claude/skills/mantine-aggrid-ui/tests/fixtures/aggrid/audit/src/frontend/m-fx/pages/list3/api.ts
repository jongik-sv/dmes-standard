export function searchBoards(f) { return http.get("/boards", f); }
export function searchNotes(f) { return http.get("/notes", f); }
/** 이 함수는 본문을 뺀다 */
export function searchDrops(f) {
  return http.get("/drops", { ...f, excludeBody: true });
}
export const other = 1;
