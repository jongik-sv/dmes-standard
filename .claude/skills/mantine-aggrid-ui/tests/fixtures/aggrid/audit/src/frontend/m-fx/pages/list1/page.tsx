"use client";
import { searchUnits, searchCodes, searchRoles, searchByParent, searchSomething, searchMore } from "./api";
import { searchOnlyType } from "./api";
import type { searchTypeOnly } from "./api";
export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const run = async () => {
    const a = await searchUnits(filters);                    // 경고: 상한 없음
    const b = await searchUnits(filters, { limit: 100 });    // limit
    const c = await searchUnits(filters, FIRST_SEARCH_SIZE); // size
    const d = await searchCodes({ maxRows: 10 });            // max
    const e = await searchCodes({ page: 1 });                // page
    const f = await searchCodes({ pageSize: 1 });            // 'pageSize': \bpage\b 아님, size 로 통과
    const g = await searchByParent(parentId);                // keyed(Id)
    const h = await searchByParent(filters.unitCode);        // filters. 로 시작이면 키 아님
    const i = await searchByParent(item.unitCode);           // keyed
    const j = await searchByParent(token);                   // ^token$
    const k = await searchByParent(params.userId);           // params. 라 키 아님
    const l = await searchNotImported(filters);              // import 안 함
    const m = await searchMore();                            // 경고(인자 없음)
    const n = await searchRoles(filters);                    // 경고
    const o = await searchMore(                              // 닫는 괄호 없음(end<0)
  };
  return <AgDataGrid rows={rows} />;
}
function searchHelper() {}
async function searchSomething(a) {}
const x = as searchMore(1);
