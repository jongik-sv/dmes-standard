# mcm 공지사항: 테이블 설명·운영 DDL·이전 SQL

- 작성일: 2026-10-07
- 짝 문서: [`notice.dbml`](./notice.dbml) (dbdiagram.io 입력)
- 근거: `mcm/lib` 엔티티 `com.dongkuk.dmes.mcm.notice.entity.Notice`·`NoticeTarget` 과 mls Flyway `V2__create_notice.sql`·`V3__add_notice_format_category_pin.sql`·`V4__add_notice_target.sql` 을 합친 최종형
- 이전 기록: [DEC-001 「재검토 → 이전 (2026-10-07)」](../../ai-build-log/DEC-001_noticeMgmt-on-mls.md), 설계 [`2026-10-07-notice-to-mcm-design.md`](../../superpowers/specs/2026-10-07-notice-to-mcm-design.md)
- 기능설계서: [`design/noticeMgmt/noticeMgmt_기능설계서.md`](../design/noticeMgmt/noticeMgmt_기능설계서.md)

공지사항은 2026-10-07 에 mls 모듈에서 mcm 모듈로 옮겼다. 포털 홈 공지 위젯과 긴급 공지 띠가 `noticeBoard` 를 부르는 포털 공통 기능이 되어, 물류 모듈(mls) 없이도 동작해야 했기 때문이다.
화면 ID 와 메뉴 폴더는 `lsh/noticeMgmt` 를 그대로 쓰고, pageId 만 `mls:lsh/noticeMgmt` 에서 `mcm:lsh/noticeMgmt` 로 바뀌었다.

## 한 눈에

| 테이블 | 한 줄 역할 | 소유 화면·서비스 |
|---|---|---|
| `MCMAPUSER.TB_MCM_NOTICE` | 공지 본체(제목·본문·분류·상태·게시 기간·게시 대상 범위) | 공지 관리 `noticeMgmt`(search·save·changeStatus), 홈 공지 `noticeBoard`(search) |
| `MCMAPUSER.TB_MCM_NOTICE_TARGET` | 게시 대상이 `ROLE` 인 공지의 대상 역할 | 공지 관리 `noticeMgmt` 저장 때 지우고 다시 넣는다. 홈 조회가 읽는다 |

- API: `/api/mcm/oasis/noticeMgmt/{search,save,changeStatus}`, 홈 공지는 `/api/mcm/oasis/noticeBoard/search`(AUTH_ONLY)다.
- 코드 위치: Java 는 `mcm/lib` 의 `com.dongkuk.dmes.mcm.notice.{entity,repository,common,noticeMgmt,noticeBoard}`, BPMN 은 `mcm/api` 의 `src/main/resources/services/lsh/{noticeMgmt,noticeBoard}.bpmn` 이다.
- 두 테이블 모두 FK 제약이 없다(JPA 연관관계 금지). 역할을 지워도 공지 저장이 막히지 않아야 해서 `ROLE_ID` 도 논리 참조만 둔다.
- audit 9 컬럼(`C_USR_ID`·`C_AT`·`C_SVC_ID`·`C_PGM_ID`·`U_USR_ID`·`U_AT`·`U_SVC_ID`·`U_PGM_ID`·`VER`)은 `CactusAuditEntity` 가 소유하며 아래 칸 표에서 뺐다. 운영 DDL 에는 반드시 넣는다.
- 표는 Flyway 가 만든다(oracle-1007). 로컬·시험·운영 모두 Oracle 이고 DDL 정본은 mcm-core 의 `db/migration/oracle/mcmapuser/V1__baseline.sql` 이며 `ddl-auto` 는 `none` 이다. DB DEFAULT 에 기대지 않고 기본값은 엔티티 필드 초기값이 보장한다. (옛 로컬 SQLite 의 `ddl-auto: update` 는 없어졌다.)

## 1. `TB_MCM_NOTICE` 칸

| 칸 | 타입 | NULL | 기본값 | 설명 |
|---|---|---|---|---|
| `NOTICE_ID` | VARCHAR(30) | N | | PK. 서버 채번 `NT` + `yyyyMMdd` + 4자리 |
| `TITLE` | VARCHAR(200) | N | | 제목. 필수, 200자 이하 |
| `CONTENT` | 긴 글 | Y | | 본문. DB 길이 제한이 없고 서비스가 20만 자 상한을 검증한다(Oracle CLOB, PostgreSQL TEXT) |
| `CONTENT_FORMAT` | VARCHAR(10) | N | `TEXT` | 본문 형식. `TEXT`(일반 글) · `MD`(마크다운) · `HTML`(서버 소독 HTML) |
| `NOTICE_CATEGORY` | VARCHAR(10) | N | `NORMAL` | 분류. `NORMAL`(일반) · `MAINT`(점검) · `URGENT`(긴급) |
| `PIN_YN` | VARCHAR(1) | N | `N` | 홈 목록 상단 고정 `Y`/`N` |
| `TARGET_SCOPE` | VARCHAR(10) | N | `ALL` | 게시 대상. `ALL`(전체 사용자) · `ROLE`(`TB_MCM_NOTICE_TARGET` 에 적힌 역할만) |
| `NOTICE_STATUS` | VARCHAR(10) | N | | 게시상태. `DRAFT`(작성중) · `POSTED`(게시중) · `STOPPED`(게시중지) |
| `POST_START_DT` | DATE | Y | | 게시시작일 |
| `POST_END_DT` | DATE | Y | | 게시종료일 |

- PK: `NOTICE_ID`. 인덱스: `IX_TB_MCM_NOTICE_STATUS(NOTICE_STATUS)`.
- 상태 코드를 10자 이내 대문자로 둔 이유는 길이 1 문자열 칸의 빈 값이 `Character` 변환 오류를 내는 함정을 피하기 위해서다. `PIN_YN` 은 서비스가 `Y`/`N` 으로 정규화하므로 빈 문자열을 넣지 않는다.

## 2. `TB_MCM_NOTICE_TARGET` 칸

| 칸 | 타입 | NULL | 설명 |
|---|---|---|---|
| `NOTICE_ID` | VARCHAR(30) | N | PK 1. 공지번호(→ `TB_MCM_NOTICE`) |
| `ROLE_ID` | VARCHAR(100) | N | PK 2. 역할 ID(→ `TB_MCM_SEC_ROLE.ROLE_ID`, `ROLE_` 접두 없이 저장) |

- PK: (`NOTICE_ID`, `ROLE_ID`). 인덱스: `IX_TB_MCM_NOTICE_TARGET_ROLE(ROLE_ID)` 가 홈 조회의 「사용자 역할이 대상에 있는가」 `EXISTS` 를 받친다.
- 역할 그룹이 아니라 역할 단위인 이유: 서비스가 요청 시점에 아는 사용자 정보는 BFF 가 싣는 `X-Authenticated-Role`(역할 ID 목록)뿐이고 역할 그룹 ID 는 토큰과 헤더에 없기 때문이다.

## 3. 운영 DDL

`ddl-auto` 는 모든 환경에서 `none` 이다. 로컬·시험은 Flyway(mcm 앱 기동 또는 `pdb.mjs template-schema`)가 위 V1 을 적용하고, 개발계·운영계(WildFly)는 Flyway 를 끄므로 DBA 가 같은 V 파일을 앱 배포 전에 적용한다. 아래 DDL 은 칸 정의를 읽기 위한 참고 사본이고 자동 실행하지 않는다(정본은 V1).

- Oracle 문자열 칸은 `VARCHAR2(n CHAR)` 로 만든다. 서비스가 길이를 글자 수로 검사하므로 BYTE 단위면 한글 제목 등 `VARCHAR2` 칸이 ORA-12899 로 500 오류가 난다(`CONTENT` 는 CLOB 이라 해당 없음).
- Oracle 은 `DEFAULT` 를 `NOT NULL` 앞에 둔다.
- 스키마 이름은 환경에 맞게 바꾼다(아래는 mcm 관례인 `MCMAPUSER`).

### 3.1 Oracle

```sql
CREATE TABLE MCMAPUSER.TB_MCM_NOTICE (
    NOTICE_ID       VARCHAR2(30 CHAR)  NOT NULL,
    TITLE           VARCHAR2(200 CHAR) NOT NULL,
    CONTENT         CLOB,
    CONTENT_FORMAT  VARCHAR2(10 CHAR)  DEFAULT 'TEXT'   NOT NULL,
    NOTICE_CATEGORY VARCHAR2(10 CHAR)  DEFAULT 'NORMAL' NOT NULL,
    PIN_YN          VARCHAR2(1 CHAR)   DEFAULT 'N'      NOT NULL,
    TARGET_SCOPE    VARCHAR2(10 CHAR)  DEFAULT 'ALL'    NOT NULL,
    NOTICE_STATUS   VARCHAR2(10 CHAR)  NOT NULL,
    POST_START_DT   DATE,
    POST_END_DT     DATE,
    C_USR_ID        VARCHAR2(100 CHAR),
    C_AT            TIMESTAMP,
    C_SVC_ID        VARCHAR2(100 CHAR),
    C_PGM_ID        VARCHAR2(100 CHAR),
    U_USR_ID        VARCHAR2(100 CHAR),
    U_AT            TIMESTAMP,
    U_SVC_ID        VARCHAR2(100 CHAR),
    U_PGM_ID        VARCHAR2(100 CHAR),
    VER             NUMBER(19),
    CONSTRAINT PK_TB_MCM_NOTICE PRIMARY KEY (NOTICE_ID)
);

CREATE INDEX MCMAPUSER.IX_TB_MCM_NOTICE_STATUS ON MCMAPUSER.TB_MCM_NOTICE (NOTICE_STATUS);

CREATE TABLE MCMAPUSER.TB_MCM_NOTICE_TARGET (
    NOTICE_ID VARCHAR2(30 CHAR)  NOT NULL,
    ROLE_ID   VARCHAR2(100 CHAR) NOT NULL,
    C_USR_ID  VARCHAR2(100 CHAR),
    C_AT      TIMESTAMP,
    C_SVC_ID  VARCHAR2(100 CHAR),
    C_PGM_ID  VARCHAR2(100 CHAR),
    U_USR_ID  VARCHAR2(100 CHAR),
    U_AT      TIMESTAMP,
    U_SVC_ID  VARCHAR2(100 CHAR),
    U_PGM_ID  VARCHAR2(100 CHAR),
    VER       NUMBER(19),
    CONSTRAINT PK_TB_MCM_NOTICE_TARGET PRIMARY KEY (NOTICE_ID, ROLE_ID)
);

CREATE INDEX MCMAPUSER.IX_TB_MCM_NOTICE_TARGET_ROLE ON MCMAPUSER.TB_MCM_NOTICE_TARGET (ROLE_ID);
```

### 3.2 PostgreSQL

```sql
CREATE TABLE MCMAPUSER.TB_MCM_NOTICE (
    NOTICE_ID       VARCHAR(30)  NOT NULL,
    TITLE           VARCHAR(200) NOT NULL,
    CONTENT         TEXT,
    CONTENT_FORMAT  VARCHAR(10)  NOT NULL DEFAULT 'TEXT',
    NOTICE_CATEGORY VARCHAR(10)  NOT NULL DEFAULT 'NORMAL',
    PIN_YN          VARCHAR(1)   NOT NULL DEFAULT 'N',
    TARGET_SCOPE    VARCHAR(10)  NOT NULL DEFAULT 'ALL',
    NOTICE_STATUS   VARCHAR(10)  NOT NULL,
    POST_START_DT   DATE,
    POST_END_DT     DATE,
    C_USR_ID        VARCHAR(100),
    C_AT            TIMESTAMP,
    C_SVC_ID        VARCHAR(100),
    C_PGM_ID        VARCHAR(100),
    U_USR_ID        VARCHAR(100),
    U_AT            TIMESTAMP,
    U_SVC_ID        VARCHAR(100),
    U_PGM_ID        VARCHAR(100),
    VER             BIGINT,
    CONSTRAINT PK_TB_MCM_NOTICE PRIMARY KEY (NOTICE_ID)
);

CREATE INDEX IX_TB_MCM_NOTICE_STATUS ON MCMAPUSER.TB_MCM_NOTICE (NOTICE_STATUS);

CREATE TABLE MCMAPUSER.TB_MCM_NOTICE_TARGET (
    NOTICE_ID VARCHAR(30)  NOT NULL,
    ROLE_ID   VARCHAR(100) NOT NULL,
    C_USR_ID  VARCHAR(100),
    C_AT      TIMESTAMP,
    C_SVC_ID  VARCHAR(100),
    C_PGM_ID  VARCHAR(100),
    U_USR_ID  VARCHAR(100),
    U_AT      TIMESTAMP,
    U_SVC_ID  VARCHAR(100),
    U_PGM_ID  VARCHAR(100),
    VER       BIGINT,
    CONSTRAINT PK_TB_MCM_NOTICE_TARGET PRIMARY KEY (NOTICE_ID, ROLE_ID)
);

CREATE INDEX IX_TB_MCM_NOTICE_TARGET_ROLE ON MCMAPUSER.TB_MCM_NOTICE_TARGET (ROLE_ID);
```

PostgreSQL 은 따옴표 없는 식별자를 소문자로 접으므로 위 DDL 은 `mcmapuser.tb_mcm_notice` 로 만들어진다. 환경의 기존 mcm 테이블이 따옴표 대문자 이름이면 그 관례에 맞춘다.

## 4. 운영 데이터 이전 SQL 예시

로컬도 Oracle PDB 하나에 `MLSAPUSER`·`MCMAPUSER` 가 함께 있으므로 운영과 같은 SQL 로 옮긴다(`{MLS_SCHEMA}` = `MLSAPUSER`; 옛 SQLite 이관 스크립트 `scripts/data/notice-mls-to-mcm.mjs` 는 더 쓰지 않는다).
mls 스키마에 쌓인 공지가 있으면 아래처럼 `INSERT … SELECT … WHERE NOT EXISTS` 로 옮긴다. 이미 mcm 에 같은 `NOTICE_ID` 가 있으면 건너뛰고, mls 쪽 행은 지우지 않는다.

- `{MLS_SCHEMA}` 는 mls 의 `TB_MLS_NOTICE`·`TB_MLS_NOTICE_TARGET` 이 있는 스키마 이름으로 바꾼다.
- 같은 `NOTICE_ID` 가 mcm 에 먼저 있으면(채번 충돌) 그 공지의 본체는 건너뛰지만 2) 의 대상 역할은 붙을 수 있다. 실행 전에 아래 겹침 조회가 0건인지 확인하고, 있으면 사람이 판단한다.
- 이전 전에 3절의 DDL 을 먼저 실행한다.

```sql
-- 0) 겹침 확인(0건이어야 한다)
SELECT s.NOTICE_ID
  FROM {MLS_SCHEMA}.TB_MLS_NOTICE s
  JOIN MCMAPUSER.TB_MCM_NOTICE d ON d.NOTICE_ID = s.NOTICE_ID;

-- 1) 공지 본체
INSERT INTO MCMAPUSER.TB_MCM_NOTICE
    (NOTICE_ID, TITLE, CONTENT, CONTENT_FORMAT, NOTICE_CATEGORY, PIN_YN, TARGET_SCOPE, NOTICE_STATUS,
     POST_START_DT, POST_END_DT,
     C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
SELECT s.NOTICE_ID, s.TITLE, s.CONTENT, s.CONTENT_FORMAT, s.NOTICE_CATEGORY, s.PIN_YN, s.TARGET_SCOPE, s.NOTICE_STATUS,
       s.POST_START_DT, s.POST_END_DT,
       s.C_USR_ID, s.C_AT, s.C_SVC_ID, s.C_PGM_ID, s.U_USR_ID, s.U_AT, s.U_SVC_ID, s.U_PGM_ID, s.VER
  FROM {MLS_SCHEMA}.TB_MLS_NOTICE s
 WHERE NOT EXISTS (SELECT 1 FROM MCMAPUSER.TB_MCM_NOTICE d WHERE d.NOTICE_ID = s.NOTICE_ID);

-- 2) 게시 대상 역할
INSERT INTO MCMAPUSER.TB_MCM_NOTICE_TARGET
    (NOTICE_ID, ROLE_ID, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
SELECT t.NOTICE_ID, t.ROLE_ID, t.C_USR_ID, t.C_AT, t.C_SVC_ID, t.C_PGM_ID, t.U_USR_ID, t.U_AT, t.U_SVC_ID, t.U_PGM_ID, t.VER
  FROM {MLS_SCHEMA}.TB_MLS_NOTICE_TARGET t
 WHERE NOT EXISTS (SELECT 1 FROM MCMAPUSER.TB_MCM_NOTICE_TARGET d
                    WHERE d.NOTICE_ID = t.NOTICE_ID AND d.ROLE_ID = t.ROLE_ID);
```

mls 쪽 Flyway V2~V4 와 `TB_MLS_*` 행은 그대로 둔다. 이력이 빠지면 mls 기동 때 Flyway 검증이 실패하고, 행은 삭제하지 않기로 했기 때문이다.

## 5. 함께 옮긴 설정

- OBJECT `noticeMgmt`·`noticeBoard` 의 `SYSTEM_CODE` 는 `mcm` 이다(시드와 기존 DB 멱등 보정). 권한 키의 모듈이 `SYSTEM_CODE` 라서 보정이 없으면 403 이 난다.
- **개발·운영은 시드가 돌지 않는다**(`application-dev.yml`·`application-prod.yml` 의 `dmes.init.enabled=false`). 그래서 기동 시 보정도 돌지 않으므로 아래 UPDATE 를 직접 실행한다. 행은 지우지 않는다.

```sql
UPDATE MCMAPUSER.TB_MCM_SEC_OBJ
   SET SYSTEM_CODE = 'mcm'
 WHERE OBJECT_ID IN ('noticeMgmt', 'noticeBoard')
   AND LOWER(TRIM(SYSTEM_CODE)) = 'mls';
```

### 5.1 개발·운영 배포 순서

1. §3 DDL 로 `TB_MCM_NOTICE`·`TB_MCM_NOTICE_TARGET` 과 인덱스를 만든다. 앱이 먼저 나가면 기동은 되지만 홈 공지(`noticeBoard`)가 테이블이 없어 실패하고 「공지사항을 불러오지 못했습니다」가 뜬다.
2. 위 `SYSTEM_CODE` UPDATE 를 실행한다.
3. mcm 앱과 포털(BFF)을 배포한다. 권한 캐시는 BE 10분·BFF 60초 안에 새 키로 바뀌고, 재기동하면 바로 비워진다.
4. §4 이전 SQL 로 공지 행을 옮긴다(먼저 NOTICE_ID 겹침 조회가 0건인지 본다).
5. 홈 공지 위젯·긴급 공지 띠, 메뉴 「공통관리 > 공지관리 > 공지사항 관리」 진입을 확인한다.
- 식별자 사전 A.2.3: mcm 아래 그룹 `lsh`(공지관리)는 A.2.1 의 `cm?` 접두 규칙 예외로 유지한다([식별자 사전](../../guide/design/identifier-dictionary/01-modules-and-screens.md)).
