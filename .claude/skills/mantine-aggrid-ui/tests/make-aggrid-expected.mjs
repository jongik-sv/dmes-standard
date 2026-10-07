// golden/expected/aggrid_docs.expected.json 을 python 판(legacy)으로 다시 계산한다(python3 필요).
// 사용: node .claude/skills/mantine-aggrid-ui/tests/make-aggrid-expected.mjs --write
// (--write 없이 실행하면 아무것도 하지 않는다: `node --test tests/` 가 폴더의 모든 .mjs 를 실행하는 node 버전에서 덮어쓰지 않도록)
// 케이스(_aggrid_harness.mjs 의 CASES)·픽스처를 바꿨거나 python 판 동작을 의도적으로 바꾼 뒤에만 실행하고 결과 diff 를 눈으로 확인한다.

import fs from 'node:fs';
import path from 'node:path';
import { writeJson } from '../../_shared/node/io.mjs';
import { runCommand } from '../../_shared/node/proc.mjs';
import {
  makeSandbox, buildTrees, buildVariant, VARIANT_EXCEPTIONS, startServer, pythonOrNull, snapshotAll, EXPECTED_FILE,
} from './_aggrid_harness.mjs';

if (!process.argv.includes('--write')) {
  console.log('aggrid_docs.expected.json 은 --write 를 줄 때만 다시 만든다');
} else {
  const py = pythonOrNull();
  if (!py) {
    console.error('python3 를 찾지 못했다');
    process.exitCode = 1;
  } else {
    const sb = makeSandbox('aggrid-expected-');
    const server = await startServer();
    try {
      const ctx = { ...sb, trees: buildTrees(sb.tmp), server, py, variants: { exc: buildVariant(sb.tmp, 'exc', VARIANT_EXCEPTIONS) } };
      const v = runCommand(py, ['--version']);
      const snap = await snapshotAll('py', ctx);
      writeJson(EXPECTED_FILE, { generatedWith: (v.stdout + v.stderr).trim(), ...snap }, { mkdirp: true });
      console.log(`${path.relative(process.cwd(), EXPECTED_FILE)}: 케이스 ${Object.keys(snap.cases).length} + 사용 오류 ${Object.keys(snap.usage).length}, ${(fs.statSync(EXPECTED_FILE).size / 1024).toFixed(0)}KB`);
    } finally {
      await server.stop();
      fs.rmSync(sb.tmp, { recursive: true, force: true });
    }
  }
}
