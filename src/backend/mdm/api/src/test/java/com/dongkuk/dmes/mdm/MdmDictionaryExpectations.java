package com.dongkuk.dmes.mdm;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * TSK-04-01 design.md §3.1·§3.2 — SQLite 마이그레이션 테스트(T13)가 보는 기대값을 한 곳에 둔다
 * ({@code MdmSystemSeedExpectations} 와 같은 패턴).
 */
final class MdmDictionaryExpectations {

    /** V3 가 만드는 7테이블. */
    static final Set<String> TABLES = Set.of(
            "TB_MDM_UNIT", "TB_MDM_TERM", "TB_MDM_DOMAIN", "TB_MDM_COLUMN",
            "TB_MDM_COLUMN_SYSTEM", "TB_MDM_DICT_SEQ", "TB_MDM_DICT_SYSTEM");

    /** 엔티티·리포지토리가 붙는 5테이블(D2 — DICT_SEQ·DICT_SYSTEM 제외). */
    static final Set<String> ENTITY_TABLES = Set.of(
            "TB_MDM_UNIT", "TB_MDM_TERM", "TB_MDM_DOMAIN", "TB_MDM_COLUMN", "TB_MDM_COLUMN_SYSTEM");

    /** §3.2-③ — json_extract 를 경로 문법으로 확인할 때 쓰는 픽스처. */
    static final String JSON_VALUE_FIXTURE = "{\"type\":\"foo\"}";
    static final String JSON_VALUE_EXPECTED = "foo";

    /** 불변 규칙 12 — JSON CHECK 대상은 정확히 8칼럼(TERM 3·DOMAIN 4·COLUMN 1). */
    static final Set<String> JSON_CHECK_NAMES = Set.of(
            "CK_TB_MDM_TERM_SYNONYMS_JSON", "CK_TB_MDM_TERM_ALIASES_JSON", "CK_TB_MDM_TERM_SYSTEMS_JSON",
            "CK_TB_MDM_DOMAIN_STD_AST_JSON", "CK_TB_MDM_DOMAIN_BIZ_AST_JSON",
            "CK_TB_MDM_DOMAIN_EXAMPLES_JSON", "CK_TB_MDM_DOMAIN_TEST_CASES_JSON",
            "CK_TB_MDM_COLUMN_TERM_IDS_JSON");

    private static final Map<String, Set<String>> BUSINESS_COLUMNS = new LinkedHashMap<>();
    private static final Set<String> AUDIT_EXEMPT = Set.of("TB_MDM_DICT_SEQ");

    static {
        BUSINESS_COLUMNS.put("TB_MDM_UNIT", Set.of("UNIT_CODE", "DIMENSION", "BASE_UNIT", "FACTOR", "CHG_SEQ"));
        BUSINESS_COLUMNS.put("TB_MDM_TERM", Set.of(
                "TERM_ID", "TERM_NAME", "SENSE_NO", "DEFINITION", "CONTEXT", "ENG_NAME", "ENG_ABBR",
                "SYNONYMS", "ALIASES", "SYSTEMS", "STD_BASIS", "OWNER_DEPT", "OWNER_ID", "SRC_ORIGIN",
                "EMBEDDING", "EMBEDDING_MODEL"));
        BUSINESS_COLUMNS.put("TB_MDM_DOMAIN", Set.of(
                "DOMAIN_ID", "DOMAIN_NAME", "STD_NAME", "PARENT_DOMAIN_ID", "DOMAIN_KIND", "DATA_TYPE",
                "LENGTH", "SCALE", "UNIT_CODE", "MARU_CODE_ID", "CATE_ID", "STD_RULE", "STD_AST",
                "BIZ_RULE", "BIZ_AST", "DESCRIPTION", "EXAMPLES", "TEST_CASES", "CHG_SEQ"));
        BUSINESS_COLUMNS.put("TB_MDM_COLUMN", Set.of(
                "COLUMN_ID", "COLUMN_NAME", "LABEL_LONG", "LABEL_MID", "LABEL_SHORT", "PHYS_NAME",
                "DESCRIPTION", "DOMAIN_ID", "REQUIRED", "DEFAULT_VALUE", "REF_KIND", "REF_TARGET",
                "REF_CATE_ID", "TERM_IDS", "USAGE_NOTE", "CHG_SEQ"));
        BUSINESS_COLUMNS.put("TB_MDM_COLUMN_SYSTEM", Set.of(
                "COLUMN_ID", "SYSTEM_CODE", "PHYS_NAME", "TRANSFORM", "NOTE"));
        BUSINESS_COLUMNS.put("TB_MDM_DICT_SEQ", Set.of("DICT_CODE", "LAST_CHG_SEQ"));
        BUSINESS_COLUMNS.put("TB_MDM_DICT_SYSTEM", Set.of("DICT_CODE", "SYSTEM_CODE", "NOTE"));
    }

    private MdmDictionaryExpectations() {
    }

    /** 테이블 칼럼 이름 집합 = 업무 칼럼 ∪ 감사 9칼럼(TB_MDM_DICT_SEQ 는 감사 칼럼 예외). */
    static Set<String> expectedColumns(String table) {
        Set<String> expected = new LinkedHashSet<>(BUSINESS_COLUMNS.get(table));
        if (!AUDIT_EXEMPT.contains(table)) {
            expected.addAll(MdmAuditColumns.ALL);
        }
        return expected;
    }

    /** term-embedding.md PoC — L2 정규화 float32 little-endian 1024개(4,096바이트) 고정 길이 픽스처. */
    static byte[] embeddingFixture() {
        java.nio.ByteBuffer buffer = java.nio.ByteBuffer.allocate(4096).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < 1024; i++) {
            buffer.putFloat((float) Math.sin(i));
        }
        return buffer.array();
    }
}
