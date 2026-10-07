-- CARAVANUSER Oracle 기준선 (초안, 2026-10-07 oracle-1007 ora-platform p1).
-- 접속 사용자 = CARAVANUSER 이므로 테이블에 스키마 접두를 붙이지 않는다(MyBatis·JPA 모두 접두 없이 쓴다).
-- 합친 원천:
--   caravan-hub DataInitializer.buildMstDdl() 의 TB_CARAVAN_TOPICS·TB_CARAVAN_TC_ERROR·TB_CARAVAN_HUB_CONFIG
--   caravan-core 엔티티(TopicInfoEntity·KafkaErrorLogEntity, CaravanAuditBase 의 audit 9컬럼)
--   caravan-console 엔티티(AppHostEntity → TB_CARAVAN_APPHOST, 나머지 3종은 같은 표를 공유)
--   로컬 SQLite caravan-console.db 실제 스키마(hibernate ddl-auto=update 결과)
-- 규칙: VARCHAR2(n CHAR), TIMESTAMP(6), NUMBER(19). DataInitializer 의 MSSQL 판 길이를 따른다.
-- HTTP_HEADERS 는 헤더 JSON 이라 짧으므로 CLOB 이 아닌 VARCHAR2(4000 CHAR) 로 둔다. CLOB 이면 MyBatis resultType=Map 이
-- Clob 객체를 돌려줘 HttpOutboundHandler 의 (String) 캐스트가 깨지고, console 엔티티(길이 지정 없음)와 타입도 어긋난다.
-- INTERFACE_MSG(CLOB)는 JPA 엔티티(length=65000)만 읽고 쓰므로 CLOB 을 유지한다.
-- audit 9컬럼(C_USR_ID … VER)은 hub·console 어느 쪽이 쓰든 같은 표를 쓰므로 모든 표에 둔다.
-- 옛 TC_ERROR 의 CREATED_AT/CREATED_BY/UPDATED_AT/UPDATED_BY 4컬럼은 v4 결정 #13 으로 폐기됐다.

CREATE TABLE TB_CARAVAN_TOPICS (
    TOPIC_ID        VARCHAR2(100 CHAR)  NOT NULL,
    BIZ_SYSTEM      VARCHAR2(20 CHAR)   NOT NULL,
    TOPIC_DESC      VARCHAR2(300 CHAR),
    GROUP_ID        VARCHAR2(100 CHAR)  NOT NULL,
    SEND_MODULE_ID  VARCHAR2(20 CHAR),
    RECV_MODULE_ID  VARCHAR2(20 CHAR),
    USE_TP          VARCHAR2(1 CHAR),
    STATUS          VARCHAR2(20 CHAR),
    ASSIGNED_HOST   VARCHAR2(50 CHAR),
    ERROR_AT        TIMESTAMP(6),
    ERROR_OFFSET    NUMBER(19),
    LAST_ERROR_CODE VARCHAR2(100 CHAR),
    LAST_ERROR_MSG  VARCHAR2(1000 CHAR),
    C_USR_ID        VARCHAR2(100 CHAR),
    C_AT            TIMESTAMP(6),
    C_SVC_ID        VARCHAR2(100 CHAR),
    C_PGM_ID        VARCHAR2(100 CHAR),
    U_USR_ID        VARCHAR2(100 CHAR),
    U_AT            TIMESTAMP(6),
    U_SVC_ID        VARCHAR2(100 CHAR),
    U_PGM_ID        VARCHAR2(100 CHAR),
    VER             NUMBER(19),
    CONSTRAINT PK_TB_CARAVAN_TOPICS PRIMARY KEY (TOPIC_ID, BIZ_SYSTEM)
);

CREATE TABLE TB_CARAVAN_TC_ERROR (
    SQ_VAL             VARCHAR2(32 CHAR)  NOT NULL,
    TRANSACTION_CODE   VARCHAR2(50 CHAR),
    INTERFACE_ID       VARCHAR2(100 CHAR),
    INTERFACE_MSG      CLOB,
    INTERFACE_PROTOCOL VARCHAR2(20 CHAR),
    ERROR_TYPE         VARCHAR2(3 CHAR),
    ERROR_CODE         VARCHAR2(100 CHAR),
    ERROR_MSG          VARCHAR2(1000 CHAR),
    ERROR_STATUS_CODE  VARCHAR2(1 CHAR),
    C_USR_ID           VARCHAR2(100 CHAR),
    C_AT               TIMESTAMP(6),
    C_SVC_ID           VARCHAR2(100 CHAR),
    C_PGM_ID           VARCHAR2(100 CHAR),
    U_USR_ID           VARCHAR2(100 CHAR),
    U_AT               TIMESTAMP(6),
    U_SVC_ID           VARCHAR2(100 CHAR),
    U_PGM_ID           VARCHAR2(100 CHAR),
    VER                NUMBER(19),
    CONSTRAINT PK_TB_CARAVAN_TC_ERROR PRIMARY KEY (SQ_VAL)
);

-- 운영 조회(최근 오류 목록)를 받쳐 준다. 옛 Tibero 표의 LAST_UPDATE_TIMESTAMP 인덱스(IDX_MCM_MOM_TC_ERROR_01)에 대응한다.
CREATE INDEX IX_TB_CARAVAN_TC_ERROR_UAT ON TB_CARAVAN_TC_ERROR (U_AT);

CREATE TABLE TB_CARAVAN_HUB_CONFIG (
    TOPIC_ID            VARCHAR2(100 CHAR) NOT NULL,
    DIRECTION           VARCHAR2(10 CHAR)  NOT NULL,
    INTEGRATION_TYPE    VARCHAR2(20 CHAR),
    POLLING_INTERVAL_MS NUMBER(10),
    DB_TABLE_NAME       VARCHAR2(100 CHAR),
    DB_SCHEMA           VARCHAR2(100 CHAR),
    FILE_PATH           VARCHAR2(500 CHAR),
    BACKUP_PATH         VARCHAR2(500 CHAR),
    FTP_HOST            VARCHAR2(200 CHAR),
    FTP_PORT            NUMBER(10),
    FTP_USER            VARCHAR2(100 CHAR),
    FTP_PASSWORD        VARCHAR2(200 CHAR),
    HTTP_URL            VARCHAR2(500 CHAR),
    HTTP_METHOD         VARCHAR2(10 CHAR),
    HTTP_HEADERS        VARCHAR2(4000 CHAR),
    USE_YN              VARCHAR2(1 CHAR),
    C_USR_ID            VARCHAR2(100 CHAR),
    C_AT                TIMESTAMP(6),
    C_SVC_ID            VARCHAR2(100 CHAR),
    C_PGM_ID            VARCHAR2(100 CHAR),
    U_USR_ID            VARCHAR2(100 CHAR),
    U_AT                TIMESTAMP(6),
    U_SVC_ID            VARCHAR2(100 CHAR),
    U_PGM_ID            VARCHAR2(100 CHAR),
    VER                 NUMBER(19),
    CONSTRAINT PK_TB_CARAVAN_HUB_CONFIG PRIMARY KEY (TOPIC_ID, DIRECTION)
);

-- caravan-console 호스트 등록(AppHostEntity). WORKS_CD 가 공장 식별자다.
CREATE TABLE TB_CARAVAN_APPHOST (
    APP_HOST_ID   VARCHAR2(50 CHAR)  NOT NULL,
    WORKS_CD      VARCHAR2(20 CHAR)  NOT NULL,
    APP_HOST_NM   VARCHAR2(200 CHAR) NOT NULL,
    APP_HOST_DESC VARCHAR2(500 CHAR),
    APP_HOST_URL  VARCHAR2(500 CHAR) NOT NULL,
    C_USR_ID      VARCHAR2(100 CHAR),
    C_AT          TIMESTAMP(6),
    C_SVC_ID      VARCHAR2(100 CHAR),
    C_PGM_ID      VARCHAR2(100 CHAR),
    U_USR_ID      VARCHAR2(100 CHAR),
    U_AT          TIMESTAMP(6),
    U_SVC_ID      VARCHAR2(100 CHAR),
    U_PGM_ID      VARCHAR2(100 CHAR),
    VER           NUMBER(19),
    CONSTRAINT PK_TB_CARAVAN_APPHOST PRIMARY KEY (APP_HOST_ID, WORKS_CD)
);
