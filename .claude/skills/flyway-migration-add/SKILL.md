---
name: flyway-migration-add
description: "Flyway 마이그레이션(Oracle 하나)을 추가할 때 스키마(위치) 폴더별 다음 번호를 채번하고 V 파일을 스캐폴딩합니다. aps-core·mcm-core·mdm·mls 등 모듈의 스키마를 바꿀 때(엔티티·컬럼·인덱스·제약 추가/변경) 사용합니다. 이미 머지된 V 파일은 주석 한 줄도 고치면 체크섬이 바뀌므로 변경은 항상 새 번호로 추가합니다."
---

# Flyway 마이그레이션 추가 (dmes-standard, Oracle)

정본 규칙: 이 문서. DB 는 **Oracle 하나**(로컬·시험·운영, oracle-1007)라 방언 폴더 짝과 방언 간 번호 일치는 없다. SQL 작성 규칙은 [Oracle SQL 작성 규칙](../../../docs/guide/Database/oracle-sql-rules.md), 스키마 소유·연결 규약은 [`schema-owners.md`](../../../docs/oracle-1007/schema-owners.md).

핵심 규칙 세 가지:

1. **Flyway 이력은 스키마(위치)마다 독립이다.** 번호는 그 위치(폴더) 최대 번호 + 1 이다. 다른 위치의 번호와 맞출 필요가 없다.
2. **이미 머지된 V 파일은 고치지 않는다.** V1 baseline 도 같다. 머리 주석 한 줄, 공백 하나도 Flyway 체크섬을 바꿔 이미 적용한 DB 에서 검증 실패(`Migration checksum mismatch`)가 난다. 변경은 V2 이상을 새로 추가한다. 머지 전(아직 어느 DB 에도 적용 안 된) 파일만 고칠 수 있다.
3. **스키마마다 주인 앱이 하나다.** 그 스키마의 V 파일은 그 앱(모듈)이 소유한다(`docs/oracle-1007/schema-owners.md`). 다른 모듈의 스키마 V 파일을 고치지 않는다.

## 1. 위치 구성

스키마 하나가 폴더 하나다. 실제 모양은 모듈마다 조금 다르다.

| 모양 | 예 |
|---|---|
| `db/migration/oracle/<스키마>/` | mcm-core: `oracle/mcmapuser/`·`mcaapuser/`·`mcm_source/`·`mcm_backup/` |
| `db/migration/<모듈>/oracle/` | mdm |
| `db/migration/<스키마 사용자>/` | caravan-hub: `caravanuser/`·`ifuser/` |
| `db/migration/<모듈>/` | aps-core·mls·mpn·mpp·mqc(방언 폴더 없이 모듈 이름 폴더) |

도구는 `sqlite`·`mssql`·`postgresql`·`h2` 같은 옛 방언 폴더와 SQLite 문법(`AUTOINCREMENT`·`PRAGMA`)이 든 체인 폴더를 **무시**하고 경고만 한다(`archive/` 로 옮길 대상). `archive/` 아래도 보지 않는다.

## 2. 채번

```bash
node .claude/skills/flyway-migration-add/scripts/migration_tool.mjs status --module mcm-core
```

`--module` 은 `src/backend/{모듈}/…/db/migration` 또는 `src/backend/{모듈}/api/…/db/migration` 을 찾는다. 출력은 위치마다 스키마·파일 수·최대 번호·**다음 번호**다. 번호는 위치별로 따로 센다(예: `mcmapuser` 가 V3 까지 있어도 `mcaapuser` 의 다음은 V2).

## 3. 스캐폴딩

```bash
node .claude/skills/flyway-migration-add/scripts/migration_tool.mjs scaffold --module mcm-core --location mcmapuser --slug add_foo_column --title "foo 컬럼 추가"
```

- 위치가 하나뿐이면 `--location` 을 생략한다. 여러 개면 위치 폴더 이름(`mcmapuser`) 또는 경로 끝(`oracle/mcmapuser`)을 준다. 모르면 `status` 로 확인한다.
- 만들어지는 파일 `V<다음번호>__<slug>.sql` 의 머리에는 대상 스키마, 위치, Oracle 규약 체크 목록, V1 불변 안내가 들어간다. 배경을 채우고 체크 목록은 지운다.
- `--dialect` 는 호환용이다. 방언은 Oracle 하나라 `oracle` 만 받는다.
- 새 스키마·모듈을 시작할 때의 V1 baseline 은 이 도구가 만들지 않는다. 스키마 소유표에 먼저 등재하고 위 위치 모양 중 하나로 `V1__baseline.sql` 을 직접 쓴다(`pdb.mjs template-schema` 가 찾을 수 있는 위치여야 한다: `node scripts/oracle/pdb.mjs migrations`).

## 4. Oracle 로 쓸 때의 규약과 함정

[Oracle SQL 작성 규칙](../../../docs/guide/Database/oracle-sql-rules.md) §2 가 정본이다. V 파일에서 특히 자주 틀리는 것:

- **식별자는 따옴표·백틱 없이 대문자**. 엔티티 `@Column(name = "`OFFSET`")` 처럼 백틱을 쓰면 Hibernate 가 소문자 따옴표로 내보내 `ORA-00904` 가 나고 `ddl-auto=validate` 로는 잡히지 않는다. 예약어가 아니면 백틱을 뺀다.
- **`''` 는 NULL** 이다: `NOT NULL DEFAULT ''` 를 쓰지 않는다. 문자열은 `VARCHAR2(n CHAR)`.
- **boolean 은 `NUMBER(1,0)` + `CHECK (… IN (0,1))`**(앱은 `preferred_boolean_jdbc_type: TINYINT`).
- **날짜·시각 형은 담는 값에 맞춘다**(규칙은 [Oracle SQL 작성 규칙](../../../docs/guide/Database/oracle-sql-rules.md) §2 「날짜·시각 형」): 날짜만(일자)은 `VARCHAR2(8 CHAR)` 에 `YYYYMMDD` 8자리 글자, 시각까지(초 단위)는 `DATE`, 초보다 자세한 시각은 `TIMESTAMP(6)`(KST 로 저장, 앱 JVM 은 `Asia/Seoul`).
- **IDENTITY `BY DEFAULT ON NULL` 은 명시한 ID 를 따라가지 않는다**: 시험·골든에서 명시 ID 와 자동 ID 를 섞으면 번호가 어긋나거나 `ORA-00001`.
- **DDL 은 자동 커밋**: 파일 하나가 중간에 실패하면 앞부분만 적용된 채 남는다. 파일을 작게 나누고 재실행에 안전하게 쓴다.
- 운영 Oracle 은 23 미만일 수 있다: `BOOLEAN` 열, `IF [NOT] EXISTS` DDL 같은 23ai 전용 구문을 쓰지 않는다.
- V 파일의 뷰·인덱스 정의와 앱 SQL 의 조건은 **칼럼 쪽에 함수·형변환을 씌우지 않는다**(`TO_CHAR(칼럼,…) >= :d` 금지 → `칼럼 >= TO_DATE(:d,…)`). 함수 기반 인덱스가 정말 필요하면 DBA 와 합의한다. 규칙은 [Oracle SQL 작성 규칙의 「인덱스를 살리는 조건(sargable)」](../../../docs/guide/Database/oracle-sql-rules.md#인덱스를-살리는-조건sargable).
- V 파일에 조회문(뷰 정의·시드 SELECT 등)을 쓸 때와 이 스킬의 SQL 예시는 [쿼리 서식](../../../docs/guide/Database/oracle-sql-rules.md#4-쿼리-서식)을 따른다(대문자, 절 키워드 맨 앞 열·본문 7번째 열, 항목은 앞 쉼표, 조인은 쉼표 조인과 `(+)`, 칼럼 별칭 `AS` 는 선택·표 별칭은 `AS` 불가). 기존 V 파일은 서식 때문에 고치지 않는다(체크섬).
- 자리표시자 `${app_user}`(= `MCMAPUSER`)는 `pdb.mjs template-schema` 와 앱 Flyway 가 풀어 준다. 새 자리표시자를 쓰면 양쪽에 같이 등록한다.

## 5. 작성 후 검증

모듈의 시험을 Oracle 하니스로 돌린다(PC 전체에서 하나씩, 무거운 작업은 `heavy.sh` 를 거친다).

```bash
# 모듈 폴더(src/backend/<모듈>)에서. JDK 21 이 JAVA_HOME 으로 잡혀 있어야 한다. 시험 PDB 는 하니스가 템플릿에서 복제·삭제한다.
# Gradle 경로는 모듈 구조에 따라 :api:test(mdm·mls 등) 또는 :test(mcm-core·aps-core) 다.
DFLOW_HEAVY_WAIT=1800 ../../../.claude/skills/dflow-dev/scripts/heavy.sh ../gradlew :api:test -Pdmes.ora.test=clone
```

- 템플릿(`TPL_SCHEMA`)은 dev 의 모든 모듈 V 파일을 적용한 것이다. 새 V 파일이 템플릿에 들어가려면 dev 에 머지된 뒤 `node scripts/oracle/pdb.mjs template-schema --rebuild` 가 필요하다. 머지 전에는 레인 PDB 에서 앱을 기동해(앱 Flyway 가 새 V 파일을 적용한다) 확인한다.
- 사용법·PC 잠금·오류 판별(VM 때문인지 코드 때문인지)은 [`scripts/oracle/README.md`](../../../scripts/oracle/README.md) 와 [`oracle-26ai-test-guide.md`](../../../docs/guide/Database/oracle-26ai-test-guide.md).
- 운영·개발계(WildFly)는 앱 Flyway 가 꺼져 있다. DBA 가 같은 V 파일을 순서대로 적용한다.

## 6. 도구 자체 검증

```bash
node .claude/skills/flyway-migration-add/scripts/selftest.mjs
```

도구를 고쳤으면 반드시 다시 돌린다. 임시 픽스처로 mcm-core(스키마 폴더 4개)·mdm(`oracle/` + 옛 sqlite)·caravan-hub(스키마 폴더)·aps-core(모듈 이름 폴더)·SQLite 체인 폴더 모양을 만들어 채번과 무시 규칙을 확인한다. 실 저장소는 건드리지 않는다.

도구는 node 18.17 이상만 있으면 윈도우·macOS 어디서든 돈다(python 불필요). 생성 파일의 줄끝은 항상 LF 다. 방언 여럿 시절의 python 동등성 시험(골든)은 `archive/` 로 옮겼고 더 쓰지 않는다.
