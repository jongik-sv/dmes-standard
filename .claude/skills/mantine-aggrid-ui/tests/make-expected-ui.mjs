// golden/expected/ui_docs.json 을 python 판(legacy)으로 다시 계산한다(python3 필요).
// 사용: node .claude/skills/mantine-aggrid-ui/tests/make-expected-ui.mjs --write
// (--write 없이 실행하면 아무것도 하지 않는다: `node --test tests/` 가 폴더의 모든 .mjs 를 실행해도 덮어쓰지 않도록)
// 합성 트리 케이스와 데이터(GROUPS·EXCLUDED·EXPORT_FILES)만 저장한다. 실제 문서를 쓰는 real-* 케이스는 문서가 바뀌므로 저장하지 않고 시험 때마다 python 과 직접 비교한다.

import fs from 'node:fs';
import path from 'node:path';
import { findPython, makeTempDir } from '../../_shared/node/proc.mjs';
import { runCommand } from './_run.mjs';
import { writeJson } from '../../_shared/node/io.mjs';
import { CASES, EXPECTED_FILE, pythonData, runCase } from './_ui_golden.mjs';

if (!process.argv.includes('--write')) {
  console.log('expected 는 --write 를 줄 때만 다시 만든다');
} else {
  const py = findPython();
  if (!py) {
    console.error('python3 를 찾지 못했다');
    process.exitCode = 1;
  } else {
    const base = fs.realpathSync(makeTempDir('ui-expected-'));
    try {
      const v = runCommand(py, ['--version']);
      const out = { generatedWith: (v.stdout + v.stderr).trim(), data: pythonData(base), cases: {} };
      for (const c of CASES) out.cases[c.id] = runCase(base, c, 'py');
      writeJson(EXPECTED_FILE, out, { mkdirp: true });
      console.log(`expected 생성: ${Object.keys(out.cases).length}건 (${out.generatedWith}) → ${path.relative(process.cwd(), EXPECTED_FILE)}`);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
}
