-- TSK-04-04 E2E 전용 mdm.db 사전 픽스처(design.md §3.6). 워크트리 격리 mdm.db 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다 — 용어·도메인 테이블이 비어 있는 것이 정상 상태다. mdm 기동(Flyway V3 적용) 뒤에만 넣는다.
-- INSERT 만(DELETE 없음). 용어는 유일 인덱스가 있어 INSERT OR IGNORE, 도메인은 이름 유일 인덱스가 없어 NOT EXISTS 로 막는다.
-- 이 픽스처를 쓰는 mdm-columnMng.spec.ts 는 용어·컬럼을 만들므로 같은 mdm.db 로 다시 돌릴 수 없다(새 mdm.db 로 시작).

INSERT OR IGNORE INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, ENG_NAME, ENG_ABBR, SYNONYMS, C_USR_ID, C_PGM_ID, VER) VALUES
    ('원재료', 1, '제품 생산에 투입되는 재료', 'Raw Material', 'RMTL', '["원자재(ERP)"]', 'e2e-fixture', 'mdm-columnMng-dict.sql', 0),
    ('코일',   1, '생산·이동 단위인 코일 한 개', 'Coil', 'COIL', '["배치(ERP)","배치넘버(ERP)"]', 'e2e-fixture', 'mdm-columnMng-dict.sql', 0),
    ('두께',   1, '대상의 두꺼운 정도', 'Thickness', 'THK', NULL, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0),
    ('아이디', 1, '대상을 유일하게 식별하는 값', 'Identifier', 'ID', NULL, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0),
    ('오차',   1, '측정값과 참값의 차이', 'Error', 'ERR', NULL, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0);

INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 두께', 'COIL_THK', 'QTY', 'NUMBER', 3, 1, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_THK');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '원재료 코일 두께', 'RMTL_COIL_THK', 'QTY', 'NUMBER', 3, 1, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'RMTL_COIL_THK');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '두께 편차', 'THK_DEV', 'QTY', 'NUMBER', 3, 1, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'THK_DEV');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 식별자', 'COIL_ID', 'ID', 'STRING', 20, NULL, 'e2e-fixture', 'mdm-columnMng-dict.sql', 0
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_ID');
