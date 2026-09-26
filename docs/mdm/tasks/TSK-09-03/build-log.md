# TSK-09-03 build-log

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과 | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T06:34:46Z | 기준선 | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 1 | 1.65 | 기준선 재사용 (2263/0) |
| 2026-09-26T06:34:46Z | 기준선 | `cd src/frontend && pnpm --filter @dk-oasis/shared build && pnpm test:unit:shared && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint` | 모듈 | 31 | 6.45 | 기준선 측정 (1232/0) |

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다 | B1-M1 — `CONFIRM_ACTIONS` 에서 `MdmActions.CONFIRM` 제거 | `MdmOasisActionVocabularyTest.mcm_시드의_confirmActions_는_MdmPermissions_CONFIRM_ACTIONS_와_같다` | 잡힘 |
| `MdmPermissions.MATRIX`·`READ_ACTIONS`/`EDIT_ACTIONS`/`CONFIRM_ACTIONS` 는 권한 매트릭스의 단일 진실 소스다 | B1-M2 — mcm 시드 matrix 의 dmc STD_ADMIN 을 READ→EDIT 로 변경 | `MdmOasisActionVocabularyTest.mcm_시드의_그룹_역할_매트릭스는_MdmPermissions_MATRIX_와_같다` | 잡힘 |
| `DataInitializer` 의 시드 SQL(값 포함)은 고치지 않는다(B1 은 대조만 한다) — 이 변이는 그 대조가 실제로 빠진 시드를 잡는지 확인 | B1-M3 — `seedMdmLayoutMenus` 배열에서 `layoutMng` 제거(시드 호출 1건 누락) | `MdmOasisActionVocabularyTest.mcm_시드가_BPMN_23개_화면을_모두_커버한다` | 잡힘 |
| mdm 백엔드에는 서버 쪽 권한 필터가 없다 — API RBAC 는 BFF(`evaluateApiPolicy`) 한 곳(B1 이 새로 잇는 BE 키 생성↔FE 키 파싱 이음매) | B1-M4 — `rbac-policy.ts` `makeKey` 의 `.toLowerCase()` 제거 | `rbac-policy.unit.test.ts` `parseRbacKey > MDM 실제 OASIS 경로도 소문자화` | 잡힘 |

변이 파일: `docs/mdm/tasks/TSK-09-03/mutations/B1-M1.mut`~`B1-M4.mut`.

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
| B1 | TSK-09-03-build-B1 | sonnet | 예 | - | UNIT_DONE | - | - | 0 |
