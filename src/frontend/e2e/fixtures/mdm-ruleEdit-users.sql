-- TSK-08-02 E2E 전용(design.md §3.4.3, D10): 워크트리 격리 mcm.db 에만 적용한다. 운영·공유 DB 금지. seed-only 픽스처.
-- 두 번째 담당자 e2e_mdm_steward2(ROLE_GROUP_MDM_STEWARD) — 비소유자 잠금·해제 시나리오(S8·S9)용.
-- 공유 픽스처 mdm-rbac-users.sql 을 고치지 않고 이 Task 전용 파일에 둔다. 형식(칼럼·INSERT OR IGNORE·admin 행 복사)은 그 파일과 같다.
-- mcm 기동(시드) 뒤, 첫 로그인 전에 넣는다. 비밀번호 해시는 admin 행을 복사하므로 admin123 이다.

INSERT OR IGNORE INTO TB_MCM_SEC_USER
    (USER_ID, USER_NM, USER_EMP_NO, DEPT_CD, EMAIL, END_ACTIVE_DATE, START_ACTIVE_DATE, IN_OUT_EMP_TP, USE_TP,
     C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT 'e2e_mdm_steward2', 'E2E MDM 담당자2', 'E2E-MDM-4', a.DEPT_CD, NULL, a.END_ACTIVE_DATE, a.START_ACTIVE_DATE, a.IN_OUT_EMP_TP, a.USE_TP,
       a.C_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', a.U_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', 0
  FROM TB_MCM_SEC_USER a
 WHERE a.USER_ID = 'admin';

INSERT OR IGNORE INTO TB_MCM_SEC_USER_PWD
    (USER_ID, USER_ENC_PWD, LAST_PWD_CHNG_DATE,
     C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
SELECT 'e2e_mdm_steward2', a.USER_ENC_PWD, a.LAST_PWD_CHNG_DATE,
       a.C_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', a.U_AT, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', 0
  FROM TB_MCM_SEC_USER_PWD a
 WHERE a.USER_ID = 'admin';

INSERT OR IGNORE INTO TB_MCM_SEC_USER_MAPPING
    (USER_ID, ROLE_GROUP_ID, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
VALUES
    ('e2e_mdm_steward2', 'ROLE_GROUP_MDM_STEWARD', CURRENT_TIMESTAMP, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture',
     CURRENT_TIMESTAMP, 'e2e-fixture', 'e2e-fixture', 'e2e-fixture', 0);
