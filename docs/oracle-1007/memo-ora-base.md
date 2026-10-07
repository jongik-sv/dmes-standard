# ora-base 레인 정본 메모 (oracle-1007)

- 레인: ora-base / 브랜치 `feat/ora-base` / 워크트리 `/Users/jji/project/dmes-wt/ora-base` / 조정 세션 `dmes-standard-d8`
- 지시: ora-base-1 (정본 `/Users/jji/.coord/oracle-1007/lanes/ora-base/brief.md`)
- 마지막 갱신: 2026-10-07 17:15 KST, **조정자 지시로 일시 정지 중**(사용자 퇴근). 다음 지시 전까지 새 작업 없음.

## 지금 상태

| 항목 | 상태 | 커밋·비고 |
|---|---|---|
| b0 스파이크 | **완료** | `docs/oracle-1007/spike.md`(5e42d475a). 동시 열린 PDB 4개에서 인스턴스 종료 → 상한 3 |
| b1 의존성 | **완료**(추가만) | c9a6254a2. `ojdbc11`·`flyway-database-oracle` 을 카탈로그와 14개 build.gradle 에 추가 |
| b3 소유표·연결 규약 | **완료**(MCM_BACKUP·EAIUSER·운용 규칙 포함) | 5e42d475a `docs/oracle-1007/schema-owners.md` |
| b6 be-run | **완료** | b1efdb608. `--pdb=<PDB>`·`BE_ORA_PDB` 일 때만 접속값 전달(.sh·.ps1, .cmd 는 .ps1 을 부른다) |
| b2 PDB 도구 | 코드 작성·부분 검증 | `scripts/oracle/pdb.mjs`·`pdb.sh`·`pdb.cmd`·`README.md`. 시드→템플릿 생성, 사용자 13명 생성, 봉인, 복제(빈·데이터), 열기·닫기·삭제는 실측 통과. **`template-create` 를 처음부터 끝까지 한 번 더, 그리고 한 번 실패했던 `clone`(원인 미확인) 재현 시험 필요** |
| b4 시험 하니스 | 코드 작성·**미검증** | `build-logic/.../OraTestPdbService.groovy`·`dmes.test-conventions.gradle`. `-Pdmes.ora.test=clone` 으로 작은 mdm 시험(`SapCsvTest` 등)을 돌려 복제→시험→삭제를 확인해야 한다 |
| b5 적재기 | 미착수 | ora-mdm m1 기준선 뒤. 요구사항은 아래 |
| b7·b8·z1 | 미착수 | ora-platform 머지 뒤 / 조정자 지시 때. **b8 에 추가: mcm-core 의 `SqliteTemporalConverterContributor` 제거**(mls yml 이 가리키므로 platform 머지 뒤에 지운다) |

커밋 대기(워킹 트리): b2·b4 파일(미커밋, 정지 시 WIP 커밋으로 남긴다).

## 남은 순서(재개 뒤)

1. b2·b4 실검증(레인당 Oracle 단계 하나씩, `heavy.sh` 경유). 템플릿 `TPL_EMPTY`(사용자 13명만 있는 빈 템플릿)는 **만들고 봉인했다(닫힌 상태, MOUNTED, 794MB)** — 정지하면서 지우지 않고 CLOSE 만 해 두었다. 상태는 `node scripts/oracle/pdb.mjs list`. 이 템플릿으로 `clone TPL_EMPTY L_ORA_BASE`→ 작은 mdm 시험(`SapCsvTest` 등)을 `-Pdmes.ora.test=clone` 으로 돌려 복제→시험→삭제를 확인한다(템플릿이 이미 있어 `template-create` 의 처음부터 끝까지는 이번 12분 55초 실행으로 확인됨).
2. 머지①(b1~b4·b6) 요청: 머지 직전 `dev` 최신 합치기, `pdb.mjs`·하니스 검증 결과·be-run dry-run 결과 첨부. 머지②(mdm)와 ③(mcm 묶음)은 같은 창(스파이크 ⑦).
3. b5 적재기: mdm m1 기준선 뒤. b7·b8: ora-platform 머지 뒤(스킬 파일은 skills-win 레인과 겹칠 수 있어 착수 전 조정자 확인).

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

## 알려진 위험·미확인

- `pdb.mjs clone` 이 한 번 `SQL 실패(exit 1)` 로 끝났는데(L_SPIKE1, 같은 이름 PDB 는 만들어져 열려 있었다) 오류 본문을 보지 못했다. 다시 시험할 때 sqlplus 출력 전문을 남긴다.
- 시드에서 템플릿을 만들 때 부하가 크면 `template-create` 가 수 분~십수 분 걸린다(다른 레인이 인스턴스를 쓸 때).
- 삭제된 PDB 폴더가 빈 채 남는다(`rmdir` 로 치울 수 있고 해롭지 않다).
