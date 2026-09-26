package com.dongkuk.dmes.mdm;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TSK-07-01 design.md §3.1·§3.3′ — SQLite 마이그레이션 테스트({@code MdmMasterDataMigrationTest} 등)가 보는
 * 기대값을 한 곳에 둔다({@code MdmInterfaceLayoutExpectations} 와 같은 패턴).
 */
final class MdmMasterDataExpectations {

    /** V10 이 만드는 7테이블, DDL 순서 그대로(순환 FK 없음, §1). */
    static final List<String> TABLES = List.of(
            "TB_MDM_DATA", "TB_MDM_DATA_SYSTEM", "TB_MDM_DATA_ITEM", "TB_MDM_DATA_CATE",
            "TB_MDM_DATA_CATE_ITEM", "TB_MDM_DATA_RECV", "TB_MDM_DATA_RECV_ITEM");

    private static final Map<String, Set<String>> BUSINESS_COLUMNS = new LinkedHashMap<>();

    static {
        BUSINESS_COLUMNS.put("TB_MDM_DATA", new LinkedHashSet<>(List.of(
                "MARU_DATA_ID", "MARU_DATA_NAME", "STATUS", "SOURCE_KIND", "SOURCE_SYSTEM", "CODE_PATTERN",
                "DESCRIPTION",
                "ATTR01_NAME", "ATTR02_NAME", "ATTR03_NAME", "ATTR04_NAME", "ATTR05_NAME",
                "ATTR06_NAME", "ATTR07_NAME", "ATTR08_NAME", "ATTR09_NAME", "ATTR10_NAME",
                "LVL_CNT", "CLOSED_AT", "LAST_CHG_SEQ", "CHG_SEQ")));
        BUSINESS_COLUMNS.put("TB_MDM_DATA_SYSTEM", Set.of("MARU_DATA_ID", "SYSTEM_CODE", "DESCRIPTION"));
        BUSINESS_COLUMNS.put("TB_MDM_DATA_ITEM", new LinkedHashSet<>(List.of(
                "MARU_DATA_ID", "CODE", "VALID_FROM", "NAME", "ALTER_NAME", "SEQ", "DESCRIPTION",
                "VALID_TO", "ROW_VERSION", "CHG_SEQ",
                "LVL1", "LVL2", "LVL3", "LVL4", "LVL5",
                "ATTR01", "ATTR02", "ATTR03", "ATTR04", "ATTR05", "ATTR06", "ATTR07", "ATTR08", "ATTR09", "ATTR10")));
        BUSINESS_COLUMNS.put("TB_MDM_DATA_CATE", Set.of(
                "MARU_DATA_ID", "CATE_ID", "VALID_FROM", "CATE_NAME", "DEF_KIND", "DEF_EXPR", "DEF_TARGET",
                "DESCRIPTION", "VALID_TO", "CHG_SEQ"));
        BUSINESS_COLUMNS.put("TB_MDM_DATA_CATE_ITEM", Set.of(
                "MARU_DATA_ID", "CATE_ID", "CODE", "VALID_FROM", "VALID_TO", "CHG_SEQ"));
        BUSINESS_COLUMNS.put("TB_MDM_DATA_RECV", Set.of(
                "RECV_ID", "MARU_DATA_ID", "SOURCE_SYSTEM", "SOURCE_REF", "RECEIVED_AT", "BODY", "ROW_COUNT",
                "RESULT", "RESULT_DETAIL", "CHG_SEQ", "PROCESSED_AT"));
        BUSINESS_COLUMNS.put("TB_MDM_DATA_RECV_ITEM", Set.of("RECV_ID", "SEQ", "CODE", "ACTION"));
    }

    /** F18 — {@code CategoryOwner.MASTER_DATA.allowedDefTargets()}와 정확히 같은 값 집합(정렬 무관). */
    static final Set<String> CATE_ALLOWED_DEF_TARGETS = Set.of(
            "KEY", "LVL1", "LVL2", "LVL3", "LVL4", "LVL5",
            "ATTR01", "ATTR02", "ATTR03", "ATTR04", "ATTR05", "ATTR06", "ATTR07", "ATTR08", "ATTR09", "ATTR10");

    private MdmMasterDataExpectations() {
    }

    /** 테이블 칼럼 이름 집합 = 업무 칼럼 ∪ 감사 9칼럼(예외 없음, 7테이블 전부). */
    static Set<String> expectedColumns(String table) {
        Set<String> expected = new LinkedHashSet<>(BUSINESS_COLUMNS.get(table));
        expected.addAll(MdmAuditColumns.ALL);
        return expected;
    }
}
