// statusline-dump 대조용: 작업 폴더·홈의 파일을 경로 순으로 찍는다(시각은 <ISO>, 임시 파일 이름의 pid 는 <PID> 로 지운다).
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g;
const PIDNAME = /\.json\.\d+$/;
const out = [];
const walk = (root, tag, top = root) => {
  let names;
  try { names = readdirSync(root).sort(); } catch { return; }
  for (const name of names) {
    const p = join(root, name), rel = tag + relative(top, p).split(sep).join('/');
    let st;
    try { st = lstatSync(p); } catch { continue; }
    if (st.isDirectory()) { out.push('--- ' + rel + '/'); walk(p, tag, top); }
    else out.push('--- ' + rel.replace(PIDNAME, '.json.<PID>') + '\n' + readFileSync(p, 'latin1').replace(ISO, '<ISO>'));
  }
};
walk(process.cwd(), 'W:');
walk(process.env.HOME ?? '', 'H:');
process.stdout.write(out.join('\n') + '\n');
