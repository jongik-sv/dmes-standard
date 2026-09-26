package com.dongkuk.dmes.mdm;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import com.dongkuk.dmes.mdm.contract.common.MdmSystemCodes;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TSK-01-02 design.md §3.3 끝 — SQLite 마이그레이션 테스트(T11)가 보는 기대값을 한 곳에 둔다.
 * 코드 집합·자기 행·감사 칼럼은 계약 상수에서 가져오고, 이름(D10)만 여기 적는다.
 */
final class MdmSystemSeedExpectations {

    /** D10 — 초기 행 이름. 키 집합은 {@link MdmSystemCodes#SEEDED} 와 같아야 한다. */
    static final Map<String, String> SEED_NAMES = Map.of(
            "ERP", "ERP", "MES", "MES", "APS", "APS", "DKMS", "DKMS", "L2", "레벨2", "MDM", "마루 MDM");

    static final String SELF_CODE = MdmSystemCodes.SELF;

    static final String SEED_AUDIT_USER = "SYSTEM";

    static final String UPPER_SNAKE = "^[A-Z][A-Z0-9_]*$";

    static final String INSERT_SYSTEM =
            "INSERT INTO TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN) VALUES (?, ?, ?)";

    private MdmSystemSeedExpectations() {
    }

    static Set<String> seededCodes() {
        return new LinkedHashSet<>(MdmSystemCodes.SEEDED);
    }

    /** TB_MDM_SYSTEM 칼럼 이름 집합 = 업무 3칼럼 ∪ 감사 9칼럼. */
    static Set<String> expectedColumns() {
        Set<String> expected = new LinkedHashSet<>(List.of("SYSTEM_CODE", "SYSTEM_NAME", "SELF_YN"));
        expected.addAll(MdmAuditColumns.ALL);
        return expected;
    }
}
