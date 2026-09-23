-- TSK-01-02 design.md §2.3 — 연계 시스템 원장 TB_MDM_SYSTEM(SQLite). 두 방언 버전 집합은 항상 같다(규칙표 §5).
-- 자기 행(SELF_YN='Y')은 하나뿐이다(부분 유일 인덱스). 시드 감사 시각은 NULL(규칙표 #16, design.md D10).
CREATE TABLE TB_MDM_SYSTEM (
    SYSTEM_CODE VARCHAR(20)  NOT NULL,
    SYSTEM_NAME VARCHAR(100) NOT NULL,
    SELF_YN     VARCHAR(1)   NOT NULL,
    C_USR_ID    VARCHAR(100),
    C_AT        TIMESTAMP,
    C_SVC_ID    VARCHAR(100),
    C_PGM_ID    VARCHAR(100),
    U_USR_ID    VARCHAR(100),
    U_AT        TIMESTAMP,
    U_SVC_ID    VARCHAR(100),
    U_PGM_ID    VARCHAR(100),
    VER         BIGINT,
    CONSTRAINT PK_TB_MDM_SYSTEM PRIMARY KEY (SYSTEM_CODE),
    CONSTRAINT CK_TB_MDM_SYSTEM_SELF_YN CHECK (SELF_YN IN ('Y', 'N'))
);
CREATE UNIQUE INDEX UX_TB_MDM_SYSTEM_SELF_YN ON TB_MDM_SYSTEM (SELF_YN) WHERE SELF_YN = 'Y';
INSERT INTO TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN, C_USR_ID, C_SVC_ID, C_PGM_ID, U_USR_ID, U_SVC_ID, U_PGM_ID, VER) VALUES
    ('ERP',  'ERP',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MES',  'MES',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('APS',  'APS',      'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('DKMS', 'DKMS',     'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('L2',   '레벨2',    'N', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0),
    ('MDM',  '마루 MDM', 'Y', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 'SYSTEM', 'flyway', 'V2__create_mdm_system', 0);
