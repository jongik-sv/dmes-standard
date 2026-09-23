package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * 실제 버전 테이블 명세(TSK-01-03 B12). 테이블은 TSK-06-01(04)·TSK-08-01(06)이 Flyway 로 만든다.
 *
 * <p>감사 카운터: 버전 테이블은 {@code AUD_VER}, 부모 테이블은 {@code VER}. 업무 버전 칼럼은 {@code VER} 그대로다
 * (decisions D-034 — 감사 VER 와 업무 VER 의 이름 충돌을 버전 테이블의 감사 카운터 개명으로 푼다, docs/mdm/erd/04·06 DDL).
 */
@Component
public class DefaultVersionTableRegistry implements VersionTableRegistry {

    /** 버전 테이블의 감사 카운터(D-034 개명). */
    static final String AUDIT_COUNTER = "AUD_VER";
    /** 부모 테이블의 감사 카운터(규칙표 §2 그대로, MdmAuditColumns.VER). */
    static final String PARENT_AUDIT_COUNTER = MdmAuditColumns.VER;

    @Override
    public VersionTableSpec spec(VersionTarget target) {
        return switch (target) {
            case MASTER_CODE -> new VersionTableSpec(target.versionTable(), "MARU_CODE_ID", "VER",
                    "TB_MDM_CODE", "MARU_CODE_ID", AUDIT_COUNTER, PARENT_AUDIT_COUNTER);
            case BUSINESS_RULE -> new VersionTableSpec(target.versionTable(), "MARU_RULE_ID", "VER",
                    "TB_MDM_RULE", "MARU_RULE_ID", AUDIT_COUNTER, PARENT_AUDIT_COUNTER);
        };
    }
}
