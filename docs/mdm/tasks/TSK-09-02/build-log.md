# TSK-09-02 build-log

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과(초) | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T06:07:25Z | 기준선 | `cd src/backend && … ./gradlew :mdm:test … && … check_oasis_contract.py --root .` | 모듈 | 6 | 2.96 | 기준선 측정(2263건, 실패 0) |
| 2026-09-26T06:07:38Z | 기준선 | `cd src/backend && … ./gradlew :maru-mdm-engine:test :mdm:test … && cd ../frontend && pnpm --filter @dk-oasis/m-mdm test && … check_oasis_contract.py --root .` | 모듈 | 19 | 2.96 | 기준선 측정(4637건, 실패 0) |

## 실행 모델

| 단위 | 에이전트 | 모델 | 시험 | 승급 | 결과 | 경과 | 토큰 | advisor |
|---|---|---|---|---|---|---|---|---|
