# ora-mcm-core 시험 시간 전후 (oracle-1007 c4)

## 전 — H2·SQLite (2026-10-07 19:2x, c2 0fc581c9b 기준)

- 명령: `./gradlew :mcm-core:test --rerun-tasks -q --console=plain --continue`(heavy.sh 슬롯 대기 0초)
- 결과: 클래스 111 · 시험 1197 · 실패 3(SQLite 전용 `CommUserMngServiceSearchRoleGrpSqliteTest` — INTERVAL 미지원, c4 에서 Oracle 로) · 건너뜀 0
- 벽시계 67초(의존 모듈 다시 빌드 포함) · 결과 XML 의 클래스별 time 합 44.9초
- 측정 PC: MacBook Air M5(팬 없음) — 한 번 측정이라 흔들림이 크다.

## 뒤 — Oracle 26ai Free(시험 PDB, 2026-10-07 21:xx, 03e1263da 기준)

- 명령: `DFLOW_HEAVY_WAIT=1800 ./gradlew :mcm-core:test -Pdmes.ora.test=clone --rerun-tasks --console=plain --continue`
  (하니스가 TPL_EMPTY 에서 T_ORA_MCM_CORE 복제 → 시험 → 삭제, PC 잠금 대기 0초)
- 결과: 클래스 118 · 시험 1232 · 실패 0 · 건너뜀 2(로컬 PDB 는 MCMAPUSER 에 SELECT ANY TABLE 이 있어 「GRANT 없으면 0건」 사례 2개를 건너뜀)
- 벽시계 51초(복제·삭제·컴파일 포함) · 결과 XML 의 클래스별 time 합 38.0초
- 가장 긴 클래스: CollectSourcesTest$Sql 5.1초 · AuditLogServiceSearchByActorPagingTest 3.8초 · WidgetQueryReadOnlyTest 3.0초
  (Flyway clean+migrate 는 JVM 당 한 번 — 레인 PDB 첫 실행 때 validate 시험이 136초 걸린 것은 VM 2GB 시절 잠금 대기·스래싱 영향)

## 비교

| | H2·SQLite(전) | Oracle(뒤) |
|---|---|---|
| 시험 수 | 1197(실패 3, SQLite 전용) | 1232(실패 0, 건너뜀 2) — Oracle 확인 시험 oracheck/ 8클래스·validate 추가 |
| 벽시계 | 67초 | 51초 |
| 시험 시간 합 | 44.9초 | 38.0초 |

한 번 측정이라 흔들림이 크다(MacBook Air M5, 팬 없음). 결론: Oracle 로 옮겨도 시험 시간이 늘지 않았다.
