# mqc 시연 Maru 기준데이터 등록

품질설계 시연 화면이 쓰는 룰·코드를 프로토타입(`/Users/donseok/orca/mes-to-be`) 시드에서 뽑아 Maru(MDM, 8096)에 RELEASED 로 넣는다.
화면은 `src/frontend/m-mqc/src/common/catalog.ts` 에서 라벨을 읽는다. 이 파일도 여기서 만든다.

| 파일 | 하는 일 |
|---|---|
| `extract.mjs` | 프로토타입 시드 → `bundles/<화면>.json`(룰)·`bundles/codes.json`(코드). 화면 예시와 흉내 판정이 다르면 멈춘다. |
| `codes.mjs` | 코드 묶음(마스터코드 6종, 상태 어휘, 고객사 가명, 규격·재질, 범례, 칼라부재료·칼라BOM 설계값). |
| `lib/maru.mjs` | As-Is 연산자 → Maru 셀 변환, 판정 흉내(FIRST·COLLECT). |
| `lib/proto.mjs` | HTML 안 JS 상수 읽기. |
| `load.mjs` | 등록기. 기본 dry-run, `--apply` 로 쓴다. `--verify` 는 mqc 로 다시 읽어 판정까지 맞춰 본다. |
| `gen-catalog.mjs` | 묶음 → `catalog.ts`(RULES·CODES·SCREEN_RULES·SCREEN_CODES). |
| `verify-result.json` | 마지막 `--verify` 결과. |

## 다시 돌리기

```bash
node scripts/mqc-demo/mdm/extract.mjs                 # 묶음 다시 만들기
node scripts/mqc-demo/mdm/load.mjs                    # dry-run: PLAN·SKIP 만 낸다
node scripts/mqc-demo/mdm/load.mjs --apply            # 등록·저장·케이스·확정, 개정(1.001)까지
node scripts/mqc-demo/mdm/load.mjs --verify           # mqc(8093) qcdRule search·history·judge·codes 로 확인
node scripts/mqc-demo/mdm/gen-catalog.mjs && (cd src/frontend/m-mqc && pnpm exec prettier --write src/common/catalog.ts)
```

- `--only` 로 일부만 돈다. 화면 objectId·룰 ID·코드 ID·`codes` 를 쉼표로 준다. 예: `--only C10B1074,QC_CUSTOMER`.
- 헤더: `X-Client-Key`(환경변수 `BACKEND_CLIENT_KEY`, 없으면 로컬 기본값), `X-Authenticated-User: admin`, `X-Authenticated-Role: MDM_STEWARD,MDM_STD_ADMIN`.
- 멱등이다. RELEASED 는 건너뛴다. 중간에 멈춘 DRAFT 는 이어 받는다(열이 있으면 열 저장, 행이 있으면 표 저장을 건너뛰고, 없는 케이스만 더한다).
- 확정한 룰·코드는 이 스크립트로 고치지 않는다. 내용을 바꾸려면 Maru 화면에서 새 버전을 만들거나 묶음에 `revisions` 를 더한다.
- mqc 캐시는 MDM 새 버전을 보는 데 10초쯤 걸린다. `--apply` 직후 `--verify` 가 어긋나면 잠시 뒤 다시 돌린다.

## 데이터 결정

- 사용중(Y) 행만 실었다. 상태 F 행(RM-005, TK-006 BIS)과 비활성 룰(R-C50)은 빠졌고 catalog 의 `note` 에 적었다.
- 결과 셀은 비울 수 없어(MDM `INCOMPLETE_RESULT`) 빈 문자 결과는 `-` 로 저장했다.
- 행 메모(`note`)에 레거시 순번·우선순위·원본주의를 남겼지만 qcdRule search 는 행 메모를 돌려주지 않는다. 그래서 화면에 필요한 값은 결과 열(`RULE_KEY`·`PRIO`·`LEGACY_NO`·`SRC_NOTE` 등)로 두었다.
- 하한 = 상한인 범위는 MDM 이 거부해(`BOUND_EQUAL`) `=` 로 바꿨다.
- 생산가부 축 값은 구간 하한이다. 폭 행은 `그 값 이상 ~ 윗행 값 미만`, 맨 위 행은 그 값만. 두께 열은 `그 값 이상 ~ 다음 열 값 미만`, 마지막 열은 그 값만. 주석 영역 칸은 행이 없다.
- 주문정합성은 COLLECT(LIST)라 결과가 적중 행 순서의 목록이다. 빈칸 입력은 키를 두고 값 `null` 로 줘야 IS_NULL 이 맞는다.
- 고객사는 실명 대신 `수요가 A…` 가명이다. 시뮬레이션이 이미 쓰던 A~D(110141·603034·200088·110123)는 그대로 두었다.
- 칼라부재료·칼라BOM 은 프로토타입이 자리표시뿐이라 직접 설계한 값이다(제조사도 가명).

## 등록 기록

2026-11-25 로컬(MDM 8096), 사용자 `admin`.

| 구분 | ID | 행 | 버전 | MDM 케이스 |
|---|---|---|---|---|
| 폭수축량 | C10B1074·1075·1076·1077·1078 | 32·139·10·3·2 | 1.000 | 5·5·3·3·2 통과 |
| 폭마진량 | C10B1073·C10B1079 | 33·26 | 1.000 | 4·4 통과 |
| 압연두께Set | C10B2060 | 82 | 1.000 | 5 통과 |
| 공정라우팅 | QD_PROCESS_ROUTING | 2 | 1.000 | 4 통과 |
| 원자재강종 | QD_RAW_MATERIAL_GRADE | 11 | 1.000·1.001 | 5 통과(두 버전) |
| 규격약호 | QD_SPEC_THK_STD·QD_SPEC_BASE_GRADE | 5·8 | 1.000·1.001 / 1.000 | 3·3 통과 |
| 주문단중에러 | QD_ORDER_WEIGHT_ERROR | 369 | 1.000·1.001 | 5 통과(두 버전) |
| 생산가부 | QD_FEAS_2CGL_GI·2CGL_GL·3CGL·4CGL·5CGL | 98·93·226·122·240 | 1.000 | 3·3·4·4·3 통과 |
| 주문정합성 | QD_ORDER_CHECK (COLLECT) | 137 | 1.000 | 7 통과 |
| 코드 | QC_ 41종 | 항목 539 | 1.000 | — |

mqc 확인(`--verify`, MDM·mqc 재기동 뒤): 룰 19개 모두 search 행 수·적중 정책·history 버전이 맞고, 케이스 판정 75건이 모두 맞았다. 주문정합성 프리셋 7건(빈칸 = null)도 포함한다.

알려진 일:

- mqc `qcdRule/codes` 는 항목을 0건으로 돌려준다. 코드는 MDM 에 41종·539항목 RELEASED 로 있다(codeItemEdit view 로 확인). 원인은 mqc 쪽에 있다. `QcdRuleService.codes` 가 `MdmDefinitionLookup.code(id)` 를 쓰는데, 이 함수는 버전 목차만 주고 항목은 비운다. 항목은 `codeAt(id, ver)` 로 읽어야 한다.
- 처음 이름 `QD_ORDER_CONSISTENCY` 는 DRAFT 를 지웠다(`ruleMng/delete target=VERSION`). 버전 없는 헤더(CREATED)만 남았다. OASIS 에 헤더만 지우는 동작이 없다.
- MDM 버그: 한 TABLE 저장에서 적중 정책을 바꾸면 저장 뒤 분석이 옛 정책으로 돈다. 조건 열이 많으면 끝나지 않는다. `load.mjs` 는 정책을 빈 표로 먼저 저장해 이 버그를 피한다.
