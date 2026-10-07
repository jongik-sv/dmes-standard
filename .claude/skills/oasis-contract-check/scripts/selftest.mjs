#!/usr/bin/env node
// check_oasis_contract.mjs 의 RED-first 자체 검증. (selftest.py 의 node 이식판)
//
// 검사기가 "위반 0 건" 을 보고할 때, 그게 코드가 깨끗해서인지 검사기가 고장나서인지
// 구분할 수 없으면 green 을 신뢰할 수 없다. 이 스크립트는 규칙마다 합성 위반을
// 심은 임시 픽스처를 만들어 실제로 탐지되는지 확인한다.
//
// 실 저장소는 건드리지 않는다. 전부 임시 디렉터리 안에서 끝난다.
//
// 사용: node selftest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readText, writeText } from '../../_shared/node/io.mjs';
import { runNode, makeTempDir } from '../../_shared/node/proc.mjs';
import { finish, OK, VIOLATION } from '../../_shared/node/args.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(HERE, 'check_oasis_contract.mjs');

export const CLEAN_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="sampleScreen">
    <bpmn:serviceTask id="searchTask" name="조회" camunda:class="sampleScreenService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="search" />
          <camunda:property name="output" value="objects" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow_search" name="search"
                       sourceRef="actionGateway" targetRef="searchTask" />
  </bpmn:process>
</bpmn:definitions>
`;

export const CLEAN_JAVA = `package com.dongkuk.dmes.mls.lsa.sampleScreen.service;

import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

/**
 * OASIS 서비스: @Transactional 미부착(cactus 경계).
 * 이 Javadoc 은 검사기가 주석을 걸러내는지 확인하는 함정이다.
 */
@Service("sampleScreenService")
public class SampleScreenService {
    public List<Map<String, Object>> search(Map<String, Object> params) {
        return List.of();
    }
}
`;

export const CLEAN_TS = `import { request } from "@dk-oasis/shared";

export async function saveMaster(rows: Row[]) {
  return request("sampleScreen", {
    params: { plantCd: "P1" },
    grids: { master: { rows } },
  });
}
`;

/** 깨끗한 합성 픽스처를 root 아래에 만들고 파일 경로를 돌려준다. */
export function buildFixture(root) {
  const bpmn = path.join(root, 'src/backend/mls/lib/src/main/resources/services/sampleScreen');
  const java = path.join(root, 'src/backend/mls/lib/src/main/java/kr/co/ksm/dmes/mls/lsa/sampleScreen/service');
  const fe = path.join(root, 'src/frontend/m-mls/page-components/lsa/sampleScreen');
  writeText(path.join(bpmn, 'sampleScreen.bpmn'), CLEAN_BPMN, { mkdirp: true });
  writeText(path.join(java, 'SampleScreenService.java'), CLEAN_JAVA, { mkdirp: true });
  writeText(path.join(fe, 'api.ts'), CLEAN_TS, { mkdirp: true });
  return {
    bpmn: path.join(bpmn, 'sampleScreen.bpmn'),
    java: path.join(java, 'SampleScreenService.java'),
    ts: path.join(fe, 'api.ts'),
  };
}

function run(root) {
  const r = runNode(CHECKER, ['--root', root, '--json']);
  return { result: JSON.parse(r.stdout), code: r.status };
}

// [이름, 대상키, 원문, 치환문, 기대 rule]
export const MUTATIONS = [
  [
    '6-B-1 진입점 @Transactional',
    'java',
    '    public List<Map<String, Object>> search(',
    '    @Transactional(readOnly = true)\n    public List<Map<String, Object>> search(',
    '6-B-1',
  ],
  [
    '6-C-1 serviceTask grid property',
    'bpmn',
    '<camunda:property name="method" value="search" />',
    '<camunda:property name="method" value="search" />\n' +
      '          <camunda:property name="grid" value="master" />',
    '6-C-1',
  ],
  [
    '6-C-2 output 누락',
    'bpmn',
    '\n          <camunda:property name="output" value="objects" />',
    '',
    '6-C-2',
  ],
  [
    '6-E-2 params 에 배열',
    'ts',
    'params: { plantCd: "P1" },',
    'params: { master: rows },',
    '6-E-2',
  ],
  [
    '6-E-3 grids snake_case 키',
    'ts',
    'grids: { master: { rows } },',
    'grids: { ds_grdUpload: { rows } },',
    '6-E-3',
  ],
];

// python str.replace(old, new, 1) 대응: 첫 번째 일치만 치환(치환문의 `$` 를 해석하지 않는다)
const replaceFirst = (text, oldS, newS) => {
  const i = text.indexOf(oldS);
  return text.slice(0, i) + newS + text.slice(i + oldS.length);
};

export function main() {
  const failures = [];
  const root = makeTempDir('oasis-selftest-');
  try {
    const files = buildFixture(root);

    // 1) 깨끗한 픽스처는 ERROR 0 이어야 한다 (오탐 확인)
    let { result } = run(root);
    if (result.counts.ERROR !== 0) {
      failures.push(`GREEN 실패: 깨끗한 픽스처에서 ERROR ${result.counts.ERROR} 건 -> ${JSON.stringify(result.findings)}`);
    } else {
      console.log('[OK] GREEN  깨끗한 픽스처 ERROR 0 (Javadoc 함정 통과)');
    }

    // 2) 규칙마다 합성 위반을 심어 탐지되는지 확인 (미탐 확인)
    for (const [label, key, oldS, newS, rule] of MUTATIONS) {
      const file = files[key];
      const backup = readText(file);
      if (!backup.includes(oldS)) {
        failures.push(`${label}: 픽스처에서 앵커를 찾지 못함 -> ${JSON.stringify(oldS)}`);
        continue;
      }
      writeText(file, replaceFirst(backup, oldS, newS));
      try {
        const r = run(root);
        const hit = r.result.findings.filter((f) => f.rule === rule);
        if (!hit.length) {
          failures.push(`RED 실패: ${label} 를 심었으나 ${rule} 미탐지. 검출된 것: ${JSON.stringify(r.result.findings.map((f) => f.rule))}`);
        } else if (r.code === 0) {
          failures.push(`RED 실패: ${label} 탐지했으나 exit code 0`);
        } else {
          console.log(`[OK] RED    ${label} -> ${rule} 탐지, exit ${r.code}`);
        }
      } finally {
        writeText(file, backup);
      }
    }

    // 3) 원복 후 다시 GREEN (검사기가 상태를 오염시키지 않는지)
    ({ result } = run(root));
    if (result.counts.ERROR !== 0) failures.push('원복 후 GREEN 실패');
    else console.log('[OK] GREEN  원복 후 ERROR 0');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log();
  if (failures.length) {
    console.log(`자체검증 실패 ${failures.length} 건:`);
    for (const f of failures) console.log(`  - ${f}`);
    return finish(VIOLATION);
  }
  console.log(`자체검증 통과: GREEN 2 + RED ${MUTATIONS.length}`);
  return finish(OK);
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
    main();
  } catch (e) {
    console.error(`자체검증 실행 오류: ${e && e.stack ? e.stack : e}`);
    process.exitCode = VIOLATION;
  }
}
