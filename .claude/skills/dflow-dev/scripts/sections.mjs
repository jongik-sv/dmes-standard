#!/usr/bin/env node
// sections.mjs — 마크다운 파일에서 제목으로 절만 출력한다. sections.sh 의 node 판.
// 사용: node sections.mjs <파일> <제목>...
//   <제목> 은 '#' 을 뺀 제목 문구의 앞부분이다(예: '기준선 캐시', '도커 사용 규칙'). 앞부분이 같은 제목이 여럿이면 모두 낸다.
//   절은 그 제목부터 같거나 높은 단계의 다음 제목 앞까지다 — `##` 절이면 딸린 `###` 까지 나온다.
//   <제목> 앞에 `=` 를 붙이면 딸린 절 없이 그 제목의 본문만 낸다(다음 제목 앞까지, 단계 무관).
//   코드 펜스(```) 안의 `#` 줄은 제목으로 보지 않는다.
// 출력: 찾은 절을 인자 순서대로. 못 찾은 제목마다 `SECTION_MISSING <제목>` 한 줄.
// exit: 0 모두 찾음 / 3 하나라도 못 찾음(찾은 절은 이미 냈다) / 2 사용법 오류·파일 없음.
import fs from 'node:fs';

const out = (s) => { for (;;) { try { fs.writeSync(1, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };
const err = (s) => { for (;;) { try { fs.writeSync(2, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };

function help() {
  out('사용: sections.mjs <파일> <제목>...\n');
}

function isFence(line) {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return line.startsWith('```', i);
}

function headingOf(line) {
  // awk `/^#+ /`: 맨 앞이 # 하나 이상 + 공백. lv = # 개수, title = 그 뒤.
  if (line.length === 0 || line[0] !== '#') return null;
  let lv = 0;
  while (lv < line.length && line[lv] === '#') lv++;
  if (lv >= line.length || line[lv] !== ' ') return null;
  return { lv, title: line.slice(lv + 1) };
}

function sectionOf(lines, t, own) {
  const buf = [];
  let on = false;
  let onlv = 0;
  let found = false;
  let fence = false;
  for (const line of lines) {
    if (isFence(line)) {
      fence = !fence;
      if (on) buf.push(line);
      continue;
    }
    if (!fence) {
      const h = headingOf(line);
      if (h !== null) {
        if (on && (own || h.lv <= onlv)) on = false;
        if (!on && h.title.startsWith(t)) { on = true; onlv = h.lv; found = true; }
      }
    }
    if (on) buf.push(line);
  }
  return found ? buf : null;
}

function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) { help(); return 0; }
  if (argv.length < 2) { err('사용법: sections.mjs <파일> <제목>...\n'); return 2; }
  const f = argv[0];
  let text;
  try {
    text = fs.readFileSync(f, 'utf8');
  } catch {
    out(`SECTION_FILE_MISSING ${f}\n`);
    return 2;
  }
  // awk 는 줄 단위로 읽는다. 마지막 줄바꿈 뒤 빈 조각은 버린다.
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // CR 은 awk 출력에 그대로 남으므로 유지한다(\r\n 파일의 \r). BOM 은 제목 비교에 방해되므로 맨 앞에서만 뗀다.
  if (lines.length > 0 && lines[0].charCodeAt(0) === 0xfeff) lines[0] = lines[0].slice(1);
  let rc = 0;
  for (const raw of argv.slice(1)) {
    let t = raw;
    let own = false;
    if (t.startsWith('=')) { own = true; t = t.slice(1); }
    if (t === '') { out('SECTION_MISSING (빈 제목)\n'); rc = 3; continue; }
    const buf = sectionOf(lines, t, own);
    if (buf === null) { out(`SECTION_MISSING ${t}\n`); rc = 3; }
    else {
      // $(...) 가 끝 개행을 모두 떼고 printf '%s\n' 이 하나를 붙인다 — 끝 빈 줄(LF)을 뗀다.
      while (buf.length > 0 && buf[buf.length - 1] === '') buf.pop();
      out(`${buf.join('\n')}\n`);
    }
  }
  return rc;
}

process.exitCode = main(process.argv.slice(2));
