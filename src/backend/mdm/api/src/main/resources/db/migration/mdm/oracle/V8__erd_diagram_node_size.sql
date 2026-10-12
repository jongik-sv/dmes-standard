-- ============================================================
-- V8: ERD 다이어그램 표 크기
-- ============================================================
--
-- 대상 스키마: MDMAPUSER   위치: mdm/oracle
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   ERD 표 크기 조절(erd-route-1012 erd-size, README §7.4). 다이어그램마다 표 상자의 너비·높이를 둔다.
--   NULL = 자동 크기(V8 이전 동작). 범위(너비 160~1600, 높이 52~4000)는 명령(resizeNodes)이 검사한다.
-- ============================================================

ALTER TABLE TB_MDM_ERD_DIAGRAM_NODE ADD (
    SIZE_W NUMBER(5),
    SIZE_H NUMBER(5)
);

COMMENT ON COLUMN TB_MDM_ERD_DIAGRAM_NODE.SIZE_W IS '표 너비';
COMMENT ON COLUMN TB_MDM_ERD_DIAGRAM_NODE.SIZE_H IS '표 높이';
