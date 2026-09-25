# TSK-07-02 머지 충돌 해소 기록

## 시도 1

- 기준 HEAD: `12a3262`(origin/dev) · 머지 대상: `origin/agent/4be6eb9f-mdm-data-mng`(`9afd076`) · merge-base: `f59cce7`
- 기준선 출처: 개발 브랜치 measured · MERGE_HEAD 단독 gate-record(`verify_gate` head `7ce43da`, 이후 변경은 Task 폴더 안뿐) · merge-base cache
- `src/frontend/m-mdm/tsup.config.ts` — R1. 양쪽이 `entry` 목록의 같은 자리(`dmc/codeEdit` 뒤)에 항목을 더했다(개발 브랜치 TSK-06-05: `dmc/codeConfirm`, 이 브랜치: `dmd/dataMng`·`dmd/dataEdit`·`dmd/dataCateEdit`). 개발 브랜치 항목을 먼저 두고 이 브랜치 세 항목을 뒤에 붙였다. 중복 없음.
- 텍스트 충돌 없이 자동 머지된 파일 점검:
  - `src/frontend/m-mcm/lib/generated/page-registry.ts` — `dmc/codeConfirm` 과 `dmd/dataMng`·`dataEdit`·`dataCateEdit` 가 모두 있다. 머지 트리에서 `node scripts/generate-page-registry.mjs` 를 다시 돌려 차이 없음을 확인했다.
  - `src/backend/mcm/api/.../DataInitializer.java` — 이 브랜치의 `seedMdmDataMngMenus()`(dmd 001~003)와 개발 브랜치의 codeConfirm 시드가 함께 있다. 메뉴 id·FULL_SEQ 중복은 새로 생기지 않았다(폴더·순번 겹침 5건은 기준 HEAD 에도 있던 것).
- `migration-check.sh --staged`: `MIGRATION_OK`(머지 직후·게이트 뒤 두 번).
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:compileMssqlTestJava --no-daemon --console=plain
- 게이트: 개발 브랜치 4221 · MERGE_HEAD 단독 4114 · merge-base 4048 · 계획 삭제 0 · 하한 4287 · 결과 4287 (신규 실패 0)

| 스위트(명령) | 개발 브랜치 | MERGE_HEAD 단독 | merge-base | 스위트 하한 | 결과 |
|---|---|---|---|---|---|
| `./gradlew testAll`(src/backend) | 3220 | 3172 | 3120 | 3272 | 3272 |
| `pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` | 833 | 774 | 760 | 847 | 847 |
| `pnpm test:unit:shared` | 168 | 168 | 168 | 168 | 168 |
| `pnpm --filter @dk-oasis/m-mdm lint` | pass | pass | pass | - | pass |
| `check_oasis_contract.py --root .` | ERROR 0 / WARN 0 | 같음 | 같음 | - | ERROR 0 / WARN 0 / INFO 29 |
