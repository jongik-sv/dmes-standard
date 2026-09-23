package com.dongkuk.dmes.mdm;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * TSK-05-01 design.md §3.1·§3.2 — SQLite({@code MdmInterfaceLayoutMigrationTest})·MSSQL({@code
 * MdmInterfaceLayoutMssqlMigrationTest}) 양쪽 마이그레이션 테스트가 같은 기대값을 보도록 한 곳에
 * 둔다({@code MdmDictionaryExpectations} 와 같은 패턴). design.md §2 에 이 파일이 명시돼 있지 않았다
 * — TSK-04-01 이 {@code ContractStubCompileTest} 확장에서 남긴 것과 같은 종류의 design 누락이며,
 * 두 테스트 파일의 중복을 피하려고 이 Phase 에서 새로 추가한다(design.md 이탈 기록 참고).
 */
final class MdmInterfaceLayoutExpectations {

    /** V4 가 만드는 5테이블(전부 업무 활성 테이블, D4). */
    static final Set<String> TABLES = Set.of(
            "TB_MDM_EAI", "TB_MDM_LAYOUT", "TB_MDM_LAYOUT_ITEM", "TB_MDM_LAYOUT_HEADER", "TB_MDM_LAYOUT_CONST");

    private static final Map<String, Set<String>> BUSINESS_COLUMNS = new LinkedHashMap<>();

    static {
        BUSINESS_COLUMNS.put("TB_MDM_EAI", Set.of(
                "EAI_CODE", "EAI_NAME", "ENCODING", "PAD_RULE", "HEADER_LAYOUT_ID"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT", Set.of(
                "LAYOUT_ID", "LAYOUT_KIND", "LAYOUT_NAME", "EAI_CODE", "SND_SYSTEM", "RCV_SYSTEM",
                "TOTAL_LENGTH", "VERSION"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT_ITEM", Set.of(
                "LAYOUT_ID", "SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT",
                "DEFAULT_VALUE", "FILLER_LENGTH", "OFFSET", "LENGTH"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT_HEADER", Set.of("LAYOUT_ID", "SEQ", "HEADER_LAYOUT_ID"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT_CONST", Set.of(
                "LAYOUT_ID", "HEADER_LAYOUT_ID", "HEADER_SEQ", "CONST_VALUE"));
    }

    private MdmInterfaceLayoutExpectations() {
    }

    /** 테이블 칼럼 이름 집합 = 업무 칼럼 ∪ 감사 9칼럼(예외 없음, 5테이블 전부 업무 활성 테이블). */
    static Set<String> expectedColumns(String table) {
        Set<String> expected = new LinkedHashSet<>(BUSINESS_COLUMNS.get(table));
        expected.addAll(MdmAuditColumns.ALL);
        return expected;
    }
}
