-- Oracle(MCMAPUSER) 대상, 문장마다 ';' (BEGIN·COMMIT 없음 — 트랜잭션은 runSqlFile 도우미가 잡는다). 문자열 리터럴 안에 ';' 없음.
-- 표 정의: ora-mcm-core 레인 src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V1__baseline.sql (TB_MCM_SEC_USER·_USER_PWD·_USER_MAPPING).
-- TSK-01-03 E2E 전용: 워크트리 격리 DB 에만 적용한다. 운영·공유 DB 금지.
-- seed-only 픽스처(Backend-Implementation-Guide: 생성 API 가 없을 때만 직접 INSERT, 이름·주석에 seed-only 표시).
-- 운영 시드(DataInitializer)에는 시험 사용자를 넣지 않는다(design.md D10). mcm 기동(시드) 뒤, 첫 로그인 전에 넣는다.
--   e2e_mdm_none     — 역할 그룹 없음(MDM 권한 없음, 수용 기준 "권한 없는 사용자")
--   e2e_mdm_steward  — ROLE_GROUP_MDM_STEWARD(담당자)
--   e2e_mdm_stdadmin — ROLE_GROUP_MDM_STD_ADMIN(표준 관리자)
-- 사용자·비밀번호 행은 admin 행을 복사한다. admin 비밀번호는 mcm 기동마다 admin123 으로 재설정되므로 해시도 admin123 이다.
-- 모두 INSERT … SELECT … FROM DUAL WHERE NOT EXISTS(PK 기준) — 같은 DB 에 다시 넣어도 안전하다(SQLite 의 INSERT OR IGNORE 와 같다).
-- 칼럼 목록은 SecUser·SecUserPwd·SecUserMapping 엔티티와 같다.

INSERT INTO TB_MCM_SEC_USER
    (USER_ID, USER_NM, USER_EMP_NO, DEPT_CD, EMAIL, END_ACTIVE_DATE, START_ACTIVE_DATE, IN_OUT_EMP_TP, USE_TP,
     C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT n.USER_ID, n.USER_NM, n.USER_EMP_NO, a.DEPT_CD, NULL, a.END_ACTIVE_DATE, a.START_ACTIVE_DATE, a.IN_OUT_EMP_TP, a.USE_TP,
       a.C_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', a.U_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', 0
  FROM TB_MCM_SEC_USER a,
       (SELECT 'e2e_mdm_none' AS USER_ID, 'E2E MDM 권한없음' AS USER_NM, 'E2E-MDM-1' AS USER_EMP_NO FROM DUAL
        UNION ALL SELECT 'e2e_mdm_steward', 'E2E MDM 담당자', 'E2E-MDM-2' FROM DUAL
        UNION ALL SELECT 'e2e_mdm_stdadmin', 'E2E MDM 표준관리자', 'E2E-MDM-3' FROM DUAL) n
 WHERE a.USER_ID = 'admin'
   AND NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_USER x WHERE x.USER_ID = n.USER_ID);

INSERT INTO TB_MCM_SEC_USER_PWD
    (USER_ID, USER_ENC_PWD, LAST_PWD_CHNG_DATE,
     C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT n.USER_ID, a.USER_ENC_PWD, a.LAST_PWD_CHNG_DATE,
       a.C_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', a.U_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', 0
  FROM TB_MCM_SEC_USER_PWD a,
       (SELECT 'e2e_mdm_none' AS USER_ID FROM DUAL
        UNION ALL SELECT 'e2e_mdm_steward' FROM DUAL
        UNION ALL SELECT 'e2e_mdm_stdadmin' FROM DUAL) n
 WHERE a.USER_ID = 'admin'
   AND NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_USER_PWD x WHERE x.USER_ID = n.USER_ID);

INSERT INTO TB_MCM_SEC_USER_MAPPING
    (USER_ID, ROLE_GROUP_ID, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT n.USER_ID, n.ROLE_GROUP_ID, LOCALTIMESTAMP, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture',
       LOCALTIMESTAMP, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', 0
  FROM (SELECT 'e2e_mdm_steward' AS USER_ID, 'ROLE_GROUP_MDM_STEWARD' AS ROLE_GROUP_ID FROM DUAL
        UNION ALL SELECT 'e2e_mdm_stdadmin', 'ROLE_GROUP_MDM_STD_ADMIN' FROM DUAL) n
 WHERE NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_USER_MAPPING x WHERE x.ROLE_GROUP_ID = n.ROLE_GROUP_ID AND x.USER_ID = n.USER_ID);
