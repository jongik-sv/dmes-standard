// prompt-watch 대조 래퍼 준비: 작업 폴더의 `.cache.json`({핸들: {screen, ageMs, corrupt?}})대로 화면 캐시를 만든다
//   $DFLOW_CONSOLE_DIR/screen/<핸들>.{txt,json} (폴더 700·파일 600). json = {read_at_ms, lines, kind, full}.
//   corrupt: 'kind'(종류 불일치) | 'lines'(줄 수 불일치) | 'mode'(txt 권한 644) | 'nofull'(full 없음)
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'lib');
const { screenPromptKind } = await import(join(root, 'common.mjs'));
const { fullSha } = await import(join(root, 'console-input.mjs'));
if (existsSync('.cache.json')) {
  const spec = JSON.parse(readFileSync('.cache.json', 'utf8'));
  const base = process.env.DFLOW_CONSOLE_DIR;
  const dir = join(base, 'screen');
  mkdirSync(dir, { recursive: true });
  chmodSync(base, 0o700); chmodSync(dir, 0o700);
  for (const [h, s] of Object.entries(spec)) {
    const text = `${s.screen}\n`;
    const all = text.split('\n'); all.pop();
    const tail = all.slice(-40);
    const kind = screenPromptKind(Buffer.from(`${tail.join('\n')}\n`, 'latin1')) || null;
    const f = fullSha(Buffer.from(`${tail.join('\n')}\n`, 'latin1'), process.env);
    const doc = { read_at_ms: Date.now() - (s.ageMs ?? 1000), lines: all.length, kind };
    if (f.rc === 0 && s.corrupt !== 'nofull') doc.full = f.out.trim();
    if (s.corrupt === 'kind') doc.kind = kind === 'permission' ? 'choice' : 'permission';
    if (s.corrupt === 'lines') doc.lines += 1;
    writeFileSync(join(dir, `${h}.txt`), text);
    writeFileSync(join(dir, `${h}.json`), JSON.stringify(doc));
    chmodSync(join(dir, `${h}.txt`), s.corrupt === 'mode' ? 0o644 : 0o600);
    chmodSync(join(dir, `${h}.json`), 0o600);
  }
}
