// golden/expected/mantine_docs.json 을 python 판(legacy)으로 다시 계산한다(python3 필요).
// 사용: node .claude/skills/mantine-aggrid-ui/tests/make-expected-mantine.mjs --write
// (--write 없이 실행하면 아무것도 하지 않는다: `node --test tests/` 가 폴더의 모든 .mjs 를 실행해도 덮어쓰지 않도록)
// 케이스를 바꿨거나 python 판 동작을 의도적으로 바꾼 뒤에만 실행하고, 결과 diff 를 눈으로 확인한다.

import fs from 'node:fs';
import path from 'node:path';
import { findPython, makeTempDir, runCommand } from '../../_shared/node/proc.mjs';
import { writeJson } from '../../_shared/node/io.mjs';
import { buildWorld, CASES, EXPECTED_FILE, runPythonCase } from './_mantine_golden.mjs';

if (!process.argv.includes('--write')) {
  console.log('expected 는 --write 를 줄 때만 다시 만든다');
} else {
  const py = findPython();
  if (!py) {
    console.error('python3 를 찾지 못했다');
    process.exitCode = 1;
  } else {
    const base = fs.realpathSync(makeTempDir('mantine-expected-'));
    try {
      const world = buildWorld(base);
      const v = runCommand(py, ['--version']);
      const out = { generatedWith: (v.stdout + v.stderr).trim(), cases: {} };
      for (const c of CASES) out.cases[c.id] = runPythonCase(world, c);
      writeJson(EXPECTED_FILE, out, { mkdirp: true });
      console.log(`expected 생성: ${Object.keys(out.cases).length}건 (${out.generatedWith}) → ${path.relative(process.cwd(), EXPECTED_FILE)}`);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
}
