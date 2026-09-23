package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * 실제 버전 테이블 명세(TSK-01-03 B12). 테이블은 TSK-06-01(04)·TSK-08-01(06)이 Flyway 로 만든다.
 *
 * <p>잠정값: 감사 카운터 칼럼 이름은 TSK-06-01·08-01 이 F25(감사 VER 와 업무 VER 이름 충돌)를 해결한 뒤 채운다(D2).
 * 그때 {@code DefaultVersionTableRegistryTest} 도 함께 고친다.
 */
@Component
public class DefaultVersionTableRegistry implements VersionTableRegistry {

    @Override
    public VersionTableSpec spec(VersionTarget target) {
        return switch (target) {
            case MASTER_CODE -> new VersionTableSpec(target.versionTable(), "MARU_CODE_ID", "VER",
                    "TB_MDM_CODE", "MARU_CODE_ID", null);
            case BUSINESS_RULE -> new VersionTableSpec(target.versionTable(), "MARU_RULE_ID", "VER",
                    "TB_MDM_RULE", "MARU_RULE_ID", null);
        };
    }
}
