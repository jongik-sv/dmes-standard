package com.dongkuk.dmes.mdm;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TSK-06-01 design.md §2·§6.0 — SQLite 마이그레이션 테스트({@code MdmMasterCodeMigrationTest} 등)가 같은 기대값을 보도록
 * 한 곳에 둔다({@code MdmInterfaceLayoutExpectations} 와 같은 모양).
 */
final class MdmMasterCodeExpectations {

    /** 머지 시점 최대 버전 V8 + 1(D1 — 당초 팀장 배정 V6, 2026-09-24 팀장 정정으로 재채번). */
    static final String VERSION = "9";

    /** V9 가 만드는 7테이블. */
    static final Set<String> TABLES = Set.of(
            "TB_MDM_CODE", "TB_MDM_CODE_SYSTEM", "TB_MDM_CODE_VER", "TB_MDM_CODE_ITEM",
            "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM", "TB_MDM_CODE_RECV");

    /** 업무 칼럼 VER 과 이름이 겹쳐 감사 카운터를 AUD_VER 로 둔 표(D-034). 나머지 5표는 감사 VER. */
    static final Set<String> AUD_VER_TABLES = Set.of("TB_MDM_CODE_VER", "TB_MDM_CODE_RECV");

    private static final Map<String, Set<String>> BUSINESS_COLUMNS = new LinkedHashMap<>();
    private static final Map<String, List<String>> PK_COLUMNS = new LinkedHashMap<>();

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
    }

    /** 표 → 제약 이름(PK·FK·CK)(§6.0). */
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

    /** 버전 번호 칼럼(NUMERIC(7,3), 04:271·994, 규칙표 #17). 표 → 칼럼. */
    static final Map<String, Set<String>> VERSION_NUMBER_COLUMNS = Map.of(
            "TB_MDM_CODE_VER", Set.of("VER", "RESTORED_FROM"),
            "TB_MDM_CODE_ITEM", Set.of("FROM_VER", "TO_VER"),
            "TB_MDM_CODE_CATE", Set.of("FROM_VER", "TO_VER"),
            "TB_MDM_CODE_CATE_ITEM", Set.of("FROM_VER", "TO_VER"),
            "TB_MDM_CODE_RECV", Set.of("VER"));

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
}
