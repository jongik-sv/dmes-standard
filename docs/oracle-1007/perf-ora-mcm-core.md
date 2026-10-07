# ora-mcm-core 시험 시간 전후 (oracle-1007 c4)

## 전 — H2·SQLite (2026-10-07 19:2x, c2 0fc581c9b 기준)

- 명령: `./gradlew :mcm-core:test --rerun-tasks -q --console=plain --continue`(heavy.sh 슬롯 대기 0초)
- 결과: 클래스 111 · 시험 1197 · 실패 3(SQLite 전용 `CommUserMngServiceSearchRoleGrpSqliteTest` — INTERVAL 미지원, c4 에서 Oracle 로) · 건너뜀 0
- 벽시계 67초(의존 모듈 다시 빌드 포함) · 결과 XML 의 클래스별 time 합 44.9초
- 측정 PC: MacBook Air M5(팬 없음) — 한 번 측정이라 흔들림이 크다.

## 뒤 — Oracle(시험 PDB)

(c4 끝에 clone 모드 전체 실행으로 채운다)
