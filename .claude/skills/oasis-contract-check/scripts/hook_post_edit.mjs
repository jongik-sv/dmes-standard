#!/usr/bin/env node
// PostToolUse 훅 — OASIS 관련 파일을 편집한 직후 계약 검사를 돌린다. (hook_post_edit.py 의 node 이식판)
//
// Claude Code 의 PostToolUse(Edit|Write) 에 물린다. stdin 으로 훅 입력 JSON 을 받아
// 편집 대상이 OASIS 관련 파일일 때만 검사기를 실행한다. 무관한 파일이면 아무것도
// 출력하지 않고 즉시 끝난다(무음).
//
// ERROR 가 있으면 stdout 에 JSON 을 내어 모델 컨텍스트에 위반 내용을 주입한다.
// 차단(block)은 하지 않는다 — 편집 중간 상태에서 일시적으로 위반이 잡히는 것은
// 정상이고, 여기서 막으면 작업이 진행되지 않는다. 최종 게이트는 커밋 전 수동 실행이다.
// 종료 코드는 항상 0 이다.
//
// 검사기(check_oasis_contract.mjs)는 자식 프로세스가 아니라 같은 프로세스에서 호출한다.
//
// Codex 에는 이에 대응하는 차단형 훅이 없다. Codex 로 작업할 때는 RULE.md
// "무조건 적용하는 스킬" 표에 따라 커밋 전에 검사기를 직접 실행해야 한다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 검사기·공용 헬퍼는 정적 import 가 아니라 여기서 불러온다. 파일이 빠졌거나 문법 오류가 있어도
// "항상 exit 0" 계약이 깨지지 않게 하고, 검사 불가 사실은 알린다(python 판은 검사기가 별도 프로세스였다).
let pyJsonDumps, readStdinTextSync, finish, OK, runCheck;
let loadError = null;
try {
  ({ pyJsonDumps } = await import('../../_shared/node/pyjson.mjs'));
  ({ readStdinTextSync } = await import('../../_shared/node/io.mjs'));
  ({ finish, OK } = await import('../../_shared/node/args.mjs'));
  ({ runCheck } = await import('./check_oasis_contract.mjs'));
} catch (e) {
  loadError = e;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..'); // .claude/skills/oasis-contract-check/scripts -> repo root

const MES_MODULES = ['mcm', 'mls', 'mqc', 'mpp', 'mas', 'mcm-core'];
const FE_MODULES = ['mcm', 'mls', 'mqc', 'mpp', 'mas'];

/**
 * 편집 파일이 OASIS 계약 대상인지만 판정한다.
 *
 * 모듈로 좁혀 검사하지 않는다 — Java 클래스와 짝 BPMN 이 다른 디렉터리에
 * 있기 때문이다(예: MasterCategoryMngService 는 `mcm-core`, 그 BPMN 은 `mcm`).
 * `--module mcm-core` 로 좁히면 BPMN 0 건이 되어 검사가 조용히 무력화된다.
 * 전체 검사는 1.3 초 수준이라 그냥 전부 돈다.
 */
export function isRelevant(filePath) {
  const p = filePath.replace(/\\/g, '/');
  if (p.includes('/build/') || p.includes('/node_modules/') || p.includes('/.next/') || p.includes('/dist/')) return false;

  for (const m of MES_MODULES) {
    if (p.includes(`/src/backend/${m}/`) && (p.endsWith('.bpmn') || p.endsWith('.java'))) return true;
  }
  for (const m of FE_MODULES) {
    if (p.includes(`/src/frontend/m-${m}/`) && (p.endsWith('.ts') || p.endsWith('.tsx'))) return true;
  }
  return false;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const truthy = (v) => !(v === undefined || v === null || v === false || v === 0 || v === '' || (Array.isArray(v) && v.length === 0) || (isObject(v) && Object.keys(v).length === 0));

function emit(obj) {
  process.stdout.write(pyJsonDumps(obj, { ensureAscii: false }) + '\n');
}

export function main() {
  finish(OK); // 어떤 경우에도 0
  let payload;
  try {
    payload = JSON.parse(readStdinTextSync({ normalizeEol: false }));
  } catch {
    return OK;
  }
  if (!isObject(payload)) return OK;

  const toolInput = truthy(payload.tool_input) ? payload.tool_input : {};
  const toolResponse = truthy(payload.tool_response) ? payload.tool_response : {};
  const get = (o, k) => (isObject(o) ? o[k] : undefined);
  const raw = truthy(get(toolResponse, 'filePath')) ? get(toolResponse, 'filePath') : get(toolInput, 'file_path');
  if (!truthy(raw) || typeof raw !== 'string') return OK;
  const filePath = raw;

  if (!isRelevant(filePath)) return OK; // 무관한 파일 — 무음

  let result;
  try {
    result = runCheck({ root: REPO });
    // python 판은 BPMN 0건이면 검사기 stdout 이 비어 json.loads 가 JSONDecodeError 로 실패했다. 같은 알림을 낸다.
    if (result.noBpmn) throw Object.assign(new Error('no BPMN'), { name: 'JSONDecodeError' });
  } catch (e) {
    // 검사기가 죽어도 편집은 막지 않는다. 다만 조용히 넘기지는 않는다 —
    // 무음이 "위반 없음" 으로 오독되면 훅이 있으나 마나가 된다.
    emit({
      systemMessage:
        `OASIS 계약 검사기 실행 실패 (${e && e.name ? e.name : 'Error'}). ` +
        '검사가 수행되지 않았으므로 위반 여부는 확인되지 않았다.',
    });
    return OK;
  }

  const errors = result.findings.filter((f) => f.severity === 'ERROR');
  if (!errors.length) return OK;

  const lines = [`OASIS 계약 위반 ${errors.length} 건 (편집: ${path.posix.basename(filePath.replace(/\\/g, '/'))})`, ''];
  for (const f of errors.slice(0, 10)) {
    lines.push(`[${f.rule}] ${f.target}`);
    lines.push(`  ${f.detail}`);
  }
  if (errors.length > 10) lines.push(`... 외 ${errors.length - 10} 건`);
  lines.push('');
  lines.push(
    '정본: docs/guide/BackEnd/standard-v2/backend-standard/' +
      '02-structure-naming-constraints.md §6-B~6-E · ' +
      '조치는 oasis-contract-check 스킬 SKILL.md §2 참조.',
  );
  const detail = lines.join('\n');

  emit({
    systemMessage: `OASIS 계약 위반 ${errors.length} 건 — 커밋 전 수정 필요`,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: detail },
  });
  return OK;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    if (loadError) {
      process.stdout.write(JSON.stringify({
        systemMessage:
          `OASIS 계약 검사기 실행 실패 (${loadError.code || loadError.name || 'Error'}). ` +
          '검사가 수행되지 않았으므로 위반 여부는 확인되지 않았다.',
      }) + '\n');
    } else {
      main();
    }
  } catch {
    // 훅은 어떤 경우에도 편집을 막지 않는다(종료 코드 0)
  }
  process.exitCode = 0;
}
