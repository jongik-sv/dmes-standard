#!/usr/bin/env python3
"""check_oasis_contract.py 의 RED-first 자체 검증.

검사기가 "위반 0 건" 을 보고할 때, 그게 코드가 깨끗해서인지 검사기가 고장나서인지
구분할 수 없으면 green 을 신뢰할 수 없다. 이 스크립트는 규칙마다 합성 위반을
심은 임시 픽스처를 만들어 실제로 탐지되는지 확인한다.

실 저장소는 건드리지 않는다. 전부 임시 디렉터리 안에서 끝난다.

사용: python3 selftest.py
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECKER = HERE / "check_oasis_contract.py"

CLEAN_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
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
"""

CLEAN_JAVA = """package com.dongkuk.dmes.mls.lsa.sampleScreen.service;

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
"""

CLEAN_TS = """import { request } from "@dk-oasis/shared";

export async function saveMaster(rows: Row[]) {
  return request("sampleScreen", {
    params: { plantCd: "P1" },
    grids: { master: { rows } },
  });
}
"""


def build_fixture(root: Path):
    bpmn = root / "src/backend/mls/lib/src/main/resources/services/sampleScreen"
    java = root / "src/backend/mls/lib/src/main/java/kr/co/ksm/dmes/mls/lsa/sampleScreen/service"
    fe = root / "src/frontend/m-mls/page-components/lsa/sampleScreen"
    for d in (bpmn, java, fe):
        d.mkdir(parents=True, exist_ok=True)
    (bpmn / "sampleScreen.bpmn").write_text(CLEAN_BPMN, encoding="utf-8")
    (java / "SampleScreenService.java").write_text(CLEAN_JAVA, encoding="utf-8")
    (fe / "api.ts").write_text(CLEAN_TS, encoding="utf-8")
    return {
        "bpmn": bpmn / "sampleScreen.bpmn",
        "java": java / "SampleScreenService.java",
        "ts": fe / "api.ts",
    }


def run(root: Path):
    r = subprocess.run(
        [sys.executable, str(CHECKER), "--root", str(root), "--json"],
        capture_output=True,
        text=True,
    )
    return json.loads(r.stdout), r.returncode


# (이름, 대상키, 원문, 치환문, 기대 rule)
MUTATIONS = [
    (
        "6-B-1 진입점 @Transactional",
        "java",
        "    public List<Map<String, Object>> search(",
        "    @Transactional(readOnly = true)\n    public List<Map<String, Object>> search(",
        "6-B-1",
    ),
    (
        "6-C-1 serviceTask grid property",
        "bpmn",
        '<camunda:property name="method" value="search" />',
        '<camunda:property name="method" value="search" />\n'
        '          <camunda:property name="grid" value="master" />',
        "6-C-1",
    ),
    (
        "6-C-2 output 누락",
        "bpmn",
        '\n          <camunda:property name="output" value="objects" />',
        "",
        "6-C-2",
    ),
    (
        "6-E-2 params 에 배열",
        "ts",
        'params: { plantCd: "P1" },',
        "params: { master: rows },",
        "6-E-2",
    ),
    (
        "6-E-3 grids snake_case 키",
        "ts",
        "grids: { master: { rows } },",
        "grids: { ds_grdUpload: { rows } },",
        "6-E-3",
    ),
]


def main():
    failures = []
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        files = build_fixture(root)

        # 1) 깨끗한 픽스처는 ERROR 0 이어야 한다 (오탐 확인)
        result, code = run(root)
        if result["counts"]["ERROR"] != 0:
            failures.append(
                f"GREEN 실패: 깨끗한 픽스처에서 ERROR "
                f"{result['counts']['ERROR']} 건 -> {result['findings']}"
            )
        else:
            print("[OK] GREEN  깨끗한 픽스처 ERROR 0 (Javadoc 함정 통과)")

        # 2) 규칙마다 합성 위반을 심어 탐지되는지 확인 (미탐 확인)
        for label, key, old, new, rule in MUTATIONS:
            path = files[key]
            backup = path.read_text(encoding="utf-8")
            if old not in backup:
                failures.append(f"{label}: 픽스처에서 앵커를 찾지 못함 -> {old!r}")
                continue
            path.write_text(backup.replace(old, new, 1), encoding="utf-8")
            try:
                result, code = run(root)
                hit = [f for f in result["findings"] if f["rule"] == rule]
                if not hit:
                    failures.append(
                        f"RED 실패: {label} 를 심었으나 {rule} 미탐지. "
                        f"검출된 것: {[f['rule'] for f in result['findings']]}"
                    )
                elif code == 0:
                    failures.append(f"RED 실패: {label} 탐지했으나 exit code 0")
                else:
                    print(f"[OK] RED    {label} -> {rule} 탐지, exit {code}")
            finally:
                path.write_text(backup, encoding="utf-8")

        # 3) 원복 후 다시 GREEN (검사기가 상태를 오염시키지 않는지)
        result, code = run(root)
        if result["counts"]["ERROR"] != 0:
            failures.append("원복 후 GREEN 실패")
        else:
            print("[OK] GREEN  원복 후 ERROR 0")

    print()
    if failures:
        print(f"자체검증 실패 {len(failures)} 건:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"자체검증 통과: GREEN 2 + RED {len(MUTATIONS)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
