// P-R1b: types.ts 의 본문 열 + api.ts
import { searchBoards, searchNotes, searchDrops } from "./api";
export default function Page() {
  const a = searchBoards({ q: 1 });
  const b = searchNotes({ q: 1, includeContent: false });
  const c = searchDrops({ q: 2 });
  return <AgDataGrid rows={[]} />;
}
