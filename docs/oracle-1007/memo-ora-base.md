# ora-base 레인 정본 메모 (oracle-1007)

- 레인: ora-base / 브랜치 `feat/ora-base` / 워크트리 `/Users/jji/project/dmes-wt/ora-base` / 조정 세션 `dmes-standard-d8`
- 지시: ora-base-1 (정본 `/Users/jji/.coord/oracle-1007/lanes/ora-base/brief.md`)
- 마지막 갱신: 2026-10-07 17:15 KST, **조정자 지시로 일시 정지 중**(사용자 퇴근). 다음 지시 전까지 새 작업 없음.

## 지금 상태

| 항목 | 상태 | 커밋·비고 |
|---|---|---|
| b0 스파이크 | 완료·머지① | `docs/oracle-1007/spike.md` |
| b1 의존성·b3 소유표·b6 be-run | 완료·머지①(dev 08978b6ff, push 됨) | boolean 공통 설정은 TINYINT 로 정정(머지 뒤 커밋) |
| b2 PDB 도구·b4 시험 하니스 | 완료·머지①. 이후 `template-schema`·`template-data` 추가(미머지) | 하니스: mdm `SapCsvTest` 8건 복제→시험→삭제 51초 확인 |
| b5 적재기 | **핵심 완료(미머지)** `scripts/db-snapshot/snapshot.py` convert·export·import | f9baf7a9b. L_ORA_BASE 에서 mdm 39표 42,870행·mcm 54표 481행·MCM_SOURCE 6행·MCAAPUSER 6행, IDENTITY 8개·시퀀스 재설정, FK 복원, 동적 표 생성+GRANT, PK 빈 행 제외, epoch→KST 확인. `template-schema`(5벌 V1 적용)→`template-data`(CSV 적재 mdm 344초) 끝까지 통과 |
| b5 후속: 위젯 정의 6개 | CSV 반영 **미커밋** | `db-snapshot/MCMAPUSER/TB_MCM_WIDGET_DEF.csv` 의 6행(`def.fpkt65d4`·`ldj2hpgw`·`lo41tduo`·`qcondsmp`·`spzufhgo`·`ubb8dih0`) CONFIG_JSON.sql 만 Oracle 판으로 교체(원문 `git show feat/ora-mcm-core:docs/oracle-1007/widget-sql-oracle.md`). **남음: 레인 PDB 에서 import 후 SQL 실행 확인 → 커밋 → PDB close** |
| 템플릿 정리 | 시험 템플릿 `TPL_ZTEST`·`TPL_ZDATA`·`L_ORA_BASE` drop 이 백그라운드로 진행 중이었음 — 남았으면 `node scripts/oracle/pdb.mjs drop <이름>`. 남기는 것: `TPL_EMPTY`(사용자만) | |
| b7 문서·스킬 | 미착수(ora-platform 머지 뒤) | 항목: 가이드 Database/*·dialect-neutral-sql·Backend-Implementation-Guide·Mes-Guide·flyway-migration-add·dflow-merge migration-check.sh, 워크트리 서버 확인 절차, 옛 경로 문서 3곳(`Mcm-Core-Onboarding.md:155,159`·`csa-sec-erd.md:256`·`erd-widget-meta.md:31`), be-run 의 `mdm.sample.path` 인자 정리·"로컬 MDM 데이터는 `snapshot.py import`" 안내(MdmLocalSampleLoader 가 archive 로 감), e2e-clean-data 를 가리키는 문서·스크립트 정리(스크립트는 dev 에서 이미 삭제됨 — dev 합칠 때 되살리지 않는다). **`Widget-Authoring-Guide.md` §3 은 건드리지 않는다**(ora-mcm-core 소관) |
| b8 잔재 정리 | 미착수(ora-platform 머지 뒤) | 카탈로그의 sqlite·mssql·h2, scripts/archive, scripts/perf/render, playwright.config.ts, 옛 SQL 스냅샷 `db-snapshot/{mdm,mcm}`(→archive), mcm-core `SqliteTemporalConverterContributor` 제거(mls yml 이 가리키므로 platform 머지 뒤) |
| z1 마감 | 조정자 지시 때 | 전 모듈 시험·E2E·시험 시간 비교·SUMMARY·PDB 정리 |

## 남은 순서(재개 뒤)

1. 위젯 CSV: 레인 PDB 하나(`clone TPL_EMPTY L_ORA_BASE` 또는 `template-schema`)에서 `snapshot.py import` 후 6개 SQL 을 MCMAPUSER 로 실제 실행(읽기 전용) → 확인 → `git add db-snapshot/MCMAPUSER/TB_MCM_WIDGET_DEF.csv` 커밋(메시지에 변환표 경로 적기, 원본 표 문서는 복사하지 않음) → PDB close → 진행 보고.
2. 미커밋·미머지 정리: `scripts/oracle` 템플릿 명령·README(커밋됨), b5(커밋됨) 를 머지④ 전에 dev 최신 합쳐 머지 요청(ora-mdm 머지② 와 ③ 같은 창 확인).
3. ora-platform 머지 뒤 b7·b8, 조정자 지시로 z1. 모듈 V1 이 dev 에 들어오면 `template-schema --rebuild` → `template-data --rebuild`.

## 결정·전달 사항(조정자)

- 스키마와 Flyway 주인: MCMAPUSER·MCAAPUSER·MCM_SOURCE·MCM_BACKUP=mcm-core, CARAVANUSER·IFUSER=caravan-hub, EAIUSER=표 없는 접속 사용자(IFUSER INBOUND SELECT·UPDATE, OUTBOUND INSERT, DELETE 없음), MDMAPUSER=mdm, MLSAPUSER·MPPAPUSER·MQCAPUSER·MPNAPUSER·APSAPUSER=각 모듈.
- V1 DDL 은 접두 없이 쓰고 스키마 폴더별 Flyway defaultSchema 로 적용한다.
- Podman VM 은 2GB 유지(사용자 결정). 동시 열린 PDB 상한 기본 3, `DMES_ORA_MAX_OPEN` 로 PC 마다 올린다. 시험 PDB 는 복제→시험→즉시 삭제(PC 전체 동시 하나), 레인 PDB 는 쓸 때만 열기.
- **시각은 KST 로 통일**(UTC 결정 철회, 조정자 17:20): `hibernate.jdbc.time_zone` 은 넣지 않고(JVM 기본 Asia/Seoul), Instant 감사 칸은 `preferred_instant_jdbc_type=TIMESTAMP` 만 둔다. 컨테이너 `TZ: Asia/Seoul`(compose 커밋 04dfdcf33, 컨테이너 재생성은 조정자가 한다). 적재기는 epoch 밀리초→KST, KST 문자열은 그대로.
- 조정자가 인스턴스 부하를 줄이려고 `job_queue_processes=0` 을 적용했다(자동 작업·통계 수집 정지, 개발용). b3 연결 규약에 반영했다.

## b5 적재기 요구사항(조정자 전달)

1. mdm V1 이 초기 행 7개(`TB_MDM_SYSTEM` 6·`TB_MDM_DICT_SEQ` 1)를 넣는다 → 적재기는 MERGE 또는 건너뜀.
2. IDENTITY 8개(TERM·DOMAIN·COLUMN·LAYOUT·META_REV·CODE_RECV·DATA_RECV·RULE_RECV) → 적재 뒤 `ALTER TABLE … MODIFY … GENERATED … START WITH LIMIT VALUE` 로 재설정. mcm-core 도 같다.
3. 업무 일시는 TEXT('YYYY-MM-DD HH24:MI:SS')→TIMESTAMP(6). 감사 C_AT·U_AT 는 epoch 밀리초와 KST 문자열이 섞여 있다 → epoch 는 KST 로 변환하고 KST 문자열은 그대로 넣는다(UTC 결정은 철회됨). 업무 일시(감사 아닌 것)는 변환하지 않는다.
4. CLOB 15개, NOT NULL 해제 1개(`TERM.DEFINITION`).
5. 코드 원장 3표(`TB_MCM_CODE_MASTER`·`CATEGORY`·`DETAIL`)는 `MCM_SOURCE` 와 `MCMAPUSER` 양쪽에 넣는다. `MCM_BACKUP` 은 비워 둔다.
6. 형식: sqlite3 없이 윈도우에서도 도는 스냅샷(표별 CSV 등), Python(oracledb thin) 또는 node. `db-snapshot`·`export/import`·`tools/e2e-clean-data.sh` 전환.
7. (ora-mcm-core c1) 시퀀스 `SEQ_MCM_MOM_TC_SEND`·`SEQ_MCM_MOM_TC_ERROR` 는 적재 뒤 `MAX(키)+1` 로 재설정한다.
8. (ora-mcm-core c1) 동적 표 `MCAAPUSER.TB_MCA_<RULE_ID>` 는 앱이 만들지 않는다. 적재기가 SQLite 의 해당 표를 `MCAAPUSER` 에 만들어 옮기고 `MCMAPUSER` 에 SELECT·INSERT·UPDATE·DELETE GRANT 를 준다.
9. (ora-mcm-core c1) MSSQL 원본 기준 `TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID=''` 행은 옮기지 않는다.

## b7 문서 항목(조정자 전달)

- 옛 경로 문서 3곳 수정: `docs/guide/BackEnd/Mcm-Core-Onboarding.md:155,159`, `docs/mcm/erd/csa-sec-erd.md:256`, `docs/widget-2026-10/erd-widget-meta.md:31`.

## 운영 제약

- `feat/ora-base` 위에 ora-mcm-app·ora-platform 이 쌓였다(워크트리가 이 브랜치를 merge). **머지① 전에 이미 커밋한 것을 rebase·force 로 바꾸지 않는다. 추가 커밋만 한다.**

## 알려진 위험·미확인

- `pdb.mjs clone` 이 한 번 `SQL 실패(exit 1)` 로 끝났는데(L_SPIKE1, 같은 이름 PDB 는 만들어져 열려 있었다) 오류 본문을 보지 못했다. 다시 시험할 때 sqlplus 출력 전문을 남긴다.
- 시드에서 템플릿을 만들 때 부하가 크면 `template-create` 가 수 분~십수 분 걸린다(다른 레인이 인스턴스를 쓸 때).
- 삭제된 PDB 폴더가 빈 채 남는다(`rmdir` 로 치울 수 있고 해롭지 않다).
