// shared/src 안: ag-grid 직접 import 가 허용된다. 고정 규칙(columnApi)은 걸리고 화면 점검(P-R12~)은 건너뛴다.
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
const x = columnApi.foo;
export function useThing() {
  const [form, setForm] = useState({ a: 1 });
  const columns = useMemo(() => [{ field: String(form.a) }], [form]);
  return <table><thead><tr /></thead></table>;
}
async function f() { await fetch("/api/auth/me"); }
