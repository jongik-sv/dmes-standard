package com.dongkuk.dmes.mdm.common.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 담당자 조회 어댑터가 없을 때의 기본 구현(TSK-01-03 B9, D7). 항상 false 라 넘기기는 MDM005 로 거부된다(fail-closed).
 * mdm 은 다른 사용자의 역할을 볼 수단이 없다 — 권한 테이블은 mcm DB 에 있고 조회 API 는 본인만 돌려준다(F40).
 */
@Component
public class UnresolvedStewardDirectory implements MdmStewardDirectory {

    private static final Logger log = LoggerFactory.getLogger(UnresolvedStewardDirectory.class);

    @Override
    public boolean isSteward(String userId) {
        log.warn("담당자 조회 어댑터가 없어 넘기기를 거부합니다(TSK-01-03 D7): target={}", userId);
        return false;
    }
}
