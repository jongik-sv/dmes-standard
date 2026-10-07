// golden/expected.json 을 python 판으로 다시 계산한다(python3 필요).
// 사용: node .claude/skills/oasis-contract-check/tests/make-expected.mjs --write
// (--write 없이 실행하면 아무것도 하지 않는다: `node --test tests/` 가 폴더의 모든 .mjs 를 실행하는 node 버전에서 덮어쓰지 않도록)
// 케이스를 바꿨거나 python 판 동작을 의도적으로 바꾼 뒤에만 실행하고, 결과 diff 를 눈으로 확인한다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython, runCommand, makeTempDir } from '../../_shared/node/proc.mjs';
import { writeJson } from '../../_shared/node/io.mjs';
import { buildRoots, CHECK_CASES, HOOK_CASES, PY_CHECKER } from './cases.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const py = process.argv.includes('--write') ? findPython() : null;
if (!process.argv.includes('--write')) {
  console.log('expected.json 은 --write 를 줄 때만 다시 만든다');
} else if (!py) {
  console.error('python3 를 찾지 못했다');
  process.exitCode = 1;
} else {
  const tmp = makeTempDir('oasis-expected-');
  try {
    const { roots, hooks } = buildRoots(tmp);
    const env = { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
    const norm = (s) => s.replace(/\r\n?/g, '\n');
    const version = runCommand(py, ['--version']);
    const out = { generatedWith: (version.stdout + version.stderr).trim(), check: {}, hook: {} };
    for (const c of CHECK_CASES) {
      if (c.root === 'real') continue;
      const root = roots[c.root];
      const args = c.args.map((a) => a.replaceAll('{root}', root));
      const r = runCommand(py, [PY_CHECKER, ...args], { env });
      out.check[c.id] = { status: r.status, stdout: norm(r.stdout) };
    }
    for (const c of HOOK_CASES) {
      if (c.repo === 'real') continue;
      const r = runCommand(py, [hooks[c.repo].pyHook], { input: c.stdin, env });
      out.hook[c.id] = { status: r.status, stdout: norm(r.stdout) };
    }
    writeJson(path.join(HERE, 'golden', 'expected.json'), out, { mkdirp: true });
    console.log(`expected.json 생성: 검사기 ${Object.keys(out.check).length} + 훅 ${Object.keys(out.hook).length} (${out.generatedWith})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
