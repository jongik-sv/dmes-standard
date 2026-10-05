# 정시 수집 테이블 ERD·DDL (widget-data 레인, 항목 4)

2026-10-05. 계약은 [spec-widget-data.md](./spec-widget-data.md) §3 이다. 이 문서는 조정 세션이 아래 세 곳에 합칠 조각을 한 곳에 모은 것이다.
다른 문서 파일(`csa-menu.dbml`·`csa-menu-tables.md`)은 이 레인에서 고치지 않는다.

| 합칠 곳 | 조각 |
|---|---|
| `docs/mcm/erd/csa-menu.dbml` | §1 DBML 두 블록(`TB_MCM_EXCHANGE_RATE` 블록 바로 뒤)과 TableGroup 한 줄씩 |
| `docs/mcm/erd/csa-menu-tables.md` | §4 의 표 두 줄(§ 위젯 B·C·D 요약 표)과 설명 두 줄 |
| 개발계·운영계 DBA 전달 | §2 Oracle·§3 PostgreSQL DDL |

로컬(SQLite·H2)은 `ddl-auto` 로 엔티티(`widget/collect/entity/WidgetCollectRun`·`WidgetCollectData`)에서 저절로 생긴다. 개발계·운영계(`ddl-auto: none`)는 앱 배포 전에 아래 DDL 을 먼저 실행한다.

## 1. DBML 조각 (`csa-menu.dbml`)

`TB_MCM_EXCHANGE_RATE` 블록 뒤에 넣는다. `SLOT` 의 CHAR 는 `TB_MCM_EXCHANGE_RATE.RATE_DATE` 와 같은 방식이다(값이 늘 12자리로 꽉 차 방언 차이가 없다).

```dbml
// 정시 수집 위젯 (2026-10-05, 스펙 widget-data/spec-widget-data.md §3)
Table TB_MCM_WIDGET_COLLECT_RUN {
  WIDGET_ID  varchar(40)   [note: '→ TB_MCM_WIDGET_DEF (TYPE_ID=collect 정의)']
  SLOT       char(12)      [note: '수집 시각(서울) yyyyMMddHHmm']
  STATUS     varchar(4)    [not null, note: 'RUN · OK · FAIL']
  ITEM_CNT   integer       [note: '저장한 항목 수']
  MSG        varchar(200)  [note: '실패 사유(주소·인증값·DB 메시지 없음)']
  STARTED_AT timestamp     [note: '수집 시작(UTC 시각 값)']
  ENDED_AT   timestamp     [note: '수집 끝']

  indexes {
    (WIDGET_ID, SLOT) [pk]
    SLOT [name: 'IX_MCM_WCOL_RUN_SLOT', note: '90일 보관 삭제']
  }

  Note: '정시 수집 회차. 수집 시작 때 RUN 으로 먼저 insert 해 같은 정의·같은 분의 중복 수집을 막는다(PK 위반이면 건너뜀). 매일 03:30 에 90일 지난 행 삭제. 감사 컬럼 9개.'
}

Table TB_MCM_WIDGET_COLLECT_DATA {
  WIDGET_ID  varchar(40)    [note: '→ TB_MCM_WIDGET_COLLECT_RUN']
  SLOT       char(12)       [note: '수집 시각 yyyyMMddHHmm']
  ITEM_KEY   varchar(100)   [note: '항목 이름(SQL keyField 값·HTTP items.key·통화 코드, 단일 값은 VALUE)']
  VALUE_NUM  numeric(24,8)  [note: '숫자 값(숫자가 아니면 NULL)']
  VALUE_TXT  varchar(200)   [note: '글자 값(숫자면 NULL)']

  indexes {
    (WIDGET_ID, SLOT, ITEM_KEY) [pk]
    SLOT [name: 'IX_MCM_WCOL_DATA_SLOT', note: '90일 보관 삭제']
  }

  Note: '정시 수집 값. 한 회차에 항목 최대 50개. 위젯은 widgetData/run 으로 show.days 일 안의 값을 읽는다. 90일 보관. 감사 컬럼 9개.'
}
```

감사 칼럼 9개는 다른 블록과 같이 DBML 에는 적지 않고 Note 에만 언급한다(§2·§3 DDL 에는 모두 적었다).

TableGroup(위젯 그룹)에 두 줄을 더한다 — `TB_MCM_EXCHANGE_RATE` 바로 아래:

```dbml
  TB_MCM_WIDGET_COLLECT_RUN
  TB_MCM_WIDGET_COLLECT_DATA
```

참조선이 필요하면(다른 블록이 `Ref:` 를 쓰는 경우에만):

```dbml
Ref: TB_MCM_WIDGET_COLLECT_DATA.(WIDGET_ID, SLOT) > TB_MCM_WIDGET_COLLECT_RUN.(WIDGET_ID, SLOT)
```

DB 외래키(FK)는 두지 않는다 — 90일 삭제가 DATA 를 먼저·RUN 을 나중에 지우고, 정의가 삭제돼도 쌓인 값은 보관 기간 뒤에 지워지는 계약(스펙 §3)이라 정의·회차와 묶지 않는다. 위 `Ref` 는 문서용이다.

## 2. Oracle DDL

칸 타입은 엔티티와 같다(`String`→`VARCHAR2(n CHAR)`, `Instant`→`TIMESTAMP(6) WITH TIME ZONE`, `Long`→`NUMBER(19)`, 십진수→`NUMBER(p,s)`, `Integer`→`NUMBER(10)`). 감사 칸 9개는 `McmAuditEntity`(`C_USR_ID`·`C_AT`·`C_SVC_ID`·`C_PGM_ID`·`U_USR_ID`·`U_AT`·`U_SVC_ID`·`U_PGM_ID`·`VER`)이고 모두 NULL 허용이다.

```sql
CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_COLLECT_RUN (
    WIDGET_ID   VARCHAR2(40 CHAR)  NOT NULL,
    SLOT        CHAR(12 CHAR)      NOT NULL,
    STATUS      VARCHAR2(4 CHAR)   NOT NULL,
    ITEM_CNT    NUMBER(10),
    MSG         VARCHAR2(200 CHAR),
    STARTED_AT  TIMESTAMP(6) WITH TIME ZONE,
    ENDED_AT    TIMESTAMP(6) WITH TIME ZONE,
    C_USR_ID    VARCHAR2(100 CHAR),
    C_AT        TIMESTAMP(6) WITH TIME ZONE,
    C_SVC_ID    VARCHAR2(100 CHAR),
    C_PGM_ID    VARCHAR2(100 CHAR),
    U_USR_ID    VARCHAR2(100 CHAR),
    U_AT        TIMESTAMP(6) WITH TIME ZONE,
    U_SVC_ID    VARCHAR2(100 CHAR),
    U_PGM_ID    VARCHAR2(100 CHAR),
    VER         NUMBER(19),
    CONSTRAINT PK_MCM_WCOL_RUN PRIMARY KEY (WIDGET_ID, SLOT),
    CONSTRAINT CK_MCM_WCOL_RUN_STATUS CHECK (STATUS IN ('RUN', 'OK', 'FAIL'))
);

CREATE INDEX MCMAPUSER.IX_MCM_WCOL_RUN_SLOT ON MCMAPUSER.TB_MCM_WIDGET_COLLECT_RUN (SLOT);

CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_COLLECT_DATA (
    WIDGET_ID   VARCHAR2(40 CHAR)  NOT NULL,
    SLOT        CHAR(12 CHAR)      NOT NULL,
    ITEM_KEY    VARCHAR2(100 CHAR) NOT NULL,
    VALUE_NUM   NUMBER(24,8),
    VALUE_TXT   VARCHAR2(200 CHAR),
    C_USR_ID    VARCHAR2(100 CHAR),
    C_AT        TIMESTAMP(6) WITH TIME ZONE,
    C_SVC_ID    VARCHAR2(100 CHAR),
    C_PGM_ID    VARCHAR2(100 CHAR),
    U_USR_ID    VARCHAR2(100 CHAR),
    U_AT        TIMESTAMP(6) WITH TIME ZONE,
    U_SVC_ID    VARCHAR2(100 CHAR),
    U_PGM_ID    VARCHAR2(100 CHAR),
    VER         NUMBER(19),
    CONSTRAINT PK_MCM_WCOL_DATA PRIMARY KEY (WIDGET_ID, SLOT, ITEM_KEY)
);

CREATE INDEX MCMAPUSER.IX_MCM_WCOL_DATA_SLOT ON MCMAPUSER.TB_MCM_WIDGET_COLLECT_DATA (SLOT);
```

- 제약·인덱스 이름은 Oracle 12.1 이하의 30자 제한 안으로 줄였다.
- `CHECK (STATUS …)` 는 엔티티에는 없는 보강이다(저장하는 값은 `RUN`·`OK`·`FAIL` 뿐). 운영 정책상 CHECK 를 쓰지 않으면 빼도 된다.
- 읽기 질의(`WIDGET_ID` 로 거르고 `SLOT` 순)는 PK 인덱스로, 90일 삭제(`SLOT < :기준`)는 `IX_MCM_WCOL_*_SLOT` 으로 탄다.

## 3. PostgreSQL DDL

```sql
CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_COLLECT_RUN (
    WIDGET_ID   varchar(40)  NOT NULL,
    SLOT        char(12)     NOT NULL,
    STATUS      varchar(4)   NOT NULL,
    ITEM_CNT    integer,
    MSG         varchar(200),
    STARTED_AT  timestamp(6) with time zone,
    ENDED_AT    timestamp(6) with time zone,
    C_USR_ID    varchar(100),
    C_AT        timestamp(6) with time zone,
    C_SVC_ID    varchar(100),
    C_PGM_ID    varchar(100),
    U_USR_ID    varchar(100),
    U_AT        timestamp(6) with time zone,
    U_SVC_ID    varchar(100),
    U_PGM_ID    varchar(100),
    VER         bigint,
    CONSTRAINT PK_MCM_WCOL_RUN PRIMARY KEY (WIDGET_ID, SLOT),
    CONSTRAINT CK_MCM_WCOL_RUN_STATUS CHECK (STATUS IN ('RUN', 'OK', 'FAIL'))
);

CREATE INDEX IX_MCM_WCOL_RUN_SLOT ON MCMAPUSER.TB_MCM_WIDGET_COLLECT_RUN (SLOT);

CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_COLLECT_DATA (
    WIDGET_ID   varchar(40)   NOT NULL,
    SLOT        char(12)      NOT NULL,
    ITEM_KEY    varchar(100)  NOT NULL,
    VALUE_NUM   numeric(24,8),
    VALUE_TXT   varchar(200),
    C_USR_ID    varchar(100),
    C_AT        timestamp(6) with time zone,
    C_SVC_ID    varchar(100),
    C_PGM_ID    varchar(100),
    U_USR_ID    varchar(100),
    U_AT        timestamp(6) with time zone,
    U_SVC_ID    varchar(100),
    U_PGM_ID    varchar(100),
    VER         bigint,
    CONSTRAINT PK_MCM_WCOL_DATA PRIMARY KEY (WIDGET_ID, SLOT, ITEM_KEY)
);

CREATE INDEX IX_MCM_WCOL_DATA_SLOT ON MCMAPUSER.TB_MCM_WIDGET_COLLECT_DATA (SLOT);
```

- PostgreSQL 은 인덱스가 표와 같은 스키마에 만들어지므로 `CREATE INDEX` 에 스키마 접두를 붙이지 않는다.
- PostgreSQL 의 식별자는 따옴표 없이 쓰면 소문자로 접히며, 엔티티의 칸·표 이름도 따옴표 없이 읽히므로 위 대문자 표기를 그대로 써도 된다(기존 `TB_MCM_EXCHANGE_RATE` 와 같다).
- 엔티티는 `SLOT` 을 `String`(길이 12)으로 매핑한다. 로컬 `ddl-auto` 는 `varchar(12)` 를 만들고 운영 DDL 은 `char(12)` 이지만, 값이 늘 `yyyyMMddHHmm` 12자리라 같은 결과다(`TB_MCM_EXCHANGE_RATE.RATE_DATE` 와 같다).

## 4. `csa-menu-tables.md` 조각

요약 표(§ 위젯 B·C·D, `TB_MCM_EXCHANGE_RATE` 행 아래)에 두 줄:

```markdown
| `TB_MCM_WIDGET_COLLECT_RUN` | 정시 수집 회차(중복 수집 방지) | 신규(2026-10-05) | 정시 수집 위젯(자동 적재) |
| `TB_MCM_WIDGET_COLLECT_DATA` | 정시 수집 값(90일 보관) | 신규(2026-10-05) | 정시 수집 위젯(자동 적재) |
```

설명 목록(`TB_MCM_EXCHANGE_RATE` 항목 아래)에 두 줄. 제목 「테이블 6개」는 8개로 고친다.

```markdown
- **`TB_MCM_WIDGET_COLLECT_RUN`**: 정시 수집 회차. `TB_MCM_WIDGET_DEF` 의 `TYPE_ID='collect'` 정의를 mcm-core 수집기가 매분 0초에 읽어 이번 분이 수집 시각인 정의만 수집한다. PK = (`WIDGET_ID`, `SLOT`) 이고 `SLOT` 은 서울 시각 `yyyyMMddHHmm` 이다. 수집을 시작할 때 `STATUS='RUN'` 으로 먼저 insert 해 같은 정의·같은 분의 중복 수집을 막고(PK 위반이면 건너뜀), 끝나면 `OK`·`FAIL`(`MSG` 에 사유)로 바꾼다. 죽어서 `RUN` 으로 남은 회차는 다음 `SLOT` 을 막지 않는다.
- **`TB_MCM_WIDGET_COLLECT_DATA`**: 정시 수집 값. PK = (`WIDGET_ID`, `SLOT`, `ITEM_KEY`), 숫자는 `VALUE_NUM`·그 밖은 `VALUE_TXT`(200자). 한 회차에 항목 최대 50개다. 위젯은 기존 `widgetData/run` 으로 `show.days` 일 안의 값을 읽는다(최대 500행). 두 테이블 모두 매일 03:30(Asia/Seoul)에 `SLOT` 이 오늘-90일 0시 이전인 행을 지운다. 정의를 삭제·사용 중지해도 쌓인 값은 이 보관 삭제로 정리된다.
```

설정(`application.yml`): `dmes.widget.collect.enabled`(기본 true, false 면 수집·삭제 모두 안 함), `dmes.widget.collect.allowed-hosts`(http 원천이 부를 수 있는 호스트, 비면 http 원천 모두 거절).
