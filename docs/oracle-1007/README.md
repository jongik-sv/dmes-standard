# oracle-1007 레인 공통 규칙

2026-10-07, 로컬 개발·백엔드 자동 테스트·운영 DB 를 SQLite·H2·MSSQL 에서 **Oracle 26ai Free 하나**로 바꿔 개발·테스트·운영의 방언 차이를 없앤다. 세션 5개에 레인으로 나눠 진행한다.
조정 세션은 **oracle-1007 조정자(dmes-standard 메인 체크아웃 세션)** 이다. 질문·승인 요청·머지 요청은 모두 이 세션에 SendMessage 로 보낸다(사용자 화면에 묻지 않는다).

| 레인 | 맡는 일 | 브랜치 |
|---|---|---|
| ora-base | 스파이크, 의존성·PDB 도구·시험 하니스·기동 스크립트, 적재기, 문서·스킬, 잔재 정리, 마감 | `feat/ora-base` |
| ora-mdm | mdm Oracle 기준선, SQLite 전용 코드 제거, 시험 하니스, mdm E2E | `feat/ora-mdm` |
| ora-mcm-core | mcm-core Oracle 기준선, 방언 전환, 위젯 조회 SQL, H2 시험 전환 | `feat/ora-mcm-core` |
| ora-mcm-app | mcm 앱 Flyway 전환·Java DDL 제거, `''` 비교, 프로파일 | `feat/ora-mcm-app` |
| ora-platform | caravan·cactus·oasis·mls·mpp·mqc·mpn·aps-core | `feat/ora-platform` |

각 레인의 할 일·소유 파일·금지 파일은 조정 세션이 보낸 지시 메시지가 정본이다.

## 0. 사용자 확정 사항 (바꾸지 않는다)

1. 로컬 앱 기동과 **백엔드 자동 테스트 전부** Oracle 이다(mdm 임시 SQLite·mcm-core H2·caravan/oasis H2 포함).
2. SQLite 를 완전히 걷어낸다: 프로파일·`db/migration/**/sqlite`·SQLite 치환기·sqlite-jdbc. 기존 `src/backend/data/*.db` 파일은 지우지 않는다.
3. 운영(WildFly)·caravan-hub 사이트 프로파일(kp·ph)도 Oracle. MSSQL·PostgreSQL·H2 설정은 없앤다.
4. **SQL 의 스키마 접두를 유지한다**(`MCMAPUSER.`·`MCAAPUSER.`·`EAIUSER.`·`IFUSER.`·`CARAVANUSER.`). 로컬 Oracle 에도 운영과 같은 이름의 사용자를 만든다. SQL 은 개발·테스트·운영이 글자 그대로 같아야 한다. 접두를 지우는 치환기를 새로 만들지 않는다.
5. 격리는 **레인(워크트리)별 PDB** 로 한다. 컨테이너·인스턴스는 PC 에 하나(`oracle-26ai-free`, Podman VM 3GB(처음 2GB 에서 10-07 스래싱 3회로 올림)·SGA 900M·PGA 목표 400M·cpu 2·processes 200)이고 PDB 는 최대 16개다.
6. Flyway 방언 폴더는 Oracle 하나다. 모듈별 Oracle 기준선 V1 을 새로 만든다.

## 0.1 조정자가 권장안으로 정한 것 (사용자가 바꾸면 따른다)

- 운영 이름이 없는 모듈의 Oracle 사용자는 `<모듈>APUSER` 규칙(예: `MDMAPUSER`, `MLSAPUSER`). 이 모듈들 SQL 에는 접두가 없으므로 접속 사용자 = 스키마 주인이다.
- WildFly(운영)에서는 Flyway 를 계속 끄고 DBA 가 같은 V 파일을 적용한다. JNDI 기본값은 `java:/jdbc/<모듈>/dsBiz` 같은 중립 이름으로 바꾸고 env 로 덮어쓸 수 있게 둔다.
- db-snapshot 형식은 sqlite3 없이 윈도우에서도 도는 형식(표별 CSV 등)으로 바꾼다. 적재기는 Python(oracledb thin) 이나 node 중 ora-base 가 정한다.
- 스키마마다 Flyway 주인 앱은 하나다(소유표는 `docs/oracle-1007/schema-owners.md`, ora-base 가 b3 에서 작성). 주인이 아닌 앱은 `ddl-auto none` 또는 `validate`.
- Oracle 의 `''`=NULL 정책: 빈 문자열이 실제로 들어가는 NOT NULL 컬럼은 NULL 허용으로 바꾸고, 코드의 `= ''` 비교는 NULL 을 함께 보게 고친다. 기준선 리뷰(opus)에서 컬럼별로 확정한다.

## 1. 작업 방식

- 착수 지시의 「작업 방식」 블록을 따른다. 모든 `agent()` 에 `model`·`effort` 를 적는다.
- 항목마다 「구현 → 리뷰 → 지적 수정」. 리뷰가 clean 이 아니면 다음 항목으로 넘어가지 않는다. 기준선 마이그레이션과 방언 의미 변경(`''`·일시·CLOB)은 opus/high 리뷰.
- 셸 명령은 짧게 나눈다. heredoc·`sh -c`·`$(…)` 복합 명령을 피하고 파일 수정은 Edit·Write 로 한다.
- 무거운 단계는 시간 상한(모듈당 15분, 전체 빌드 40분)을 둔다.

## 2. 작업 공간과 Oracle

- 워크트리는 `/Users/jji/project/dmes-wt/<레인>`(기준 `dev` 최신). git 실행 파일·JDK 경로는 PC 의 CLAUDE.md·메모리를 따른다.
- **Oracle 컨테이너를 내리거나 재시작하지 않는다**(`podman compose down`·`podman machine stop` 금지). 메모리·SGA 설정도 바꾸지 않는다. 필요하면 조정자에게 요청한다.
- PDB 도구가 머지되기 전(ora-base b2 전)에는 `FREEPDB1` 안에 **레인 접두 사용자**(`L_<레인약어>_*`, 예 `L_MDM_MDMAPUSER`)를 SYSTEM(`sys_password_123`)으로 만들어 초안 검증에 쓴다. 이 사용자는 레인 것만 만들고 지운다. `MDM`·`MCM`·`MLS`·`MPN`·`MPP`·`MQC`·`CARAVAN_CONSOLE`·`dmes_user` 사용자는 건드리지 않는다(조정자 데이터).
- 레인 PDB 는 시험·적재·서버 확인을 실제로 돌리는 동안만 `open`(`node scripts/oracle/pdb.mjs open <PDB>`) 하고 끝나면 바로 `close` 한다(drop 아님). 열린 PDB 는 PC 전체 상한 3개를 나눠 쓴다. 템플릿 `template-schema`·`template-data` 와 규칙은 `scripts/oracle/README.md`.
- PDB 도구가 머지된 뒤에는 자기 레인 PDB 만 만들고 지운다. 다른 레인 PDB·템플릿 PDB 는 건드리지 않는다.
- 로컬 서버(mls 8092·mdm 8096·mcm 8100·포털 5100)는 끄거나 재기동하지 않는다. 화면 확인은 조정자에게 요청한다. 레인이 서버를 직접 띄울 때는 다른 포트(18100·18096·5110 등)와 자기 PDB 로 띄우고 끝나면 내린다.
- 무거운 명령(gradle 전체 시험·빌드·E2E)은 `.claude/skills/dflow-dev/scripts/heavy.sh` 를 거치고 레인당 한 번에 하나. Oracle 을 쓰는 시험은 인스턴스를 공유하므로 Hikari 상한을 작게(3) 둔다.
- 도커·Testcontainers 는 여전히 금지다(Oracle 컨테이너 하나만 예외).

## 3. 규율

- 자기 레인 소유 파일만 고친다. 금지 파일은 먼저 조정 세션에 묻는다.
- 공용 파일 소유: `src/backend/gradle/libs.versions.toml`·`build-logic/**`·`be-run.*` 는 ora-base. 각 모듈 `lib/build.gradle` 은 base 머지(b1) 전에는 ora-base, 뒤에는 그 모듈 레인.
- **삭제하지 않는다.** 걷어낼 파일은 사용자 승인 전까지 `archive/` 로 `git mv` 하고 빌드·시험 대상에서 뺀다. 승인 목록은 조정자가 알린다.
- 동작이 바뀌는 수정은 `fix(...)` 커밋으로 따로 둔다. Conventional Commits.
- 다른 조정 회차(notice-fill2)가 같은 dev 에 SQLite 기반 작업을 머지하고 있다. 머지 요청 직전 dev 최신을 합치고, 그쪽이 넣은 새 SQLite 마이그레이션·엔티티 컬럼이 있으면 기준선에 반영한다.

## 4. 머지 절차

1. 머지 순서(의존):
   - ① ora-base 기반(b1~b4·b6): 추가만 하고 기존 동작은 그대로. **단독 먼저.**
   - ② ora-mdm 전환(m1~m5, b5 적재기 뒤)
   - ③ mcm 묶음: ora-mcm-core → ora-mcm-app 을 같은 창에서 연속 머지
   - ④ ora-platform(p1~p6, ②·③ 뒤)
   - ⑤ ora-base 문서·잔재 정리(b7·b8) → 마감 z1
   - 스파이크에서 mcm-core 가 mdm·mls 런타임에서 DB 를 쓴다고 나오면 ②와 ③을 같은 창으로 합친다(조정자가 알린다).
2. 머지 직전 `dev` 최신을 합치고 바뀐 모듈 전체 시험을 다시 돌린다. 기준선은 dev 최신 스키마로 다시 생성·대조한다.
3. `머지 요청: 세션 이름 / 원본 브랜치 / 대상 dev / 커밋 수·변경 요약 / 겹칠 수 있는 파일·모듈 / 머지 전 시험 결과 / 대상 SHA / 남은 백그라운드 0` 을 보낸다.
4. 「머지 허가」 뒤에만 메인 저장소에서 `--no-ff` 로 머지한다. `머지 완료: 머지 커밋 / 트리 / 머지 뒤 시험` 을 보낸다.
5. 워크트리 정리(`git worktree remove`, `git branch -d`. `--force`·`-D` 금지) 뒤 `정리 완료` 를 보낸다.
6. 레인은 push 하지 않는다. push·반영 빌드·서버 재기동은 조정자 몫이다.

## 5. 보고

- 항목마다: `진행 보고: 항목 / 커밋 / 시험 결과 / 진도율 N% / 다음 항목`, 첫 줄에 지시 번호.
- 정본 메모: `docs/oracle-1007/memo-<레인>.md`(자기 브랜치). 지금 상태·남은 순서·결정·조정 세션·다음 단계를 유지한다. 「정본 갱신 요청」 에는 `정본 갱신 완료: 경로 / 남은 일 3줄` 로 답한다.
- 시험 시간(SQLite·H2 대비 Oracle)은 전후 수치를 `docs/oracle-1007/perf-<레인>.md` 에 남긴다. 이 PC 는 편차가 크므로 반복 측정 없이 결론 내지 않는다.

## 6. 참고

- 로컬 Oracle 가이드: `docs/guide/Database/oracle-26ai-test-guide.md`
- 이관 도구: `archive/oracle-1007/tools/oracle-free/sqlite_to_oracle.py`·`load_snapshot.py`(b8 에서 archive 로 옮김, 현행 이관은 `scripts/db-snapshot/snapshot.py`)
- 조사 결과 요지: mdm main 38파일·mcm 18·mcm-core 25 파일에 SQLite 전용 코드, JPA nativeQuery 14건, `''` 비교 55건, `@GeneratedValue` IDENTITY/SEQUENCE 19곳, mcm 은 Flyway 꺼짐·`ddl-auto update`·Java DDL(`SchemaArtifacts*`), 평평한 폴더(mls V1~V4·mpp·mqc·mpn·aps-core·mcm V1) 마이그레이션도 SQLite 문법.
