// audit 정규식·괄호 짝 로직용 변이 퍼저(시험 전용). 씨앗을 고정한 의사난수로 기존 화면 소스를 조금씩 망가뜨려
// python legacy 와 node 판의 audit 출력이 같은지 보는 입력 트리를 만든다. import 만 하며 실행해도 아무 일도 하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { walkSorted } from '../../_shared/node/paths.mjs';

/** mulberry32 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SNIPPETS = [
  "setInterval(() => load(), 1000);", "window.setInterval(tick, 5);", "setTimeout(poll, 100);", "function poll() { setTimeout(poll, 10); }",
  "const poll2 = async () => { await go(); setTimeout(poll2, 10); };", "fetch('/api/auth/me');", "fetch(`/api/auth/me`);",
  "import { X } from 'ag-grid-enterprise';", "import { Y } from \"@ag-grid-community/core\";", "import 'ag-grid-community/styles/ag-grid.css';",
  "import { AgGridReact } from 'ag-grid-react';", "const a = columnApi.getAll();", "const g = gridOptions.api;", "new Grid(el, o);",
  "<AgGridReact rowSelection=\"multiple\" />", "<AgGridReact rowSelection={'single'} />", "<table><thead><tr /></thead></table>",
  "const { onSnapshotChange } = useTabPage();", "const handleRowClick = (r) => { onSnapshotChange({ r }); };",
  "const selectRow = useCallback((r) => { onSnapshotChange(r); }, []);", "function chooseItem(r) { onSnapshotChange(r); }",
  "<Grid onRowClicked={(e) => { onSnapshotChange(e); }} />", "const r = await searchFoo(filters);", "const r2 = await searchBar({ limit: 5 });",
  "const r3 = await searchBaz(parentId);", "const r4 = searchQux(q, page);", "import { searchFoo, searchBar, searchBaz, searchQux } from './api';",
  "<AgDataGrid rows={rows} columns={cols} />", "{rows.length === 0 ? (<p>x</p>) : (<AgDataGrid rows={rows} />)}",
  "{rows.length > 0 && (<AgDataGrid rows={rows} />)}", "{rows.length === 0 && <p>none</p>}", "{rows.length > 0 ? (<AgDataGrid />) : (<p />)}",
  "const [form, setForm] = useState<Form>({});", "const [searchForm, setSearchForm] = useState({ q: '' });", "const [한글Form, set한글Form] = useState({});",
  "const columns = useMemo(() => [1], [form]);", "const rows2 = useMemo<GridColumn[]>(() => build(searchForm), [searchForm, a]);",
  "const columnDefs = useMemo(() => [], [form.id]);", "<Input onChange={(e) => setForm({ ...form, a: e.target.value })} />",
  "<TextInput value={form.a} onChange={(e) => setSearchForm(e)} />", "window.addEventListener('portal-tab-activated', reload);",
  "const tabId = useTabPage().tabId;", "document.visibilityState", "export default function Page() {", "export default Page;", "const Page = () => {", "};",
  "useSyncExternalStore(subscribe, getState)", "useSyncExternalStore(subscribe, () => state.field)", "let state: S = { a: 1 };", "function getState() { return state; }",
  "export function useThing() {", "async function searchXPicks(kw: string): Promise<IdPickRow[]> {", "makeUnitSearch((kw) => searchFoo(kw))",
  "if (!kw) { return; }", "if (kw === '') return;", "setRoleOptions(r);", "setRows(r);", "<GridPanel />", "<GridLimitNotice />",
  "// fetch('/api/auth/me')", "/* setInterval(x, 1) */", "const s = \"//\";", "const t = `${a}`;", "const u = '", "`", "${", "}", "{", ")", "(", "[", "]",
  "\"", "'", "/*", "*/", "//", "\\", "한글", "😀", "\t", "  ", "includeContent: false", "{ limit: 10 }", "onSnapshotChange",
];
const WORDS = ['search', 'Form', 'form', 'useMemo', 'useState', 'AgDataGrid', 'onSnapshotChange', 'setInterval', 'columnApi', 'limit', 'tabId', 'return', 'const', 'function', 'export', 'default', 'async', 'await', 'Promise'];
const CHARS = ["(", ")", "[", "]", "{", "}", "'", '"', "`", "/", "*", "\n", "\t", " ", ";", ",", "<", ">", "=", "!", "?", ":", ".", "$", "\\"];

/**
 * bases: [{rel, text}] 원본 소스 목록. 변이본을 root/<i>/<이름> 으로 쓴다.
 * 파일 이름은 page.tsx·위젯 이름·스토어 이름 등 규칙이 파일명에 기대는 것들을 섞는다.
 * 반환: 쓴 파일 수.
 */
export function buildFuzzTree(root, { seed, count, bases }) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const NAMES = ['page.tsx', 'page.tsx', 'View.tsx', 'WidgetCard.tsx', 'store.ts', 'index.tsx', 'x.test.tsx', 'renderer.ts', 'Panel.jsx'];
  for (let i = 0; i < count; i++) {
    let text = pick(bases).text;
    const nMut = 1 + Math.floor(rand() * 5);
    for (let k = 0; k < nMut; k++) {
      const lines = text.split('\n');
      const r = rand();
      if (r < 0.14 && lines.length > 2) lines.splice(Math.floor(rand() * lines.length), 1);
      else if (r < 0.26) { const j = Math.floor(rand() * lines.length); lines.splice(j, 0, lines[j]); }
      else if (r < 0.34 && lines.length > 2) { const j = Math.floor(rand() * (lines.length - 1)); [lines[j], lines[j + 1]] = [lines[j + 1], lines[j]]; }
      else if (r < 0.40) { text = text.slice(0, Math.floor(rand() * text.length)); continue; }
      else if (r < 0.70) lines.splice(Math.floor(rand() * (lines.length + 1)), 0, pick(SNIPPETS));
      else if (r < 0.82) {
        const j = Math.floor(rand() * lines.length);
        const w = pick(WORDS);
        lines[j] = lines[j].replace(/[A-Za-z_$][\w$]*/, w);
      } else if (r < 0.92) {
        const j = Math.floor(rand() * lines.length);
        const p = Math.floor(rand() * (lines[j].length + 1));
        lines[j] = lines[j].slice(0, p) + pick(CHARS) + lines[j].slice(p);
      } else {
        const j = Math.floor(rand() * lines.length);
        const p = Math.floor(rand() * (lines[j].length + 1));
        lines[j] = lines[j].slice(0, p) + pick(SNIPPETS) + ' ' + lines[j].slice(p);
      }
      text = lines.join('\n');
    }
    if (rand() < 0.1) text = text.replace(/\n/g, '\r\n');
    const dir = path.join(root, String(i));
    fs.mkdirSync(dir, { recursive: true });
    const name = pick(NAMES);
    fs.writeFileSync(path.join(dir, name), text);
    // 형제 types.ts·api.ts 로 P-R1b 경로도 두드린다
    if (rand() < 0.25) fs.writeFileSync(path.join(dir, 'types.ts'), pick(bases).text.includes('body') || rand() < 0.5 ? 'export interface R { id: string; body: string; CONTENT?: string; contentType: string }\n' : 'export interface R { id: string }\n');
    if (rand() < 0.2) fs.writeFileSync(path.join(dir, 'api.ts'), `export function searchFoo(f) { return get('/x', { ${rand() < 0.5 ? 'includeContent: false' : 'a: 1'} }); }\nexport function searchBar(f) { return 1; }\n`);
  }
  return count;
}

/** 폴더 안의 .ts/.tsx/.jsx 파일을 {rel, text} 로 읽는다(코드포인트 정렬). */
export function loadBases(dir, { limit = Infinity, maxBytes = 60000 } = {}) {
  const out = [];
  for (const f of walkSorted(dir, { skipDirs: ['node_modules', '.next', 'dist', 'build'], extensions: ['.ts', '.tsx', '.jsx'] })) {
    if (out.length >= limit) break;
    const st = fs.statSync(f);
    if (st.size > maxBytes) continue;
    out.push({ rel: path.relative(dir, f), text: fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n') });
  }
  return out;
}
