-- TSK-01-02 design.md §2.3 — 연계 시스템 원장 TB_MDM_SYSTEM(MSSQL). 두 방언 버전 집합은 항상 같다(규칙표 §5).
-- 코드·Y/N 칼럼은 BIN2 로 두 방언의 비교 결과를 같게 한다(규칙표 #19, design.md D8). DATETIME2 사용(TIMESTAMP 는 rowversion).
-- 필터 인덱스는 QUOTED_IDENTIFIER ON 이 필요하다(JDBC·Flyway 기본 ON, sqlcmd 는 -I).
CREATE TABLE TB_MDM_SYSTEM (
    SYSTEM_CODE VARCHAR(20)   COLLATE Latin1_General_100_BIN2 NOT NULL,
    SYSTEM_NAME NVARCHAR(100) NOT NULL,
    SELF_YN     VARCHAR(1)    COLLATE Latin1_General_100_BIN2 NOT NULL,
    C_USR_ID    VARCHAR(100),
    C_AT        DATETIME2,
    C_SVC_ID    VARCHAR(100),
    C_PGM_ID    VARCHAR(100),
    U_USR_ID    VARCHAR(100),
    U_AT        DATETIME2,
    U_SVC_ID    VARCHAR(100),
    U_PGM_ID    VARCHAR(100),
    VER         BIGINT,
    CONSTRAINT PK_TB_MDM_SYSTEM PRIMARY KEY (SYSTEM_CODE),
    CONSTRAINT CK_TB_MDM_SYSTEM_SELF_YN CHECK (SELF_YN IN ('Y', 'N'))
);
CREATE UNIQUE INDEX UX_TB_MDM_SYSTEM_SELF_YN ON TB_MDM_SYSTEM (SELF_YN) WHERE SELF_YN = 'Y';
INSERT INTO TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN, C_USR_ID, C_SVC_ID, C_PGM_ID, U_USR_ID, U_SVC_ID, U_PGM_ID, VER) VALUES
    ('ERP',  N'ERP',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MES',  N'MES',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('APS',  N'APS',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('DKMS', N'DKMS',     'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('L2',   N'레벨2',    'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MDM',  N'마루 MDM', 'Y', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0);
