// scripts/_html5_entities.json 을 python 의 html 모듈에서 다시 뽑는다(python3 필요).
// 사용: node .claude/skills/mantine-aggrid-ui/tests/make-html5-entities.mjs --write
// (--write 없이 실행하면 아무것도 하지 않는다: `node --test tests/` 가 폴더의 모든 .mjs 를 실행하는 node 버전에서 덮어쓰지 않도록)
// aggrid_docs.mjs 의 html.unescape 구현이 python 과 같은 표(HTML5 이름 참조 2231개, 숫자 참조 예외 표)를 쓰게 하는 데이터다.
// HTML5 표는 사양에 고정돼 있어 python 버전이 바뀌어도 같다. 다시 만든 뒤에는 diff 가 비어 있는지 본다.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython, runCommand } from '../../_shared/node/proc.mjs';
import { writeText } from '../../_shared/node/io.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'scripts', '_html5_entities.json');

const PY = `
import html, html.entities, json, sys
rows = []
for k in sorted(html.entities.html5):
    rows.append("    " + json.dumps(k) + ": " + json.dumps(html.entities.html5[k]))
ch = html._invalid_charrefs
cp = sorted(html._invalid_codepoints)
sys.stdout.write("{\\n")
sys.stdout.write('  "generatedWith": ' + json.dumps("Python " + sys.version.split()[0]) + ",\\n")
sys.stdout.write('  "html5": {\\n' + ",\\n".join(rows) + "\\n  },\\n")
sys.stdout.write('  "invalidCharrefs": {\\n' + ",\\n".join("    " + json.dumps(str(k)) + ": " + json.dumps(ch[k]) for k in sorted(ch)) + "\\n  },\\n")
sys.stdout.write('  "invalidCodepoints": ' + json.dumps(cp) + "\\n}\\n")
`;

if (!process.argv.includes('--write')) {
  console.log('_html5_entities.json 은 --write 를 줄 때만 다시 만든다');
} else {
  const py = findPython();
  if (!py) {
    console.error('python3 를 찾지 못했다');
    process.exitCode = 1;
  } else {
    const r = runCommand(py, ['-c', PY], { env: { PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' } });
    if (r.status !== 0) {
      console.error(r.stderr);
      process.exitCode = 1;
    } else {
      JSON.parse(r.stdout); // 형식 확인
      writeText(OUT, r.stdout);
      console.log(`생성: ${OUT} (${r.stdout.length} 자)`);
    }
  }
}
