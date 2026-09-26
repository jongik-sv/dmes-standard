# docs/mdm/erd — 영역별 DB(ERD) 설계 산출물 (TSK-02-03)

> 정본: [`docs/mdm/tasks/TSK-02-03/design.md`](../tasks/TSK-02-03/design.md). 명명·감사칼럼·방언 규칙은 [`docs/mdm/naming-dialect-rules.md`](../naming-dialect-rules.md).
> 이 디렉터리는 **ERD·DDL 초안**이다. 실제 마이그레이션(Flyway)은 각 영역 계약 Task 가 만든다.
> 운영 DB 는 미정이다(로컬·테스트는 SQLite) — [ADR-0004](../adr/0004-drop-mssql-production-assumption.md). 이 디렉터리의 DDL 은 SQLite 한 벌이다.

## 파일 목록

| 영역 | ERD(Mermaid) | SQLite DDL |
|---|---|---|
| 02 (dma) 용어·도메인·컬럼 | `02-term-domain-column.mmd` | `02-term-domain-column.sqlite.sql` |
| 03 (dmb) 인터페이스 레이아웃 | `03-interface-layout.mmd` | `03-interface-layout.sqlite.sql` |
| 04 (dmc) 마스터코드 | `04-master-code.mmd` | `04-master-code.sqlite.sql` |
| 05 (dmd) 마스터데이터 | `05-master-data.mmd` | `05-master-data.sqlite.sql` |
| 06 (dme) 업무기준(룰) | `06-business-rule.mmd` | `06-business-rule.sqlite.sql` |

검증 스크립트: `verify/Verify.java`(JDK 21 단일 파일) · `verify/expected-columns.json` · `verify/fixtures/*.sql`.

## 적용 순서

**SQLite**(전제 조건 fixture 먼저): `verify/fixtures/00-system.sql` → `02-*.sqlite.sql` → `03-*.sqlite.sql` → `04-*.sqlite.sql` → `05-*.sqlite.sql` → `06-*.sqlite.sql`. SQLite 는 FK 강제가 DML 시점이라 이 순서를 지키지 않아도 대부분 동작하지만(F19), 위 순서를 정본으로 한다.

## 전제 조건 — `TB_MDM_SYSTEM`

`TB_MDM_SYSTEM`(`system_code` PK, `system_name`, `self_yn`)은 **TSK-01-02 소유**이며 이 Task 가 만들지 않는다(design.md F2). 영역 계약 Task 는 전부 TSK-01-02 에 의존하므로(wbs 의존 순서) 마이그레이션 시점엔 이미 존재한다는 전제로, 원천이 FK 로 적은 자리(`system_code`/`source_system`/`snd_system`/`rcv_system` 등)에 인라인 FK 를 걸었다. `system_code` 타입은 계약이 아직 없어 `CD20`(`VARCHAR(20)`)을 가정으로 둔다 — 계약이 확정되면 그 타입에 맞춰 이 문서와 DDL 을 갱신해야 한다.

검증용 `TB_MDM_SYSTEM` 은 `verify/fixtures/00-system.sql` 이 최소 모양(계약 없이 흉내)으로 만든다 — 실제 계약과 다를 수 있다.

## 보류 테이블

아래 테이블은 **DDL 은 있지만 코드(엔티티·리포지토리·서비스·BPMN·화면)가 없다**(TRD 가정 T4, decisions.md D-019). "코드 없음"이지 "테이블 없음"이 아니다. ERD 에는 엔티티 라벨에 `(보류)`로 표시했다.

- 배포 대상 보류(`*_SYSTEM`, `TB_MDM_COLUMN_SYSTEM` 제외): `TB_MDM_CODE_SYSTEM`·`TB_MDM_DATA_SYSTEM`·`TB_MDM_RULE_SYSTEM`
- 배포 순번 보류: `TB_MDM_DICT_SEQ`(02, 감사 9칼럼 예외 — 두지 않음)·`TB_MDM_DICT_SYSTEM`(02)
- 수신 로그 보류: `TB_MDM_CODE_RECV`(04)·`TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM`(05)·`TB_MDM_RULE_RECV`(06)

## 검증 스크립트 실행 방법

```bash
JDK=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
JAR=${SQLITE_JDBC_JAR:-/Users/jji/.gradle/caches/modules-2/files-2.1/org.xerial/sqlite-jdbc/3.45.3.0/6ae68e5fbf0d184c2f8191818fbe66e4dd70e14/sqlite-jdbc-3.45.3.0.jar}
SLF4J=${SLF4J_API_JAR:-/Users/jji/.gradle/wrapper/dists/gradle-8.14.3-bin/cv11ve7ro1n3o1j4so8xd9n66/gradle-8.14.3/lib/slf4j-api-1.7.36.jar}
"$JDK/bin/java" -cp "$JAR:$SLF4J" docs/mdm/erd/verify/Verify.java all   # 또는 개별 체크 id(a~j)
```

체크마다 `File.createTempFile("mdm-verify-", ".db")` 로 새 임시 DB 를 만들어 쓰고 끝나면 지운다. 리포의 실제 `data/mdm.db` 는 절대 열지 않는다. `PRAGMA foreign_keys=ON` 을 연결마다 켠다. 실측에 쓴 `sqlite_version()` 은 `3.45.3`(sqlite-jdbc 3.45.3.0 번들, CLI `sqlite3`(3.50.x)와 다르다 — design.md F5 대로 jar 를 직접 썼다).

체크 j(`gradlew testAll`)는 backend 전체 회귀라 몇 분 걸린다. 개별 체크(a~i)는 각각 수 초 안에 끝난다.

## 체크별 요지 (design.md §3 a~j)

- **a** 전체 DDL 적용 후 `TB_MDM_%` 테이블 35개(34 Task 테이블 + `TB_MDM_SYSTEM` fixture 1) 확인.
- **b** SQLite DDL 파일을 정규식으로 파싱해 제약·인덱스 이름이 전역에서 유일한지 확인.
- **c** `expected-columns.json` 과 적용된 SQLite 스키마 칼럼 목록 대조(대소문자 무시).
- **d** 모든 FK 의 부모 테이블이 `TB_MDM_%` 접두인지, 부모 칼럼이 실제 PK 이거나 비부분 UNIQUE 인덱스인지 확인.
- **e** 34 Task 테이블 중 `TB_MDM_DICT_SEQ` 를 뺀 **33개**에 감사 칼럼(또는 `AUD_VER` 변형)과 타입이 정확한지 확인. **design.md 원문의 "35개 중 DICT_SEQ 제외 34개"는 `TB_MDM_SYSTEM` fixture(이 Task 비소유, F2)를 포함한 계산이라 부정확하다 — 이 문서와 `Verify.java` 는 33/33 으로 바로잡았다.**
- **f** `chg_seq DEFAULT 0` 7개 테이블·`last_chg_seq DEFAULT 0` 3개 테이블(distinct 9)·`TB_MDM_DICT_SEQ` 초기 행 확인.
- **g** #2 AUTOINCREMENT 연속성(삭제된 최댓값 재사용 안 함) · #3 JSON CHECK 거부/NULL 통과 · #4 `json_each` 0-based · #5 `json_extract` · #19 코드 대소문자 구분 · #20 부분 UNIQUE 인덱스(behavior + `PRAGMA index_list.partial=1` 구조 확인 + `RULE_VAR` COND/RESULT 거동)를 실측.
- **h** `RULE_ROW.cells`→`RULE_VAR.var_id`, `RULE_SET.rule_ids`→`TB_MDM_RULE` 참조 검사 쿼리가 댕글링 1건씩을 정확히 잡는지 확인.
- **i** 모든 제약·인덱스 이름이 `PK_/FK_/UX_/IX_/CK_` 접두·128자 이하·대문자·소속 테이블명 포함을 만족하는지, 이름 없는 제약이 없는지 정규식으로 확인.
- **j** `cd src/backend && gradlew testAll` 회귀(기준선 395 통과·실패 0).

## 알려진 이탈(design.md 대비)

1. **`AUD_VER` 개명**(decisions.md D-034): `TB_MDM_CODE_VER`·`TB_MDM_CODE_RECV`·`TB_MDM_RULE_VER`·`TB_MDM_RULE_VAR`·`TB_MDM_RULE_ROW`·`TB_MDM_RULE_RECV` 6개 테이블에서, design.md §6.0 감사 9칼럼의 `VER` 이 같은 테이블의 원천 업무 칼럼 `VER` 과 이름이 충돌해(`CREATE TABLE` 자체 불가) 감사 카운터만 `AUD_VER` 로 개명했다. 이 6개 테이블에 엔티티를 붙이는 후속 Task 는 `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))` 를 적용해야 한다.
2. **체크 e 산식 정정**: design.md 본문의 "35개 중 DICT_SEQ 제외 34개"를 33/33 으로 바로잡았다(위 "체크별 요지" 참조).

## 변이(mutation) 검증

Build 단계에서 design.md §5 불변 규칙·핵심 제약별로 의도적으로 틀린 DDL을 임시로 넣어 `Verify`가 실제로 FAIL을 내는지 확인한 뒤 원복했다(작업 디렉터리는 각 실행 뒤 원본으로 복원, git 이력에 남지 않음). 결과는 완료 보고 참조.
