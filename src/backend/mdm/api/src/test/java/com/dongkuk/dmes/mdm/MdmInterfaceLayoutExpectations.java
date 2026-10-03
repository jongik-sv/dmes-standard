package com.dongkuk.dmes.mdm;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TSK-05-01 design.md §3.1·§3.2 — SQLite 마이그레이션 테스트({@code MdmInterfaceLayoutMigrationTest} 등)가 보는
 * 기대값을 한 곳에 둔다({@code MdmDictionaryExpectations} 와 같은 패턴). design.md §2 에 이 파일이 명시돼 있지 않았다
 * — TSK-04-01 이 {@code ContractStubCompileTest} 확장에서 남긴 것과 같은 종류의 design 누락이며,
 * 두 테스트 파일의 중복을 피하려고 이 Phase 에서 새로 추가한다(design.md 이탈 기록 참고).
 *
 * <p>D-144 3단계 — 기대값은 V21(레이아웃 버전) 모양이다. 부모 {@code TB_MDM_LAYOUT} 에서 EAI_CODE·TOTAL_LENGTH·VERSION 이
 * 빠지고 STATUS 가 생겼다. 버전 표 4개(VER·ITEM·HEADER·CONST)는 업무 버전 {@code VER NUMERIC(7,3)} 가 키이고 감사 카운터는
 * {@code AUD_VER} 다(D-034). 부모와 EAI 의 감사 카운터는 {@code VER} 그대로다.
 *
 * <p>D-151 — V22 가 항목 표를 다시 만들어 확정 고정값 칸(DATA_TYPE·UNIT_CODE·SCALE)과 고정 표시(PINNED_YN)를 LENGTH 뒤에 더했다
 * (단위는 단위 원장 FK, 고정 표시는 Y·N 이고 'N' 이면 세 칸이 비어 있다).
 */
final class MdmInterfaceLayoutExpectations {

    /** V4 가 만들고 V21 가 다시 만든 6테이블(전부 업무 활성 테이블, D4). */
    static final Set<String> TABLES = Set.of(
            "TB_MDM_EAI", "TB_MDM_LAYOUT", "TB_MDM_LAYOUT_VER", "TB_MDM_LAYOUT_ITEM", "TB_MDM_LAYOUT_HEADER", "TB_MDM_LAYOUT_CONST");

    /** 감사 칼럼 중 카운터를 뺀 8칼럼(순서대로). */
    private static final List<String> AUDIT_STAMPS = List.of(
            "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");

    private static final Map<String, List<String>> BUSINESS_COLUMNS = new LinkedHashMap<>();
    private static final Map<String, String> AUDIT_COUNTER = new LinkedHashMap<>();
    private static final Map<String, Set<String>> CONSTRAINTS = new LinkedHashMap<>();

    static {
        BUSINESS_COLUMNS.put("TB_MDM_EAI", List.of(
                "EAI_CODE", "EAI_NAME", "ENCODING", "PAD_RULE", "HEADER_LAYOUT_ID"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT", List.of(
                "LAYOUT_ID", "LAYOUT_KIND", "LAYOUT_NAME", "SND_SYSTEM", "RCV_SYSTEM", "STATUS"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT_VER", List.of(
                "LAYOUT_ID", "VER", "VER_KIND", "STATUS", "BASE_VER", "OWNER_ID", "APPLY_FROM", "APPLY_TO",
                "REQUESTED_BY", "REQUESTED_AT", "RELEASED_AT", "ROW_VERSION", "EAI_CODE", "OWN_LENGTH",
                "SWITCH_MODE", "CHANGE_KINDS", "CHANGE_SUMMARY", "SNAPSHOT_JSON", "LEGACY_SNAPSHOT_YN"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT_ITEM", List.of(
                "LAYOUT_ID", "VER", "SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT",
                "DEFAULT_VALUE", "FILLER_LENGTH", "OFFSET", "LENGTH", "DATA_TYPE", "UNIT_CODE", "SCALE",
                "PINNED_YN"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT_HEADER", List.of("LAYOUT_ID", "VER", "SEQ", "HEADER_LAYOUT_ID"));
        BUSINESS_COLUMNS.put("TB_MDM_LAYOUT_CONST", List.of(
                "LAYOUT_ID", "VER", "HEADER_LAYOUT_ID", "HEADER_COLUMN_PHYS", "CONST_VALUE"));

        AUDIT_COUNTER.put("TB_MDM_EAI", "VER");
        AUDIT_COUNTER.put("TB_MDM_LAYOUT", "VER");
        AUDIT_COUNTER.put("TB_MDM_LAYOUT_VER", "AUD_VER");
        AUDIT_COUNTER.put("TB_MDM_LAYOUT_ITEM", "AUD_VER");
        AUDIT_COUNTER.put("TB_MDM_LAYOUT_HEADER", "AUD_VER");
        AUDIT_COUNTER.put("TB_MDM_LAYOUT_CONST", "AUD_VER");

        CONSTRAINTS.put("TB_MDM_EAI", Set.of("PK_TB_MDM_EAI", "FK_TB_MDM_EAI_LAYOUT"));
        CONSTRAINTS.put("TB_MDM_LAYOUT", Set.of(
                "PK_TB_MDM_LAYOUT", "FK_TB_MDM_LAYOUT_SYSTEM_SND", "FK_TB_MDM_LAYOUT_SYSTEM_RCV",
                "CK_TB_MDM_LAYOUT_KIND", "CK_TB_MDM_LAYOUT_STATUS"));
        CONSTRAINTS.put("TB_MDM_LAYOUT_VER", Set.of(
                "PK_TB_MDM_LAYOUT_VER", "FK_TB_MDM_LAYOUT_VER_LAYOUT", "FK_TB_MDM_LAYOUT_VER_EAI",
                "CK_TB_MDM_LAYOUT_VER_SNAPSHOT_JSON", "CK_TB_MDM_LAYOUT_VER_STATUS", "CK_TB_MDM_LAYOUT_VER_KIND",
                "CK_TB_MDM_LAYOUT_VER_APPLY", "CK_TB_MDM_LAYOUT_VER_SWITCH", "CK_TB_MDM_LAYOUT_VER_LEGACY"));
        CONSTRAINTS.put("TB_MDM_LAYOUT_ITEM", Set.of(
                "PK_TB_MDM_LAYOUT_ITEM", "FK_TB_MDM_LAYOUT_ITEM_VER", "FK_TB_MDM_LAYOUT_ITEM_COLUMN",
                "FK_TB_MDM_LAYOUT_ITEM_UNIT", "FK_TB_MDM_LAYOUT_ITEM_UNIT_CODE", "CK_TB_MDM_LAYOUT_ITEM_FILL_KIND",
                "CK_TB_MDM_LAYOUT_ITEM_UNIT", "CK_TB_MDM_LAYOUT_ITEM_PINNED"));
        CONSTRAINTS.put("TB_MDM_LAYOUT_HEADER", Set.of(
                "PK_TB_MDM_LAYOUT_HEADER", "FK_TB_MDM_LAYOUT_HEADER_VER", "FK_TB_MDM_LAYOUT_HEADER_HEADER"));
        CONSTRAINTS.put("TB_MDM_LAYOUT_CONST", Set.of("PK_TB_MDM_LAYOUT_CONST", "FK_TB_MDM_LAYOUT_CONST_HEADER"));
    }

    /** 6테이블에 걸린 인덱스(자동 인덱스 제외). */
    static final Set<String> INDEXES = Set.of("UX_TB_MDM_LAYOUT_HEADER_HDR");

    private MdmInterfaceLayoutExpectations() {
    }

    /** 테이블 칼럼 이름 목록(DDL 순서) = 업무 칼럼 + 감사 8칼럼 + 감사 카운터(VER 또는 AUD_VER). */
    static List<String> expectedColumns(String table) {
        List<String> expected = new ArrayList<>(BUSINESS_COLUMNS.get(table));
        expected.addAll(AUDIT_STAMPS);
        expected.add(AUDIT_COUNTER.get(table));
        return expected;
    }

    /** 감사 카운터 칼럼 이름 — 부모·EAI 는 VER, 버전 표 4개는 AUD_VER(D-034). */
    static String auditCounter(String table) {
        return AUDIT_COUNTER.get(table);
    }

    /** 테이블 DDL 의 {@code CONSTRAINT <이름>} 전부(PK·FK·CHECK). */
    static Set<String> expectedConstraints(String table) {
        return CONSTRAINTS.get(table);
    }
}
