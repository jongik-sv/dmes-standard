---
name: oasis-contract-check
description: "OASIS/cactus 계약 위반을 정적 검사하고 런타임 증상으로 원인을 역추적합니다. MES 모듈(mcm/mls/mqc/mpp/mas)의 OASIS Service·BPMN을 작성·수정한 뒤, 또는 응답이 비어 화면 0건이거나 'ParameterName must not be null' / '[grid] is an unavailable attribute' 오류가 났을 때 사용합니다."
---

# OASIS 계약 검사 (dmes-standard)

OASIS/cactus 는 **위반해도 예외가 안 나고 성공처럼 보이는** 실패 모드를 갖는다.
응답이 `{"meta":{...}}` 만 오고 화면이 0 건인데 HTTP 는 200 이다. 이 스킬은 그런
계약 위반을 커밋 전에 잡는다.

정본: [02-structure-naming-constraints.md](../../../docs/guide/BackEnd/standard-v2/backend-standard/02-structure-naming-constraints.md) §6-B~6-E.
규칙 본문이 필요하면 그 문서를 읽는다. 이 스킬은 판정과 조치만 다룬다.

적용 범위는 **MES 업무 모듈**(mcm / mls / mqc / mpp / mas / mcm-core) 이다.
APS(`aps-core`, `mpn`)는 REST 컨트롤러 기반이라 이 계약이 적용되지 않는다 —
APS Service 의 `@Transactional` 은 정상이므로 위반으로 보고하지 않는다.

## 1. 검사 실행

```bash
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```

주요 옵션:

| 옵션 | 용도 |
|---|---|
| `--module mls` | 특정 모듈만 (반복 지정 가능) |
| `--all` | WARN/INFO 도 전문 출력 (기본은 ERROR 만 전문, 나머지는 집계) |
| `--json` | 기계 판독용 |
| `--severity WARN` | WARN 이상에서도 exit 1 |

exit code 는 0 = 통과, 1 = 위반, 2 = 대상 없음. ERROR 가 1 건이라도 있으면
커밋하지 않는다.

**검사 대상은 BPMN 의 `camunda:class` 로 역산한다.** 디렉터리 glob 이 아니다 —
`mqc/domain/*`, `mls/common/*` 처럼 `service/` 폴더 밖에 있는 진입점이 많아
경로 규칙으로는 새거나 헛짚는다.

## 2. 결과 해석

### ERROR — 반드시 고친다

| 규칙 | 증상 | 조치 |
|---|---|---|
| **6-B-1** | `IllegalArgumentException: ParameterName must not be null` | 진입점 Service 의 `@Transactional` 제거. 트랜잭션이 필요하면 BPMN process 의 `<camunda:property name="tx" value="txBiz"/>` 로 옮긴다. 조회 중 부분적으로 필요하면 `TransactionTemplate`(CGLIB 회피) — `SlitStockMgmtService` 가 이 패턴이다 |
| **6-C-1** | `PropertyException: [grid] is an unavailable attribute` + 롤백 | serviceTask 의 `grid` property 제거. method parameter 이름 ↔ `grids.{key}` 자동 binding 을 쓴다. `grid` 는 ScriptTask 전용이다 |
| **6-C-2** | **응답 200 인데 화면 0 건.** body 에 `data`/`grids` 없이 `meta` 만 | serviceTask 에 `output` 명시. List 반환 → `output="{listKey}"` → `grids.{key}.rows`. 단일값 → `output="{valueKey}"` → `data.{key}` |
| **6-E-2** | `IllegalArgumentException: Generic type. You must explicitly specify...` | `params` 에 배열을 넣지 않는다. `grids: { key: { rows: [...] } }` 로 옮긴다. `params` 는 flat key-value 전용 |
| **6-E-3** | binding 안 됨 → parameter 가 null | `grids` key 를 Java parameter 이름과 **글자 단위로** 맞춘다. `ds_grdUpload` → `dsGrdUpload` |

### INFO — 판단 후 결정한다

| 규칙 | 의미 |
|---|---|
| **6-C-3** | `conditionExpression` 사용. OASIS 는 `actionGateway` 의 input 을 sequenceFlow `name` 과 매칭하므로 불필요하다. 다만 **금지가 아니고 기존 38 파일이 이미 쓰고 있다.** 동작하므로 기존 파일을 일괄 정리할 이유는 없다. 신규 BPMN 은 `name` 만 쓴다 |
| **6-D-2** | Map 반환. cactus 가 Map 내부 List 를 자동 분리하지 않아 `data.{key}` 에 Map 통째로 담긴다. **FE 에 대응하는 `unwrapPayload` 가 있으면 정상**이다. 없으면 화면이 빈다 — 짝을 확인한다. 신규는 List/단일값 직접 반환 + serviceTask 분기를 권장 |

INFO 는 baseline 이 각각 38 건 / 49 건이라 기본 출력에서 집계로만 나온다.
전부 보려면 `--all`.

## 3. 런타임 증상에서 역추적

정적 검사가 통과했는데 화면이 안 나오면 BE 로그를 본다. 이건 스크립트가 볼 수 없다.

| 로그 | 판정 |
|---|---|
| `StrictMethodResolver: Try binding for method.` 뒤 클래스명에 `$$SpringCGLIB$$0` | 6-B-1 위반. `@Transactional` 이 어딘가 남았다 |
| `[grid] is an unavailable attribute. Element [{taskId}]` | 6-C-1 위반. 해당 taskId 확인 |
| `CoreProcessStarter: Process [{serviceId}] finish with exceptions.` | 직전 ERROR 라인을 본다 |
| 예외 없이 응답 `meta` 만 | 6-C-2(output 누락) 또는 6-D-2(Map 반환 + FE unwrap 없음) |

`@Transactional` 이 안 보이는데 CGLIB 이 뜨면 상위 클래스나 인터페이스, 또는
메타 어노테이션에 붙어 있는지 확인한다. 최종 확인은
`javap -v {ServiceName}.class | grep MethodParameters` — `Name = "..."` 가 보여야 정상이다.

## 4. 검사기 자체를 신뢰할 수 있는지 확인

"위반 0 건" 이 코드가 깨끗해서인지 검사기가 고장나서인지 구분되어야 한다.

```bash
python3 .claude/skills/oasis-contract-check/scripts/selftest.py
```

규칙마다 합성 위반을 심은 임시 픽스처로 탐지를 확인한다(RED-first). 실 저장소는
건드리지 않는다. **검사 규칙을 수정했으면 반드시 다시 돌린다.**

`GREEN` 케이스에는 Javadoc 함정이 들어 있다 — 이 저장소의 Service 들은
`@Transactional 미부착(cactus 경계)` 같은 주석으로 규칙 자체를 문서화해 둔 곳이
많아서, 주석을 안 거르는 소박한 grep 은 진입점 99 개 중 75 개를 오탐한다.
판정은 반드시 주석·문자열 리터럴을 제거한 뒤 한다.

## 5. 자동 실행 (Claude 한정)

`scripts/hook_post_edit.py` 가 Claude Code 의 PostToolUse(`Edit|Write`) 훅에 물려 있어
OASIS 관련 파일을 편집할 때마다 자동으로 검사한다.

**등록 위치는 `.claude/settings.json` (팀 공유, 저장소에 커밋됨)이다.** 클론하면 바로
동작하므로 팀원이 따로 설정할 것은 없다. 필요한 것은 `python3` 뿐이다.

개인적으로 끄려면 `.claude/settings.local.json`(개인 설정, gitignore 대상)에서 덮어쓴다.
같은 훅을 두 파일에 모두 두면 **중복 실행된다** — 한쪽에만 둘 것.

동작:

- 무관한 파일은 무음. ERROR 가 있을 때만 보고한다.
- **차단하지 않는다.** 편집 중간 상태에서 일시적으로 위반이 잡히는 것은 정상이라
  막으면 작업이 진행되지 않는다. 최종 게이트는 커밋 전 §1 수동 실행이다.
- 검사기 자체가 죽으면 그 사실을 보고한다. 무음이 "위반 없음" 으로 오독되면
  훅이 있으나 마나이기 때문이다.

⚠️ **Codex 에는 대응하는 차단형 훅이 없다** (codex-cli 0.144 기준 `notify` 뿐).
Codex 로 작업할 때는 이 훅이 돌지 않으므로, RULE.md "무조건 적용하는 스킬" 표에 따라
**커밋 전에 §1 명령을 직접 실행**해야 한다.

훅 대상 판정은 모듈로 좁히지 않고 항상 전체를 검사한다. Java 클래스와 짝 BPMN 이
다른 디렉터리에 있어서(`MasterCategoryMngService` 는 `mcm-core`, 그 BPMN 은 `mcm`)
모듈로 좁히면 BPMN 0 건이 되어 검사가 조용히 무력화된다. 실제로 이 결함이 한 번
발생했고 RED 테스트로 잡았다.

## 6. 위반이 남은 채로 진행하지 않는다

ERROR 가 잡히면 정합체크서 §K(코드 구현 정합)가 ✗ 가 되고 BE 가이드 §12-4 의
재개발 의무 사이클이 발동한다. "동작은 하니까" 로 넘기지 말고 고친 뒤 재검사한다.
