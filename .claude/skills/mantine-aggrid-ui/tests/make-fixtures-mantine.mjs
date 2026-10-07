// tests/fixtures/mantine-cache 를 다시 만든다(네트워크와 python3 필요, --write 를 줄 때만 동작).
// 사용: node .claude/skills/mantine-aggrid-ui/tests/make-fixtures-mantine.mjs --write
//
// 「기록된 입력」: python 판(legacy)으로 실제 mantine.dev·GitHub 에서 한 번 받아 둔 캐시 파일을 커밋해 두고,
// 시험은 이 사본을 임시 캐시 폴더로 복사해 쓴다(네트워크 접근 0). llms-full.txt 는 4.6MB 라 시험에 필요한 구간만 남긴 줄인 사본이다.
// 줄인 구간(원본 줄 번호는 받은 시점 기준): 머리말~1500, Collapse 절 8300~8500, hooks 앞부분, 6→7 이행 안내, `Collapse in -> expanded` 절.
// 받는 일은 python legacy 가 한다(캐시 폴더는 mktemp 임시 폴더). 사용자 ~/.cache 는 건드리지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython, makeTempDir, runCommand } from '../../_shared/node/proc.mjs';
import { splitlinesPy } from '../../_shared/node/pytext.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY = path.join(HERE, 'golden', 'legacy', 'mantine_docs.legacy.py');
const OUT = path.join(HERE, 'fixtures', 'mantine-cache');

export const PAGES = ['button', 'collapse', 'grid', 'text', 'hooks-use-disclosure', 'dates-date-picker', 'carousel'];
export const OFFICIAL = [['combobox', 'skill'], ['combobox', 'api'], ['combobox', 'patterns'], ['form', 'skill'], ['custom-components', 'skill']];

function main() {
  if (!process.argv.includes('--write')) {
    console.log('fixtures 는 --write 를 줄 때만 다시 만든다(네트워크 필요)');
    return;
  }
  const py = findPython();
  if (!py) throw new Error('python3 가 필요하다');
  const tmp = makeTempDir('mantine-fixture-');
  try {
    const env = { MANTINE_LLMS_CACHE: tmp, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' };
    const run = (args) => {
      const r = runCommand(py, [LEGACY, ...args], { env });
      if (r.status !== 0) throw new Error(`legacy ${args.join(' ')} 실패: ${r.stderr}`);
    };
    for (const p of PAGES) run(['get', p]);
    for (const [n, part] of OFFICIAL) run(['official', n, part]);
    run(['grep', 'zzzz-nothing-zzzz', '--limit', '1']); // llms-full.txt 받기
    fs.mkdirSync(OUT, { recursive: true });
    fs.copyFileSync(path.join(tmp, 'llms.txt'), path.join(OUT, 'llms.txt'));
    for (const sub of ['pages', 'official']) copyTree(path.join(tmp, sub), path.join(OUT, sub));
    const full = splitlinesPy(fs.readFileSync(path.join(tmp, 'llms-full.txt'), 'utf8'));
    const keep = [[1, 1500], [8300, 8500], [43812, 44300], [77866, 78100], [78990, 79050]];
    const parts = keep.map(([a, b]) => full.slice(a - 1, b).join('\n'));
    fs.writeFileSync(path.join(OUT, 'llms-full.txt'), `${parts.join('\n\n')}\n`, 'utf8');
    console.log(`fixtures 생성: ${OUT}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyTree(path.join(src, e.name), path.join(dst, e.name));
    else fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
}

main();
