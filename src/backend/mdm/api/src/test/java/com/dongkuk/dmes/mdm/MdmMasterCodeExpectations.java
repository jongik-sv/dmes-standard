package com.dongkuk.dmes.mdm;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TSK-06-01 design.md §2·§6.0 — SQLite({@code MdmMasterCodeMigrationTest}·{@code MdmMasterCodeDialectDdlParityTest})·
 * MSSQL({@code MdmMasterCodeMssqlMigrationTest}) 테스트가 같은 기대값을 보도록 한 곳에 둔다
 * ({@code MdmInterfaceLayoutExpectations} 와 같은 모양).
 */
final class MdmMasterCodeExpectations {

    /** 팀장 배정 버전(D1). V5 는 다른 Task 몫이라 비워 둔다. */
    static final String VERSION = "6";

    /** V6 이 만드는 7테이블. */
    static final Set<String> TABLES = Set.of(
            "TB_MDM_CODE", "TB_MDM_CODE_SYSTEM", "TB_MDM_CODE_VER", "TB_MDM_CODE_ITEM",
            "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM", "TB_MDM_CODE_RECV");

    /** 업무 칼럼 VER 과 이름이 겹쳐 감사 카운터를 AUD_VER 로 둔 표(D-034). 나머지 5표는 감사 VER. */
    static final Set<String> AUD_VER_TABLES = Set.of("TB_MDM_CODE_VER", "TB_MDM_CODE_RECV");

    private static final Map<String, Set<String>> BUSINESS_COLUMNS = new LinkedHashMap<>();
    private static final Map<String, List<String>> PK_COLUMNS = new LinkedHashMap<>();
    private static final Map<String, Set<String>> BIN2 = new LinkedHashMap<>();

    static {
        BUSINESS_COLUMNS.put("TB_MDM_CODE", Set.of(
                "MARU_CODE_ID", "MARU_CODE_NAME", "STATUS", "SOURCE_KIND", "SOURCE_SYSTEM", "DESCRIPTION",
                "ATTR01_NAME", "ATTR02_NAME", "ATTR03_NAME", "ATTR04_NAME", "ATTR05_NAME",
                "ATTR06_NAME", "ATTR07_NAME", "ATTR08_NAME", "ATTR09_NAME", "ATTR10_NAME",
                "LVL_CNT", "LAST_CHG_SEQ"));
        BUSINESS_COLUMNS.put("TB_MDM_CODE_SYSTEM", Set.of("MARU_CODE_ID", "SYSTEM_CODE", "DESCRIPTION"));
        BUSINESS_COLUMNS.put("TB_MDM_CODE_VER", Set.of(
                "MARU_CODE_ID", "VER", "VER_KIND", "RESTORED_FROM", "STATUS", "OWNER_ID", "APPLY_FROM", "APPLY_TO",
                "DESCRIPTION", "REQUESTED_BY", "REQUESTED_AT", "EMERGENCY_YN", "EMERGENCY_REASON", "APPROVED_BY",
                "APPROVED_AT", "REJECT_REASON", "RELEASED_AT", "CANCELLED_AT", "CANCEL_REASON", "ROW_VERSION"));
        BUSINESS_COLUMNS.put("TB_MDM_CODE_ITEM", Set.of(
                "MARU_CODE_ID", "CODE", "FROM_VER", "TO_VER", "NAME", "ALTER_NAME", "SEQ", "DESCRIPTION",
                "LVL1", "LVL2", "LVL3", "LVL4", "LVL5",
                "ATTR01", "ATTR02", "ATTR03", "ATTR04", "ATTR05", "ATTR06", "ATTR07", "ATTR08", "ATTR09", "ATTR10"));
        BUSINESS_COLUMNS.put("TB_MDM_CODE_CATE", Set.of(
                "MARU_CODE_ID", "CATE_ID", "FROM_VER", "TO_VER", "CATE_NAME", "DEF_KIND", "DEF_EXPR", "DEF_TARGET",
                "DESCRIPTION"));
        BUSINESS_COLUMNS.put("TB_MDM_CODE_CATE_ITEM", Set.of("MARU_CODE_ID", "CATE_ID", "CODE", "FROM_VER", "TO_VER"));
        BUSINESS_COLUMNS.put("TB_MDM_CODE_RECV", Set.of(
                "RECV_ID", "MARU_CODE_ID", "SOURCE_SYSTEM", "SOURCE_REF", "REQ_KIND", "RECEIVED_AT", "BODY", "RESULT",
                "RESULT_DETAIL", "VER", "CHG_SEQ", "PROCESSED_AT"));

        PK_COLUMNS.put("TB_MDM_CODE", List.of("MARU_CODE_ID"));
        PK_COLUMNS.put("TB_MDM_CODE_SYSTEM", List.of("MARU_CODE_ID", "SYSTEM_CODE"));
        PK_COLUMNS.put("TB_MDM_CODE_VER", List.of("MARU_CODE_ID", "VER"));
        PK_COLUMNS.put("TB_MDM_CODE_ITEM", List.of("MARU_CODE_ID", "CODE", "FROM_VER"));
        PK_COLUMNS.put("TB_MDM_CODE_CATE", List.of("MARU_CODE_ID", "CATE_ID", "FROM_VER"));
        PK_COLUMNS.put("TB_MDM_CODE_CATE_ITEM", List.of("MARU_CODE_ID", "CATE_ID", "CODE", "FROM_VER"));
        PK_COLUMNS.put("TB_MDM_CODE_RECV", List.of("RECV_ID"));

        BIN2.put("TB_MDM_CODE", Set.of("MARU_CODE_ID", "STATUS", "SOURCE_KIND", "SOURCE_SYSTEM"));
        BIN2.put("TB_MDM_CODE_SYSTEM", Set.of("MARU_CODE_ID", "SYSTEM_CODE"));
        BIN2.put("TB_MDM_CODE_VER", Set.of(
                "MARU_CODE_ID", "VER_KIND", "STATUS", "OWNER_ID", "REQUESTED_BY", "EMERGENCY_YN", "APPROVED_BY"));
        BIN2.put("TB_MDM_CODE_ITEM", Set.of("MARU_CODE_ID", "CODE", "LVL1", "LVL2", "LVL3", "LVL4", "LVL5"));
        BIN2.put("TB_MDM_CODE_CATE", Set.of("MARU_CODE_ID", "CATE_ID", "DEF_KIND", "DEF_TARGET"));
        BIN2.put("TB_MDM_CODE_CATE_ITEM", Set.of("MARU_CODE_ID", "CATE_ID", "CODE"));
        BIN2.put("TB_MDM_CODE_RECV", Set.of("MARU_CODE_ID", "SOURCE_SYSTEM", "SOURCE_REF", "REQ_KIND", "RESULT"));
    }

    /** 표 → 제약 이름(PK·FK·CK). 두 방언이 같은 이름을 쓴다(§6.0). */
    static final Map<String, Set<String>> CONSTRAINTS = Map.of(
            "TB_MDM_CODE", Set.of("PK_TB_MDM_CODE", "FK_TB_MDM_CODE_SYSTEM_SRC", "CK_TB_MDM_CODE_STATUS",
                    "CK_TB_MDM_CODE_SRC_KIND", "CK_TB_MDM_CODE_SRC_SYS", "CK_TB_MDM_CODE_LVL_CNT"),
            "TB_MDM_CODE_SYSTEM", Set.of("PK_TB_MDM_CODE_SYSTEM", "FK_TB_MDM_CODE_SYSTEM_CODE",
                    "FK_TB_MDM_CODE_SYSTEM_SYSTEM"),
            "TB_MDM_CODE_VER", Set.of("PK_TB_MDM_CODE_VER", "FK_TB_MDM_CODE_VER_CODE", "CK_TB_MDM_CODE_VER_KIND",
                    "CK_TB_MDM_CODE_VER_STATUS", "CK_TB_MDM_CODE_VER_APPLY", "CK_TB_MDM_CODE_VER_EMERGENCY_YN"),
            "TB_MDM_CODE_ITEM", Set.of("PK_TB_MDM_CODE_ITEM", "FK_TB_MDM_CODE_ITEM_CODE", "FK_TB_MDM_CODE_ITEM_VER",
                    "CK_TB_MDM_CODE_ITEM_CODE"),
            "TB_MDM_CODE_CATE", Set.of("PK_TB_MDM_CODE_CATE", "FK_TB_MDM_CODE_CATE_CODE", "FK_TB_MDM_CODE_CATE_VER",
                    "CK_TB_MDM_CODE_CATE_KIND", "CK_TB_MDM_CODE_CATE_DEF"),
            "TB_MDM_CODE_CATE_ITEM", Set.of("PK_TB_MDM_CODE_CATE_ITEM", "FK_TB_MDM_CODE_CATE_ITEM_CODE",
                    "FK_TB_MDM_CODE_CATE_ITEM_VER"),
            "TB_MDM_CODE_RECV", Set.of("PK_TB_MDM_CODE_RECV", "FK_TB_MDM_CODE_RECV_CODE", "FK_TB_MDM_CODE_RECV_SYSTEM",
                    "CK_TB_MDM_CODE_RECV_REQ", "CK_TB_MDM_CODE_RECV_RESULT"));

    /** 버전 번호 칼럼(DECIMAL(7,3)/NUMERIC(7,3), 04:271·994, 규칙표 #17). 표 → 칼럼. */
    static final Map<String, Set<String>> VERSION_NUMBER_COLUMNS = Map.of(
            "TB_MDM_CODE_VER", Set.of("VER", "RESTORED_FROM"),
            "TB_MDM_CODE_ITEM", Set.of("FROM_VER", "TO_VER"),
            "TB_MDM_CODE_CATE", Set.of("FROM_VER", "TO_VER"),
            "TB_MDM_CODE_CATE_ITEM", Set.of("FROM_VER", "TO_VER"),
            "TB_MDM_CODE_RECV", Set.of("VER"));

    /** 업무 일시 8칼럼(MSSQL DATETIME2(0), SQLite TEXT, 규칙표 #16). 표 → 칼럼. */
    static final Map<String, Set<String>> BUSINESS_DATETIME_COLUMNS = Map.of(
            "TB_MDM_CODE_VER", Set.of("APPLY_FROM", "APPLY_TO", "REQUESTED_AT", "APPROVED_AT", "RELEASED_AT",
                    "CANCELLED_AT"),
            "TB_MDM_CODE_RECV", Set.of("RECEIVED_AT", "PROCESSED_AT"));

    private MdmMasterCodeExpectations() {
    }

    /** 테이블 칼럼 이름 집합 = 업무 칼럼 ∪ 감사 9칼럼(AUD_VER 표는 감사 VER 대신 AUD_VER). */
    static Set<String> expectedColumns(String table) {
        Set<String> expected = new LinkedHashSet<>(BUSINESS_COLUMNS.get(table));
        for (String audit : MdmAuditColumns.ALL) {
            expected.add(AUD_VER_TABLES.contains(table) && audit.equals(MdmAuditColumns.VER) ? "AUD_VER" : audit);
        }
        return expected;
    }

    /** 감사 카운터 칼럼 이름(D-034). */
    static String auditCounter(String table) {
        return AUD_VER_TABLES.contains(table) ? "AUD_VER" : MdmAuditColumns.VER;
    }

    /** PK 칼럼 순서(§6.0, 불변 규칙 5). */
    static List<String> pkColumns(String table) {
        return PK_COLUMNS.get(table);
    }

    /** MSSQL 에서 {@code COLLATE Latin1_General_100_BIN2} 여야 하는 칼럼(§6.0 BIN2 목록, 규칙표 #19). */
    static Set<String> bin2Columns(String table) {
        return BIN2.get(table);
    }
}
