# b0 스파이크 결과 (oracle-1007, 2026-10-07)

환경: MacBook Air M5(16GB), Podman VM 2GB·cpu 2, `oracle-26ai-free`(gvenzl slim-faststart 23.26.3), SGA 900M, NOARCHIVELOG, `local_undo=TRUE`, `db_create_file_dest` 비어 있음(OMF 꺼짐), `max_pdbs=18`.
시험 PDB 는 모두 지웠다(`SPK_*`·`TPL_SPIKE`·`L_SPIKE*`). 템플릿으로 남긴 PDB 는 없다.

## 0. 가장 중요한 결과: 동시에 열린 PDB 는 3개가 한계다

| 시점 | 열린 PDB | VM 가용 메모리 | 비고 |
|---|---|---|---|
| 기준 | FREEPDB1 | 177MB | 인스턴스 RSS 합 1.3GB |
| 템플릿 READ WRITE 열림 | 2 | 171MB | 열 때마다 늘지는 않는다 |
| 복제본 열림 | 2 | 132~151MB | |
| **FREEPDB1 + 템플릿(READ ONLY) + 복제본 2개** | **4** | **67~117MB, load 26→60** | 디스크 읽기 폭주, sqlplus 무응답 |

- 4개째(`SPK_C2`)를 여는 동안 VM 이 스래싱(시스템 CPU 97%, 가용 60~110MB)했고 9분 40초 뒤 서버 프로세스가 죽었다(`ORA-03113`).
  이어 PMON 이 **인스턴스를 종료**했다(alert 로그 `terminating the instance due to ORA error 822`, 16:25 KST). 컨테이너는 살아 있었고 `sqlplus / as sysdba` 의 `startup` 으로 복구했다(데이터 정상: MDM 42,889행·MCM 488행).
- 결론: **VM 2GB 에서는 동시에 열린 PDB 가 3개(FREEPDB1 + 템플릿 1 + 작업 1)를 넘으면 안 된다.** `pdb.mjs` 는 열린 PDB 상한(기본 3, `DMES_ORA_MAX_OPEN`)을 강제한다.
- PDB 를 하나 더 열 때 VM 가용 메모리가 크게 줄지는 않는다(177→171MB). 경계는 점진적 감소가 아니라 총량이 한계를 넘는 순간에 갑자기 온다. 다른 레인의 시험·서버가 같이 돌 때가 위험하므로 보수적으로 3 으로 둔다.
- VM 메모리를 3GB 로 올리는 안은 사용자가 보류했다(2GB 유지). 이 문서의 모든 수치와 도구 기본값은 2GB 기준이다.

## ① ARCHIVELOG 가 아닐 때 PDB 복제

- **된다.** 소스는 `READ ONLY` 로 연 템플릿 PDB 여야 한다. `file_name_convert=('/<소스>/','/<대상>/')` 으로 복제한다(OMF 가 꺼져 있어도 된다).
- 복제 흐름(도구 구현): 템플릿 `open read only` → `create pluggable database … from <TPL> file_name_convert` → 템플릿 `close` → 복제본 `open`. 동시에 열린 PDB 는 늘 FREEPDB1 포함 최대 3개다.
- `READ WRITE` 로 열린 FREEPDB1 에서 바로 복제(핫 클론)는 시험하지 않았다. 조정자 데이터가 들어 있고 NOARCHIVELOG 에서는 지원되지 않는다. 쓰지 않는다.
- 시드에서 만든 PDB 에는 `USERS` 테이블스페이스가 없어 `create tablespace users datafile '<경로>'` 를 직접 만들어야 한다(OMF 꺼짐 → 경로 필수, 없으면 `ORA-02236`). 도구가 처리한다.

## ② 복제 시간·디스크

| 작업 | 시간(편차 큼) |
|---|---|
| 시드에서 빈 PDB 생성 | 25초(부하 큼: 3분 28초까지) |
| 새 PDB 첫 open | 18~60초 |
| 빈 템플릿 → 복제 + open | 4초(복제만)~73초(복제·열기 합) |
| 데이터 117MB 템플릿 → 복제 + open | 40초 |
| 운영 이름 사용자 13명 생성(템플릿 만들 때 한 번) | 30초 |
| PDB 닫고 삭제(데이터 파일 포함) | 5~15초 |
| 템플릿 봉인(닫기→READ ONLY→닫기) | 약 27초 |

- 이 PC 는 편차가 매우 크다(같은 작업이 4초에서 73초). 반복 측정 없이 결론 내리지 않는다. 다른 레인이 인스턴스를 쓰는 동안에는 두세 배 느려진다.
- **디스크: 복제본은 파일을 통째로 복사한다(reflink 없음).** 빈 PDB 약 785MB, 117MB 데이터 PDB 약 885MB. 볼륨 40GB 에 여유 27GB 라 PDB 16개를 한꺼번에 두어도(약 14GB) 들어가지만, 쓰지 않는 레인 PDB 는 삭제한다.
- 삭제(`drop … including datafiles`)는 빈 폴더를 남긴다(해롭지 않다).

## ③ Free 판 한계

- 사용자 데이터 12GB 상한은 SYSTEM 을 제외한 사용자 표 공간 합계다. 빈 PDB 는 사용자 데이터가 거의 없고 117MB 데이터 PDB 를 여러 개 두어도 상한에 닿지 않는다.
- PDB 개수는 `max_pdbs=18` 이다. 동시에 열 수 있는 수는 위 §0 의 메모리 한계가 먼저 닿는다(개수 상한은 문제가 안 된다).

## ④ 복제 PDB 의 운영 이름 사용자

- `pdb.mjs users` 로 `MCMAPUSER`·`MCAAPUSER`·`MCM_SOURCE`·`MCM_BACKUP`·`CARAVANUSER`·`EAIUSER`·`IFUSER`·`MDMAPUSER`·`MLSAPUSER`·`MPPAPUSER`·`MQCAPUSER`·`MPNAPUSER`·`APSAPUSER` 13명을 만들고, 템플릿에서 복제한 PDB 에서 그대로 `MDMAPUSER/…@localhost/<PDB>` 로 접속·DDL 실행이 되는 것을 확인했다. 복제하면 사용자·표·데이터가 함께 따라온다.

## ⑤ mdm 엔티티 Hibernate `OracleDialect` validate

방법: `feat/ora-mdm` 의 `V1__baseline.sql`(e58deb7da)을 PDB 의 `MDMAPUSER` 에 적용(39표, 오류 없음, sqlplus 로 35초) → mdm 앱을 `spring.jpa.hibernate.ddl-auto=validate`·`OracleDialect`·`hibernate.type.preferred_instant_jdbc_type=TIMESTAMP`·`hibernate.jdbc.time_zone=UTC` 로 기동. Hibernate 는 첫 불일치에서 멈추므로, 같은 설정으로 엔티티가 기대하는 DDL 을 스크립트로 받아 V1 과 전부 대조했다.

- **Instant 감사 칸 조합은 문제없다.** 두 속성이 함께 적용된 채 `SessionFactory` 가 만들어졌고, 엔티티가 기대하는 `C_AT`·`U_AT` 는 `TIMESTAMP(9)`, V1 은 `TIMESTAMP(6)` 로 같은 종류라 validate 를 통과한다.
- 불일치 목록(전부 mdm 레인이 정리할 것):

| 구분 | 건수 | 내용 |
|---|---|---|
| BOOLEAN | 1 | `TB_MDM_COLUMN.REQUIRED`: V1 은 `NUMBER(1)`, 엔티티는 `boolean`. Hibernate 7 `OracleDialect` 는 Oracle 23 이상에서 `BOOLEAN` 을 기대하므로 V1 을 `BOOLEAN` 으로 바꾸거나 엔티티에 `@JdbcTypeCode(SqlTypes.TINYINT)` 를 준다. **첫 validate 오류가 이것이다.** |
| CLOB 열인데 엔티티는 문자열 | 14 | `BODY`·`BIZ_AST`·`STD_AST`·`TEST_CASES`·`SNAPSHOT_JSON`·`CELLS`·`INPUT_JSON`·`EXPECTED_JSON`·`FLOW_JSON`·`GRP_COND_AST`·`VAR_AST` 등. 엔티티에 `@Lob` 또는 `@JdbcTypeCode(SqlTypes.CLOB)` 가 없으면 validate 가 `wrong column type` 으로 실패한다. |
| 업무 일시 | 3 | `TB_MDM_DATA_CATE(_ITEM)`·`TB_MDM_DATA_ITEM.VALID_FROM`: V1 은 `TIMESTAMP(6)`, 엔티티는 `String`. 필드 타입을 `LocalDateTime` 으로 바꿔야 한다(또는 V1 을 `VARCHAR2`). |
| 숫자 정밀도 | 10 | `*.CHG_SEQ`·`LAST_CHG_SEQ`: V1 `NUMBER(10)`, 엔티티 `Long`(`NUMBER(19)`). Oracle 에서는 NUMERIC 계열을 같은 종류로 보아 validate 는 통과하지만 10자리를 넘으면 값이 넘친다. |
| NOT NULL | 1 | `TB_MDM_TERM.DEFINITION`: 엔티티는 not null, V1 은 NULL 허용(`''`=NULL 때문에 의도한 결정). 엔티티 쪽 제약을 풀어야 한다. |
| 표 없음 | 2 | `TB_SEC_CODE_GROUP`·`TB_SEC_CODE_ITEM`: §⑦ 참고 |

- 앱 기동은 그 뒤에도 `DefaultMdmDialectResolver` 가 `mdm 이 지원하지 않는 DB 입니다: Oracle` 로 실패한다(SQLite 전용 코드, ora-mdm m2~m5 가 제거).

## ⑥ mdm 시험 약 200개 조각의 시간 추정

- mdm 시험은 아직 Oracle 로 돌릴 수 없어(ora-mdm m1~m5 전) 벽시계는 재지 못했다. 측정한 구성 요소만 적는다:
  - Spring 컨텍스트 기동(JPA 팩토리 생성까지): 약 8초(JVM 시작 포함, Oracle 접속).
  - 시험 PDB 준비: 템플릿 복제 + 열기 4~75초, 시험 뒤 삭제 5~15초. **빌드 한 번에 한 번**(`OraTestPdbService`)이라 시험 조각 수와 무관하다.
  - V1 적용(1,073줄): sqlplus 35초(템플릿에서 한 번만 한다. 시험은 복제본이 이미 마이그레이션된 상태로 시작한다).
- 컨텍스트 캐시가 조각 사이에 재사용되는지에 따라 달라지므로 ora-mdm 의 m1 기준선 뒤에 `perf-ora-mdm.md` 에 전후 수치를 적는다.

## ⑦ mcm-core 자동 구성이 mdm·mls 런타임에서 DB 를 쓰는가

- **쓴다.** mdm 은 `mcm-core` 를 includeBuild 로 포함하고, cactus-core 의 `MasterCodeJpaAutoConfiguration`(`MasterCodeGroupEntity` 등)·mcm-core 의 `SecCodeGroup` 이 mdm 의 JPA 엔티티 스캔에 들어온다. 그래서 엔티티가 기대하는 `TB_SEC_CODE_GROUP`·`TB_SEC_CODE_ITEM` 이 `MDMAPUSER` 에 없으면 validate 가 실패한다(V1 에는 이 두 표가 없다).
- 따라서 조정자의 결정대로 **ora-mdm(②)과 mcm 묶음(③)은 같은 창으로 머지**해야 한다. mls 도 같은 구조이므로 ora-platform 에서 같은 확인이 필요하다.

## 이 결과가 도구·하니스에 반영된 곳

- `scripts/oracle/pdb.mjs`: 열린 PDB 상한 3 강제(자리가 날 때까지 대기), PC 전체 잠금, 복제 때만 템플릿을 잠깐 열기, 시험·레인 PDB 접두 규칙(`TPL_`·`L_`·`T_`).
- `build-logic` `OraTestPdbService`: 빌드 한 번에 한 번 복제, 빌드 종료에서 삭제, forks=1.
- 운영 규칙: 시험 PDB 는 복제 → 시험 → 즉시 삭제(PC 전체에서 동시에 하나), 레인 개발 PDB 는 상주시키지 않고 쓸 때만 열고 끝나면 닫는다.
