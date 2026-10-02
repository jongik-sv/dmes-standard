package com.dongkuk.dmes.mdm;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TSK-08-01 design.md §3.1·§3.2·§6.0 — SQLite 마이그레이션 테스트({@code MdmBusinessRuleMigrationTest})가 보는
 * 기대값을 한 곳에 둔다
 * ({@code MdmInterfaceLayoutExpectations} 관례).
 */
final class MdmBusinessRuleExpectations {

    /** V8 이 만드는 8테이블(+ V15 세트 테스트 케이스) — 파일 순서(§6.0 「파일 순서」, FK 참조 순서)와 같다. */
    static final List<String> TABLES = List.of(
            "TB_MDM_RULE", "TB_MDM_RULE_SYSTEM", "TB_MDM_RULE_VER", "TB_MDM_RULE_VAR",
            "TB_MDM_RULE_ROW", "TB_MDM_RULE_TEST_CASE", "TB_MDM_RULE_SET", "TB_MDM_RULE_SET_TEST_CASE", "TB_MDM_RULE_RECV");

    /** 보류 테이블(DDL 만, 엔티티 없음 — D1, D-019). */
    static final Set<String> DEFERRED_TABLES = Set.of("TB_MDM_RULE_SYSTEM", "TB_MDM_RULE_RECV");

    /** 업무 칼럼 VER 와 충돌해 감사 카운터를 AUD_VER 로 두는 테이블(D-034, F6). */
    static final Set<String> AUD_VER_TABLES = Set.of(
            "TB_MDM_RULE_VER", "TB_MDM_RULE_VAR", "TB_MDM_RULE_ROW", "TB_MDM_RULE_RECV");

    /** 감사 카운터 칼럼 이름. */
    static final String AUD_VER = "AUD_VER";

    /** JSON CHECK 가 걸린 8칼럼(F5 + 흐름도 FLOW_JSON) — 테이블 → 칼럼. RULE_RECV.BODY 는 JSON CHECK 가 없다. */
    static final Map<String, List<String>> JSON_COLUMNS = new LinkedHashMap<>();

    /** JSON 칼럼 가운데 NULL 을 허용하는 5칼럼. */
    static final Set<String> NULLABLE_JSON_COLUMNS = Set.of("VAR_AST", "PRIO_LIST", "GRP_COND_AST", "EXPECTED_JSON", "FLOW_JSON");

    /** ON DELETE CASCADE 를 가진 FK 는 이 둘뿐이다(불변 규칙 5). */
    static final Set<String> CASCADE_FKS = Set.of("FK_TB_MDM_RULE_VAR_VER", "FK_TB_MDM_RULE_ROW_VER");

    /** 부분 유일 인덱스 이름 → partial 여부(§3.1-6). */
    static final Map<String, Boolean> UNIQUE_INDEXES = new LinkedHashMap<>();

    /** 테이블 제약(PK·FK·CK) 이름 — §6.0 그대로. */
    static final Map<String, List<String>> CONSTRAINTS = new LinkedHashMap<>();

    private static final Map<String, List<String>> BUSINESS_COLUMNS = new LinkedHashMap<>();

    static {
        BUSINESS_COLUMNS.put("TB_MDM_RULE", List.of(
                "MARU_RULE_ID", "MARU_RULE_NAME", "RULE_KIND", "STATUS", "SOURCE_KIND", "SOURCE_SYSTEM",
                "DESCRIPTION", "USAGE_NOTE", "LAST_VAR_ID", "LAST_ROW_ID", "LAST_CASE_ID"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_SYSTEM", List.of(
                "MARU_RULE_ID", "SYSTEM_CODE", "DEPLOY_KIND", "DESCRIPTION"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_VER", List.of(
                "MARU_RULE_ID", "VER", "VER_KIND", "STATUS", "BASE_VER", "OWNER_ID", "HIT_POLICY", "APPLY_FROM", "APPLY_TO",
                "DESCRIPTION", "REQUESTED_BY", "REQUESTED_AT", "EMERGENCY_YN", "EMERGENCY_REASON", "APPROVED_BY",
                "APPROVED_AT", "REJECT_REASON", "RELEASED_AT", "CANCELLED_AT", "CANCEL_REASON", "ROW_VERSION"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_VAR", List.of(
                "MARU_RULE_ID", "VER", "VAR_ID", "VAR_KIND", "DISP_TYPE", "VAR_NAME", "VAR_AST", "DOMAIN_ID",
                "DATA_TYPE", "COLLECT_AGG", "PRIO_LIST", "RES_GRP", "GRP_COND", "GRP_COND_AST", "SEQ", "LABEL",
                "DESCRIPTION"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_ROW", List.of(
                "MARU_RULE_ID", "VER", "ROW_ID", "SEQ", "ROW_KIND", "CELLS", "NOTE", "TAG"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_TEST_CASE", List.of(
                "MARU_RULE_ID", "CASE_ID", "CASE_NAME", "INPUT_JSON", "EXPECTED_JSON", "DESCRIPTION", "ROW_VERSION"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_SET", List.of(
                "MARU_RULE_SET_ID", "MARU_RULE_SET_NAME", "RULE_IDS", "FLOW_JSON", "DESCRIPTION", "STATUS", "ROW_VERSION"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_SET_TEST_CASE", List.of(
                "MARU_RULE_SET_ID", "CASE_ID", "CASE_NAME", "INPUT_JSON", "EVAL_TS", "EXPECTED_JSON", "DESCRIPTION", "ROW_VERSION"));
        BUSINESS_COLUMNS.put("TB_MDM_RULE_RECV", List.of(
                "RECV_ID", "MARU_RULE_ID", "SOURCE_SYSTEM", "SOURCE_REF", "REQ_KIND", "RECEIVED_AT", "BODY", "RESULT",
                "RESULT_DETAIL", "VER", "PROCESSED_AT"));

        JSON_COLUMNS.put("TB_MDM_RULE_VAR", List.of("VAR_AST", "PRIO_LIST", "GRP_COND_AST"));
        JSON_COLUMNS.put("TB_MDM_RULE_ROW", List.of("CELLS"));
        JSON_COLUMNS.put("TB_MDM_RULE_TEST_CASE", List.of("INPUT_JSON", "EXPECTED_JSON"));
        JSON_COLUMNS.put("TB_MDM_RULE_SET", List.of("RULE_IDS", "FLOW_JSON"));
        JSON_COLUMNS.put("TB_MDM_RULE_SET_TEST_CASE", List.of("INPUT_JSON", "EXPECTED_JSON"));

        UNIQUE_INDEXES.put("UX_TB_MDM_RULE_VAR_SEQ", false);
        UNIQUE_INDEXES.put("UX_TB_MDM_RULE_VAR_NAME", true);
        UNIQUE_INDEXES.put("UX_TB_MDM_RULE_ROW_SEQ", true);

        CONSTRAINTS.put("TB_MDM_RULE", List.of(
                "PK_TB_MDM_RULE", "FK_TB_MDM_RULE_SYSTEM_SRC", "CK_TB_MDM_RULE_KIND", "CK_TB_MDM_RULE_STATUS",
                "CK_TB_MDM_RULE_SRC_KIND", "CK_TB_MDM_RULE_SRC_SYS"));
        CONSTRAINTS.put("TB_MDM_RULE_SYSTEM", List.of(
                "PK_TB_MDM_RULE_SYSTEM", "FK_TB_MDM_RULE_SYSTEM_RULE", "FK_TB_MDM_RULE_SYSTEM_SYSTEM",
                "CK_TB_MDM_RULE_SYSTEM_KIND"));
        CONSTRAINTS.put("TB_MDM_RULE_VER", List.of(
                "PK_TB_MDM_RULE_VER", "FK_TB_MDM_RULE_VER_RULE", "CK_TB_MDM_RULE_VER_STATUS", "CK_TB_MDM_RULE_VER_KIND", "CK_TB_MDM_RULE_VER_HIT",
                "CK_TB_MDM_RULE_VER_APPLY", "CK_TB_MDM_RULE_VER_EMERGENCY_YN"));
        CONSTRAINTS.put("TB_MDM_RULE_VAR", List.of(
                "PK_TB_MDM_RULE_VAR", "FK_TB_MDM_RULE_VAR_VER", "FK_TB_MDM_RULE_VAR_DOMAIN", "CK_TB_MDM_RULE_VAR_KIND",
                "CK_TB_MDM_RULE_VAR_DISP", "CK_TB_MDM_RULE_VAR_DTYPE",
                "CK_TB_MDM_RULE_VAR_AGG", "CK_TB_MDM_RULE_VAR_RESULT_NAME", "CK_TB_MDM_RULE_VAR_VAR_AST_JSON",
                "CK_TB_MDM_RULE_VAR_PRIO_LIST_JSON", "CK_TB_MDM_RULE_VAR_GRP_COND_AST_JSON"));
        CONSTRAINTS.put("TB_MDM_RULE_ROW", List.of(
                "PK_TB_MDM_RULE_ROW", "FK_TB_MDM_RULE_ROW_VER", "CK_TB_MDM_RULE_ROW_KIND", "CK_TB_MDM_RULE_ROW_CELLS_JSON"));
        CONSTRAINTS.put("TB_MDM_RULE_TEST_CASE", List.of(
                "PK_TB_MDM_RULE_TEST_CASE", "FK_TB_MDM_RULE_TEST_CASE_RULE", "CK_TB_MDM_RULE_TEST_CASE_INPUT_JSON",
                "CK_TB_MDM_RULE_TEST_CASE_EXPECTED_JSON"));
        CONSTRAINTS.put("TB_MDM_RULE_SET", List.of(
                "PK_TB_MDM_RULE_SET", "CK_TB_MDM_RULE_SET_STATUS", "CK_TB_MDM_RULE_SET_RULE_IDS_JSON", "CK_TB_MDM_RULE_SET_FLOW_JSON"));
        CONSTRAINTS.put("TB_MDM_RULE_SET_TEST_CASE", List.of(
                "PK_TB_MDM_RULE_SET_TEST_CASE", "FK_TB_MDM_RULE_SET_TEST_CASE_SET", "CK_TB_MDM_RULE_SET_TEST_CASE_INPUT_JSON",
                "CK_TB_MDM_RULE_SET_TEST_CASE_EXPECTED_JSON"));
        CONSTRAINTS.put("TB_MDM_RULE_RECV", List.of(
                "PK_TB_MDM_RULE_RECV", "FK_TB_MDM_RULE_RECV_RULE", "FK_TB_MDM_RULE_RECV_SYSTEM",
                "CK_TB_MDM_RULE_RECV_REQ", "CK_TB_MDM_RULE_RECV_RESULT"));
    }

    private MdmBusinessRuleExpectations() {
    }

    /** 칼럼 이름 목록(순서 포함) = §6.0 업무 칼럼 + 감사 9칼럼(AUD_VER 테이블은 마지막 칼럼이 AUD_VER). */
    static List<String> expectedColumns(String table) {
        List<String> expected = new ArrayList<>(BUSINESS_COLUMNS.get(table));
        for (String audit : MdmAuditColumns.ALL) {
            expected.add(audit.equals(MdmAuditColumns.VER) && AUD_VER_TABLES.contains(table) ? AUD_VER : audit);
        }
        return expected;
    }

    /** 감사 카운터 칼럼 이름(테이블마다 VER 또는 AUD_VER). */
    static String auditCounter(String table) {
        return AUD_VER_TABLES.contains(table) ? AUD_VER : MdmAuditColumns.VER;
    }

    /** JSON CHECK 이름 — {@code CK_{테이블}_{칼럼}_JSON}. 칼럼 이름이 이미 {@code _JSON} 으로 끝나면 겹쳐 붙이지 않는다. */
    static String jsonCheckName(String table, String column) {
        return "CK_" + table + "_" + column + (column.endsWith("_JSON") ? "" : "_JSON");
    }
}
