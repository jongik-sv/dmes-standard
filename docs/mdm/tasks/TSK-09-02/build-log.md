# TSK-09-02 build-log

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과(초) | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T06:07:25Z | 기준선 | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 6 | 2.96 | 기준선 측정(2263건, 실패 0) |
| 2026-09-26T06:07:38Z | 기준선 | `cd src/backend && … ./gradlew :maru-mdm-engine:test :mdm:test … && cd ../frontend && pnpm --filter @dk-oasis/m-mdm test && … check_oasis_contract.py --root .` | 모듈 | 19 | 2.96 | 기준선 측정(4637건, 실패 0) |

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| MASTER_AT/MASTER의 버전·카테고리 소급 규칙(최초 행/버전으로 소급, 코드는 항상 V 기준)은 04 「판정 참고 구현」 그대로다 | B1-M1(`mutations/B1-M1.mut`) — `DefaultCodeResolver.selectVersion`에서 `Segments.covering`(기준일이 덮는 버전 선택)을 없애고 늘 최초 RELEASED 버전만 고르게 함 | `CodeConfirmSampleHistorySqliteTest`(H6 — baseDt=2026-09-03 인데 v1.000 으로 잘못 골라 BASE 집합이 2P 빠진 채로 나와 어긋남) | 잡힘 |
| `CodeLookup`·`MasterLookup`을 운영 Spring 빈으로 등록하지 않는다(D-077/D5, "04 원장 미구축" D2) — 이 작업이 그 결정을 뒤집지 않는다 | B1-M2(`mutations/B1-M2.mut`) — `MdmCodeLookup`에 `@Component` 를 붙여 운영 빈으로 등록되게 함 | `MasterCodeDeprecateEngineSqliteTest.G0_운영_CodeLookup_빈은_없다` | 잡힘 |

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
| B1 | TSK-09-02-build-B1 | sonnet | 예 | - | 완료(관련 테스트 초록, 변이 2건 모두 잡힘) | - | - | 0 |
