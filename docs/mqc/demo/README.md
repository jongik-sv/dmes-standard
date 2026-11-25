# mqc 품질관리 시연 화면 — 작업 공통 지침

`mes-to-be` 프로토타입(`/Users/donseok/orca/mes-to-be`) 화면을 이 저장소의 `m-mqc` 화면으로 옮긴다. 목적은 현업 시연이다.

- 시연용이므로 화면별 설계 산출물 5종(분석리포트 등)은 만들지 않는다(사용자 결정 2026-11-25).
- 화면은 이 저장소의 화면 지침(Frontend 가이드, `mantine-aggrid-ui` 스킬, shared 컴포넌트)을 따른다.
- 기준데이터는 Maru(MDM)에 룰·코드로 넣고, 업무 기록(주문, 설계결과, 판정, 발행 이력 등)은 `mqc` 테이블에 둔다.
- 데이터는 시연에서 늘 같은 결과가 나오게 고정한다. 난수, 오늘 기준 상대 날짜를 쓰지 않는다.
- 고객사 실명은 쓰지 않는다. 고객은 `수요가 A`처럼 가명으로 둔다.

## 1. 조사 자료

| 자료 | 내용 |
|---|---|
| `/private/tmp/claude-501/-Users-donseok-orca-dmes-standard/09869f44-e718-4ac2-9fa9-2a7c8be85693/scratchpad/inventory-A.md` | 룰 화면 9개(폭수축량, 폭마진량, 압연두께Set, 공정라우팅, 원자재강종, 규격약호, 주문단중에러, 생산가부, 주문정합성) 상세 |
| `/private/tmp/claude-501/-Users-donseok-orca-dmes-standard/09869f44-e718-4ac2-9fa9-2a7c8be85693/scratchpad/inventory-B.md` | 포털 메뉴, 품질사양, 품질설계결과, 시뮬레이션, 마스터코드, 품질판정, 출력물 3종 상세와 공통 데이터 모델 |
| `/private/tmp/claude-501/-Users-donseok-orca-dmes-standard/09869f44-e718-4ac2-9fa9-2a7c8be85693/scratchpad/oldref/` | 이전에 만든 폭 수축량 화면 1개 구현(참고용, 저장소에서는 지웠다). MDM 룰 등록 스크립트, mqc 판정 서비스, m-mqc 화면 패턴이 있다 |

## 2. 메뉴와 화면 식별자 (등록 완료)

메뉴 시드는 `src/backend/mcm/.../init/seed/ModuleMenuSeeder.java#seedMqcMenus` 에 있다. 화면 파일은 `src/frontend/m-mqc/pages/{폴더}/{objectId}/page.tsx` 이고, 구현은 `src/frontend/m-mqc/src/{폴더}/{objectId}/` 에 둔다.

최상위 메뉴는 품질관리(`mqc`, 순번 7)와 출력물관리(`qpr`, 순번 8) 두 개다. 품질설계(`qcd`)와 품질판정(`qjd`)은 품질관리 아래에 있다.

| 폴더 | 화면 objectId | 이름 | 프로토타입 |
|---|---|---|---|
| qdm 모듈관리 | qualitySpec | 품질사양 관리 | quality-spec.html |
| qdm | rawMaterialGrade | 원자재강종관리 | raw-material-grade.html |
| qdm | specCode | 규격약호관리 | spec-code.html |
| qdm | rollingThicknessSet | 압연두께Set보정관리 | rolling-thickness-set.html |
| qdm | processRouting | 공정라우팅관리 | process-routing.html |
| qdm | lineWidthShrinkage | 폭수축량관리 | width-reduction.html |
| qdm | lineWidthMargin | 폭마진량관리 | width-margin.html |
| qdf 생산가부관리 | orderWeightError | 주문단중에러관리 | order-weight-error.html |
| qdf | orderConsistency | 주문정합성관리 | order-consistency.html |
| qdf | productionFeasibility | 생산가부관리 | production-feasibility.html |
| qdr 설계결과관리 | qualityDesignResult | 품질설계결과 | quality-design.html |
| qcd 품질설계 | designSimulation | 시뮬레이션 | simulation.html |
| qdb 기준정보관리 | masterCode | 마스터코드 | master-code.html |
| qdb | colorSubmaterial | 칼라부재료관리 | (자리표시) |
| qdb | colorBom | 칼라BOM관리 | (자리표시) |
| qjd 품질판정 | qualityJudgment | 품질판정 | quality-judgment.html |
| qpr 출력물관리 | qualityCertificate | 품질보증서관리 | `~/Downloads/보증서 편집 시뮬레이터.html`(2026-11-25 교체, 계약 [wty-contract.md](wty-contract.md)) |
| qpr | inspectionCertificate | 검사증명서관리 | `~/Downloads/mockup` 검사증명서 발행 시뮬레이터(2026-11-25 교체, 계약 [mtc-contract.md](mtc-contract.md)) |
| qpr | tagManagement | Tag관리 | `~/Downloads/TAG_발행_시뮬레이터.html`(2026-11-25 교체, 계약 [tag-contract.md](tag-contract.md)) |

OASIS 권한키는 `mqc/{serviceId}/{action}` 이다. 화면 전용 서비스는 serviceId 를 화면 objectId 와 같게 둔다. 여러 화면이 함께 쓰는 서비스는 `qcdRule`(Maru 룰·코드, 구현 완료), `qcdOrder`(주문), `qcdMaster`(기준정보) 세 개이며 권한이 등록돼 있다. 쓸 수 있는 action 이름은 `CoreRbacSeeder` 의 `allActions` 에 있는 것만이다(search, save, delete, confirm, cancel, history, view, execute, calculate, apply, run, judge, codes, send, issue, reissue 등). 새 action 이름이 필요하면 조정자에게 알린다.

## 3. 공용 서비스 `qcdRule` (구현 완료)

`src/backend/mqc/lib/.../qcd/rule/service/QcdRuleService.java`, BPMN `services/qcd/qcdRule.bpmn`.

| action | params | 응답 `result` |
|---|---|---|
| search | `ruleIds`(쉼표), `evalTs`? | `rules[]`: ruleId, ver, applyFrom, hitPolicy, vars[varId,kind,name,dataType,dispType,seq], rows[rowId,seq,rowKind,cells{varId:{op,left,right,list,expr,val,summary}},summary,results{변수명:값}] |
| judge | `ruleId`, `inputJson`(변수명→값 JSON 문자열), `evalTs`? | ruleId, ver, evalTs, status(MATCHED/NO_MATCH/INPUT_ERROR/RULE_NOT_FOUND/UNAVAILABLE), hits[rowId,seq], results{변수명:값}, defaultApplied, trace[rowId,seq,evaluated,hit,firstFalseVar], message |
| history | `ruleId` | ruleId, versions[ver, applyFrom, applyTo, vars, rows] |
| codes | `codeIds`(쉼표) | codes[codeId, ver, items[code,name,alterName,seq,lvl[5],attrs[10]]] |

다른 mqc 서비스가 룰로 값을 계산할 때는 `QcdRuleService` 를 주입해 `judge` 를 부르거나 `QcdRuleGateway.engine()` 을 쓴다.

## 4. Maru 데이터 계약 — `src/frontend/m-mqc/src/common/catalog.ts`

Maru 에 넣는 룰·코드의 이름, 열 라벨, 단위, 화면별 룰 목록은 이 파일 하나가 정본이다. MDM 정의에는 변수 라벨이 실리지 않으므로 화면은 라벨을 여기서 읽는다. 데이터 담당이 쓰고 화면 담당이 읽는다.

```ts
export interface VarMeta { name: string; label: string; unit?: string; desc?: string }
export interface RuleMeta {
  ruleId: string;          // Maru 룰 ID
  title: string;           // 화면 표시 이름
  legacyIds?: string[];    // 레거시 업무기준 ID(C10B…)
  group?: string;          // 화면 안 묶음 키(공정 등)
  groupLabel?: string;
  hitPolicy: "FIRST" | "COLLECT";
  conds: VarMeta[];        // 조건 변수(순서 = 열 순서)
  results: VarMeta[];      // 결과 변수
  note?: string;
}
export interface CodeMeta { codeId: string; title: string; attrNames?: string[]; lvlNames?: string[]; desc?: string }
export const RULES: Record<string, RuleMeta>;
export const CODES: Record<string, CodeMeta>;
export const SCREEN_RULES: Record<string, string[]>;   // 화면 objectId → 룰 ID 목록(표시 순서)
export const SCREEN_CODES: Record<string, string[]>;   // 화면 objectId → 코드 ID 목록
```

ID 규칙: 룰 ID 는 레거시 ID 가 있으면 그것(`C10B1074` 등), 없으면 `QD_` 접두 영문 대문자. 코드 ID 는 `QC_` 접두 영문 대문자. 변수명은 영문 대문자와 `_`.

## 5. mqc 테이블 (Flyway, 스키마 MQCAPUSER)

위치는 기존 V1 과 같은 `src/backend/mqc/api/src/main/resources/db/migration/mqc/` 이다. Oracle 문법으로 쓴다(`flyway-migration-add` 스킬 참고). 번호는 미리 나눴다. 한 사람이 한 파일만 쓰고, 표 이름은 `TB_MQC_` 접두다. 시연 데이터 INSERT 도 같은 파일에 둔다.

| 번호 | 담당 | 범위 |
|---|---|---|
| V2 | 품질사양 | 품질사양, 사양 조건, 기본설계값, 변경 이력, 전송 이력 |
| V3 | 품질판정·출력물 | 코일, 검사 항목, 판정, 품질보증서, 검사증명서, Tag |
| V4 | 설계결과·시뮬레이션 | 주문, 설계 요청, 설계결과, 시뮬레이션 케이스 |

키는 문자열로만 잇고 다른 담당의 표에 FK 를 걸지 않는다. 주문 키(`D260831014-010` 등)와 코일 번호(`C260901001`~)는 inventory-B §11.1 의 값을 그대로 쓴다.

## 6. 하지 말 것

- 서버를 다시 띄우거나 내리지 않는다(`be-run.sh`, `fe-run.sh`, `local-run.sh`). DB(Oracle)에 직접 쓰지 않는다. 통합·기동·DB 적용은 조정자가 한다. 예외: 데이터 담당은 떠 있는 MDM(8096)에 OASIS 로 쓴다.
- git commit·push·브랜치 변경을 하지 않는다. 조정자가 한다.
- 자기 범위 밖 파일을 고치지 않는다. 공용 파일(`ModuleMenuSeeder`, `CoreRbacSeeder`, `m-mcm` 포털, `shared` 패키지, `m-mqc/tsup.config.ts`)을 고쳐야 하면 고치지 말고 보고에 적는다. 예외는 각 지시에 적었다.
- 업무에 묶이지 않는 새 UI 부품이 필요하면 `m-mqc/src/common/` 에 두고 보고에 "shared 등록 후보"로 적는다.

## 7. 검증 명령

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd src/backend/mqc && ../gradlew :lib:compileJava :api:compileJava :lib:test        # 백엔드
node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .  # ERROR 0
cd src/frontend/m-mqc && pnpm lint && pnpm vitest run && pnpm build                 # 프런트
node .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit <바꾼 폴더>      # 0건
node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit <바꾼 폴더>       # 0건
```

BPMN 은 `node scripts/mqc-demo/gen-bpmn.mjs <spec.json> <out.bpmn>` 로 만든다(예: `scripts/mqc-demo/bpmn/qcdRule.json`).

로컬 서버: mcm 8100, mdm 8096, mqc 8093, Oracle PDB `L_MAIN`. 포털 로그인은 `admin` / `admin123`.
