# ERD 조각 — widget-tabs

로컬은 `ddl-auto: update` 로 자동 생성한다. 개발·운영 DDL 은 아래 정의로 만들고, 마감 때 조정 세션이 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 합친다. 기존 테이블 변경은 없다.

## TB_MCM_WIDGET_DEFAULT_TAB (스키마 MCMAPUSER)

관리자가 전사(`*`)·부서 키에 두는 기본 탭의 머리. 「홈」 기본 배치는 기존 `TB_MCM_WIDGET_DEFAULT_LAYOUT` 이 그대로 맡는다.

| 칸 | 형 | 설명 |
|---|---|---|
| LAYOUT_KEY | VARCHAR(30) PK | `*` 또는 부서 코드 |
| TAB_ID | VARCHAR(30) PK | `def-N`, 전 키에서 유일(유일 제약 `UK_MCM_WIDGET_DEFAULT_TAB_ID`) |
| TAB_NM | VARCHAR(60) NOT NULL | 탭 이름 |
| TAB_SEQ | INT NOT NULL | 표시 순서(1부터) |
| 감사 칸 | | McmAuditEntity 공통 |

## TB_MCM_WIDGET_DEFAULT_TAB_ITEM (스키마 MCMAPUSER)

기본 탭에 놓인 위젯.

| 칸 | 형 | 설명 |
|---|---|---|
| LAYOUT_KEY | VARCHAR(30) PK | |
| TAB_ID | VARCHAR(30) PK | |
| INST_ID | VARCHAR(40) PK | 위젯 인스턴스 ID |
| WIDGET_ID | VARCHAR(100) NOT NULL | |
| POS_X, POS_Y, SIZE_W, SIZE_H | INT NOT NULL | 24칸 격자 |
| LOCK_YN | CHAR(1) NOT NULL | 기본값 N |
| 감사 칸 | | McmAuditEntity 공통 |

## 채번과 사용자 재정의 행

- 새 `def-N` 은 기본 탭 테이블과 `TB_MCM_SEC_USER_WIDGET_TAB` 에 남은 `def-*` 번호 중 가장 큰 N + 1 이다(숫자로 비교). 관리자가 지운 탭의 사용자 재정의 행이 새 탭에 되살아나지 않게 하려는 것이다.
- 사용자 재정의 행은 기존 `TB_MCM_SEC_USER_WIDGET_TAB`·`TB_MCM_SEC_USER_WIDGET` 에 같은 `def-N` TAB_ID 로 둔다. 기존 테이블의 칸·제약은 바뀌지 않는다.

## DDL — Oracle

엔티티(`WidgetDefaultTab`·`WidgetDefaultTabItem`)와 같은 모양이다. 감사 칸은 `McmAuditEntity` 공통 칸이다.

```sql
CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_DEFAULT_TAB (
    LAYOUT_KEY  VARCHAR2(30 CHAR)  NOT NULL,
    TAB_ID      VARCHAR2(30 CHAR)  NOT NULL,
    TAB_NM      VARCHAR2(60 CHAR)  NOT NULL,
    TAB_SEQ     NUMBER(10)         NOT NULL,
    C_USR_ID    VARCHAR2(100 CHAR),
    C_AT        TIMESTAMP,
    C_SVC_ID    VARCHAR2(100 CHAR),
    C_PGM_ID    VARCHAR2(100 CHAR),
    U_USR_ID    VARCHAR2(100 CHAR),
    U_AT        TIMESTAMP,
    U_SVC_ID    VARCHAR2(100 CHAR),
    U_PGM_ID    VARCHAR2(100 CHAR),
    VER         NUMBER(19),
    CONSTRAINT PK_MCM_WIDGET_DEFAULT_TAB PRIMARY KEY (LAYOUT_KEY, TAB_ID),
    CONSTRAINT UK_MCM_WIDGET_DEFAULT_TAB_ID UNIQUE (TAB_ID)
);

CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_DEFAULT_TAB_ITEM (
    LAYOUT_KEY  VARCHAR2(30 CHAR)  NOT NULL,
    TAB_ID      VARCHAR2(30 CHAR)  NOT NULL,
    INST_ID     VARCHAR2(40 CHAR)  NOT NULL,
    WIDGET_ID   VARCHAR2(100 CHAR) NOT NULL,
    POS_X       NUMBER(10)         NOT NULL,
    POS_Y       NUMBER(10)         NOT NULL,
    SIZE_W      NUMBER(10)         NOT NULL,
    SIZE_H      NUMBER(10)         NOT NULL,
    LOCK_YN     CHAR(1)            DEFAULT 'N' NOT NULL,
    C_USR_ID    VARCHAR2(100 CHAR),
    C_AT        TIMESTAMP,
    C_SVC_ID    VARCHAR2(100 CHAR),
    C_PGM_ID    VARCHAR2(100 CHAR),
    U_USR_ID    VARCHAR2(100 CHAR),
    U_AT        TIMESTAMP,
    U_SVC_ID    VARCHAR2(100 CHAR),
    U_PGM_ID    VARCHAR2(100 CHAR),
    VER         NUMBER(19),
    CONSTRAINT PK_MCM_WIDGET_DEFAULT_TAB_ITEM PRIMARY KEY (LAYOUT_KEY, TAB_ID, INST_ID)
);
```

## DDL — PostgreSQL

```sql
CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_DEFAULT_TAB (
    LAYOUT_KEY  VARCHAR(30)  NOT NULL,
    TAB_ID      VARCHAR(30)  NOT NULL,
    TAB_NM      VARCHAR(60)  NOT NULL,
    TAB_SEQ     INTEGER      NOT NULL,
    C_USR_ID    VARCHAR(100),
    C_AT        TIMESTAMP,
    C_SVC_ID    VARCHAR(100),
    C_PGM_ID    VARCHAR(100),
    U_USR_ID    VARCHAR(100),
    U_AT        TIMESTAMP,
    U_SVC_ID    VARCHAR(100),
    U_PGM_ID    VARCHAR(100),
    VER         BIGINT,
    CONSTRAINT PK_MCM_WIDGET_DEFAULT_TAB PRIMARY KEY (LAYOUT_KEY, TAB_ID),
    CONSTRAINT UK_MCM_WIDGET_DEFAULT_TAB_ID UNIQUE (TAB_ID)
);

CREATE TABLE MCMAPUSER.TB_MCM_WIDGET_DEFAULT_TAB_ITEM (
    LAYOUT_KEY  VARCHAR(30)  NOT NULL,
    TAB_ID      VARCHAR(30)  NOT NULL,
    INST_ID     VARCHAR(40)  NOT NULL,
    WIDGET_ID   VARCHAR(100) NOT NULL,
    POS_X       INTEGER      NOT NULL,
    POS_Y       INTEGER      NOT NULL,
    SIZE_W      INTEGER      NOT NULL,
    SIZE_H      INTEGER      NOT NULL,
    LOCK_YN     CHAR(1)      DEFAULT 'N' NOT NULL,
    C_USR_ID    VARCHAR(100),
    C_AT        TIMESTAMP,
    C_SVC_ID    VARCHAR(100),
    C_PGM_ID    VARCHAR(100),
    U_USR_ID    VARCHAR(100),
    U_AT        TIMESTAMP,
    U_SVC_ID    VARCHAR(100),
    U_PGM_ID    VARCHAR(100),
    VER         BIGINT,
    CONSTRAINT PK_MCM_WIDGET_DEFAULT_TAB_ITEM PRIMARY KEY (LAYOUT_KEY, TAB_ID, INST_ID)
);
```

감사 칸 `C_AT`·`U_AT` 은 엔티티에서 `Instant` 다. 기존 위젯 테이블과 같은 형을 쓰려면 합칠 때 `csa-menu-tables.md` 의 기존 위젯 테이블 정의와 맞춘다.
