-- 2026-09-30 — 룰 세트 테스트 케이스 테이블(spec docs/superpowers/specs/2026-09-30-rule-set-flow-editor-debugger-design.md §4.6).
--
-- 왜: 흐름을 고칠 때마다 저장해 둔 입력들로 결과가 그대로인지 한 번에 확인한다(디버그 모드 [모두 실행]).
-- 모양은 룰 테스트 케이스(V8 TB_MDM_RULE_TEST_CASE)와 같고, 세트는 판정 시각(EVAL_TS, KST yyyy-MM-dd HH:mm:ss 문자열, 없으면 실행 시각)을 더 둔다.
-- CASE_ID 는 세트 안 최대 번호 + 1 로 서버가 발급한다(세트 테이블에 카운터 칼럼을 더하지 않는다 — 칼럼 순서 불변식).
-- 주의: TB_MDM_RULE_SET 을 가리키는 첫 FK 다. V14 머리의 "TB_MDM_RULE_SET 을 참조하는 FK 는 없다" 는 이 파일부터 참이 아니다.
-- 세트 테이블을 DROP/RENAME 으로 다시 만드는 마이그레이션은 이 테이블을 먼저 옮기거나 다시 만들어야 한다.
-- 되돌리려면: DROP TABLE TB_MDM_RULE_SET_TEST_CASE (케이스가 사라진다).

CREATE TABLE TB_MDM_RULE_SET_TEST_CASE (
    MARU_RULE_SET_ID VARCHAR(50) NOT NULL,
    CASE_ID INTEGER NOT NULL,
    CASE_NAME TEXT,
    INPUT_JSON TEXT NOT NULL CONSTRAINT CK_TB_MDM_RULE_SET_TEST_CASE_INPUT_JSON CHECK (json_valid(INPUT_JSON)),
    EVAL_TS VARCHAR(19),
    EXPECTED_JSON TEXT CONSTRAINT CK_TB_MDM_RULE_SET_TEST_CASE_EXPECTED_JSON CHECK (EXPECTED_JSON IS NULL OR json_valid(EXPECTED_JSON)),
    DESCRIPTION TEXT,
    ROW_VERSION BIGINT NOT NULL DEFAULT 0,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT PK_TB_MDM_RULE_SET_TEST_CASE PRIMARY KEY (MARU_RULE_SET_ID, CASE_ID),
    CONSTRAINT FK_TB_MDM_RULE_SET_TEST_CASE_SET FOREIGN KEY (MARU_RULE_SET_ID) REFERENCES TB_MDM_RULE_SET (MARU_RULE_SET_ID)
);
