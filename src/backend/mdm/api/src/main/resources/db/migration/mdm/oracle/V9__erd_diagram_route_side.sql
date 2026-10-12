-- ============================================================
-- V9: ERD 관계선 끝점 변
-- ============================================================
--
-- 대상 스키마: MDMAPUSER   위치: mdm/oracle
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   ERD 관계선 끝점 변 지정(erd-side, README §7.5). 다이어그램마다 관계선 두 끝이 붙는 표의 변(L 왼쪽·R 오른쪽)을 둔다.
--   NULL = 자동 변(화면의 relationSides, V9 이전 동작). 끝마다 따로 둔다. 꺾임점 행(V7)과 같은 행에 둔다.
--   점 없이 변만 지정한 행은 POINTS_JSON = '[]' 로 둔다(NOT NULL 유지). 점이 비고 두 변이 모두 NULL 이 되면
--   명령(setRouteSides·clearRoutes)이 행을 지운다. 변 값 L·R 의 입력 검사는 명령(setRouteSides)도 한다.
-- ============================================================

ALTER TABLE TB_MDM_ERD_DIAGRAM_ROUTE ADD (
    CHILD_SIDE  VARCHAR2(1 CHAR),
    PARENT_SIDE VARCHAR2(1 CHAR),
    CONSTRAINT CK_TB_MDM_ERD_DIAGRAM_ROUTE_CSIDE CHECK (CHILD_SIDE IN ('L', 'R')),
    CONSTRAINT CK_TB_MDM_ERD_DIAGRAM_ROUTE_PSIDE CHECK (PARENT_SIDE IN ('L', 'R'))
);

COMMENT ON TABLE TB_MDM_ERD_DIAGRAM_ROUTE IS 'ERD 다이어그램 관계선 꺾임점·끝점 변';
COMMENT ON COLUMN TB_MDM_ERD_DIAGRAM_ROUTE.CHILD_SIDE IS '자식 쪽 끝점 변(L 왼쪽, R 오른쪽, NULL 자동)';
COMMENT ON COLUMN TB_MDM_ERD_DIAGRAM_ROUTE.PARENT_SIDE IS '부모 쪽 끝점 변(L 왼쪽, R 오른쪽, NULL 자동)';
