-- Oracle(MDMAPUSER) 대상. 문장 끝은 세미콜론으로 구분한다. 트랜잭션은 실행 도우미가 잡는다.
-- TSK-04-04 E2E 전용 mdm 사전 픽스처(design.md §3.6). 워크트리 격리 DB 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다 — 용어·도메인 테이블이 비어 있는 것이 정상 상태다. mdm 기동(Flyway 적용) 뒤에만 넣는다.
-- INSERT 만(DELETE 없음). 용어는 유일 인덱스(TERM_NAME, SENSE_NO)가 있어 NOT EXISTS 로, 도메인은 이름 유일 인덱스가 없어
-- STD_NAME 기준 NOT EXISTS 로 막는다.
-- 이 픽스처를 쓰는 mdm-columnMng.spec.ts 는 용어·컬럼을 만들므로 같은 DB 로 다시 돌릴 수 없다(새 DB 로 시작).
-- TERM_ID·DOMAIN_ID 는 IDENTITY 라 값을 넣지 않는다.

INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, ENG_NAME, ENG_ABBR, SYNONYMS, C_USR_ID, C_PGM_ID, VER)
SELECT v.TNAME, v.SNO, v.DEFN, v.ENAME, v.EABBR, v.SYN, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0
  FROM (SELECT '원재료' AS TNAME, 1 AS SNO, '제품 생산에 투입되는 재료' AS DEFN, 'Raw Material' AS ENAME, 'RMTL' AS EABBR, '["원자재(ERP)"]' AS SYN FROM DUAL
        UNION ALL
        SELECT '코일',   1, '생산·이동 단위인 코일 한 개', 'Coil', 'COIL', '["배치(ERP)","배치넘버(ERP)"]' FROM DUAL
        UNION ALL
        SELECT '두께',   1, '대상의 두꺼운 정도', 'Thickness', 'THK', NULL FROM DUAL
        UNION ALL
        SELECT '아이디', 1, '대상을 유일하게 식별하는 값', 'Identifier', 'ID', NULL FROM DUAL
        UNION ALL
        SELECT '오차',   1, '측정값과 참값의 차이', 'Error', 'ERR', NULL FROM DUAL) v
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_TERM t WHERE t.TERM_NAME = v.TNAME AND t.SENSE_NO = v.SNO);

INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 두께', 'COIL_THK', 'QTY', 'NUMBER', 3, 1, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0 FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_THK');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '원재료 코일 두께', 'RMTL_COIL_THK', 'QTY', 'NUMBER', 3, 1, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0 FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'RMTL_COIL_THK');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '두께 편차', 'THK_DEV', 'QTY', 'NUMBER', 3, 1, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0 FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'THK_DEV');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 식별자', 'COIL_ID', 'ID', 'STRING', 20, NULL, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0 FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_ID');
