# ora-base 레인 정본 메모 (oracle-1007)

- 레인: ora-base / 브랜치 `feat/ora-base` / 워크트리 `/Users/jji/project/dmes-wt/ora-base` / 조정 세션 `dmes-standard-d8`
- 지시: ora-base-1 (정본 `/Users/jji/.coord/oracle-1007/lanes/ora-base/brief.md`)
- 마지막 갱신: 2026-10-07 저녁 KST. 머지①b(fb253556d) 완료. **다음 base 머지 묶음(머지②·③ 뒤 요청)** 준비 완료, 대기 중.

## 지금 상태

| 항목 | 상태 | 커밋·비고 |
|---|---|---|
| b0~b4, b6 | 완료·머지①(08978b6ff) | 스파이크·의존성·PDB 도구·소유표·시험 하니스·be-run |
| b5 적재기 + template 명령 + 하니스 PC 잠금 + KST 고정 | **머지①b 완료**(dev fb253556d, push 됨) | `lock-hold`·SIGTERM 정리·sqlplus 시간 상한, build-logic 시간대 |
| b5 후속(미머지, 다음 묶음) | 커밋됨 | 위젯 6행 CSV `5a3416987`, MCM 데이터 보정 convert 후처리 `c5b8d2142`(FORM_URL·폴더 USE_TP), `close` 잠금 제거 `bd7075d51` |
| b7 일부(미머지, 다음 묶음) | 커밋됨 | be-run `mdm.sample.path` 제거·README MDM 데이터 안내·옛 경로 문서 3곳 `5b4640946`, Oracle 테스트 가이드·V1 불변 규칙 `843e265be`, db-snapshot/README CSV 기준 `b845cbd8d` |
| b8 준비 | 목록 작성 완료 `b845cbd8d`·`3247557aa` | `docs/oracle-1007/b8-residue.md`(파일/레인/처리, 삭제 승인 후보 §8). 고친 것은 없음 |
| b7 나머지 | **머지④(ora-platform) 뒤 한 번에** | 아래 「b7 문서 항목」 |
| b8 | 머지④ 뒤 착수(조정자 확인 후) | b8-residue.md 의 ora-base 소유 행 + 머지 뒤 재검색으로 대조 |
| z1 마감 | 조정자 지시 때 | 전 모듈 시험·E2E·시험 시간 비교·SUMMARY·PDB 정리 |

PDB: 남긴 것은 `TPL_EMPTY` 와 `L_ORA_BASE`(닫힘, 옛 mcm V1 이 적용돼 있어 머지③ 뒤 `template-schema` 로 다시 복제한다). 시험 템플릿 `TPL_ZDATA`·`TPL_ZTEST` 는 지웠다.

## 남은 순서

1. 머지②(ora-mdm)·③(mcm 묶음) 뒤: dev 최신 합침 → Oracle 없이 되는 확인(build-logic 구성 `:lib:help`, `snapshot.py convert` 두 번 해시 동일) → 「다음 base 머지 묶음」 머지 요청. 묶음 = `c5b8d2142`·`5a3416987`·`5b4640946`·`bd7075d51`·`843e265be`·`b845cbd8d`·`3247557aa`(+ 이후 커밋).
2. 모듈 V1 이 dev 에 들어오면 `template-schema --rebuild` → `template-data --rebuild` 로 템플릿을 만들고 `L_ORA_BASE` 를 다시 복제한다(조정자 허락한 시점·PC 잠금 아래).
3. 머지④ 뒤: b7 나머지, b8, 조정자 지시로 z1.

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

- 옛 경로 문서 3곳 수정: `docs/guide/BackEnd/Mcm-Core-Onboarding.md:155,159`, `docs/mcm/erd/csa-sec-erd.md:256`, `docs/widget-2026-10/erd-widget-meta.md:31` → **완료**(`5b4640946`).
- **머지④ 뒤 문서 묶음**(앱이 아직 SQLite 로 뜨는 동안 고치면 사실과 어긋나므로 한 번에): README「처음 받은 뒤 셋업」·`Backend-Implementation-Guide`·`dialect-neutral-sql`·`docs/guide/Database/README`·`Mes-Guide`·`flyway-migration-add` 스킬(`SKILL.md`·`migration_tool.mjs`·골든 시험)·`dflow-merge`(`migration-check.sh`·`script-details.md`)·`dflow-dev/references/dev-dialect.md`·`dflow-team/references/resolve-prompt.md:208`.
- mcm wildfly 는 이제 `OracleDialect`·`java:/jdbc/mcm/*` JNDI(ora-mcm-app 666812393). 낡은 설명 수정: `docs/guide/Operations/DMES-Deployment-Guide.md:117`, `docs/framework/DataSource_JNDI설계.md` 머리 안내. `docs/mdm/adr/0004-drop-mssql-production-assumption.md:93` 은 **본문을 고치지 않고** 「2026-10-07 oracle-1007 로 대체됨」 주석과 링크만 단다.
- 위젯 가이드 `Widget-Authoring-Guide.md:505` 의 `widget-rule-calc-defs.sql` 예시 문장은 ora-mcm-core 소관이다(§3 도 건드리지 않는다).

## 운영 제약

- `feat/ora-base` 위에 ora-mcm-app·ora-platform 이 쌓였다(워크트리가 이 브랜치를 merge). **머지① 전에 이미 커밋한 것을 rebase·force 로 바꾸지 않는다. 추가 커밋만 한다.**

## 운영 규칙(조정자 결정)

- Oracle 동결: 조정자가 「Oracle 재개」 를 보낼 때까지 새 Oracle 명령 금지(상태 확인 sqlplus 포함). 재개 뒤 PC 전체에서 무거운 작업(clone·drop·template·open·시험 하니스)은 한 번에 하나. `close` 는 잠금 없이 실행.
- 확인용 sqlplus 가 2분 넘게 걸리면 보낸 쪽이 TERM 한다(고아 `podman exec` 를 남기지 않는다).

## 알려진 위험·미확인

- `pdb.mjs clone` 이 한 번 `SQL 실패(exit 1)` 로 끝났는데(L_SPIKE1, 같은 이름 PDB 는 만들어져 열려 있었다) 오류 본문을 보지 못했다. 다시 시험할 때 sqlplus 출력 전문을 남긴다.
- 시드에서 템플릿을 만들 때 부하가 크면 `template-create` 가 수 분~십수 분 걸린다(다른 레인이 인스턴스를 쓸 때).
- 삭제된 PDB 폴더가 빈 채 남는다(`rmdir` 로 치울 수 있고 해롭지 않다).
