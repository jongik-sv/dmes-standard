"use client";
// 한글 식별자·경로
import { searchUnits한글, searchTerm } from "./api";
const 열기 = columnApi한글;
const 한글columnApi2 = 1;
export default function 한글화면() {
  const [검색Form, set검색Form] = useState({ a: 1 });
  const r = searchUnits한글(filters);
  const t = searchTerm(filters);
  return <AgDataGrid rows={[]} columns={useMemo(() => [검색Form], [검색Form])} />;
}
