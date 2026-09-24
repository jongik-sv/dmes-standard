package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.dma.naming.NamingRules;

/**
 * 룰 ID 규칙 — 컬럼 물리명 규칙과 같다(TSK-08-02 design I1, 수용 기준 1). 서버가 판정하고 화면 검사는 보조다.
 * 정규식 {@link NamingRules#STD_PHYS_NAME}, 길이 {@link NamingRules#CODE_MAX} 이하(컬럼 사전 {@code ColumnMngService} 와 같은 두 가지).
 */
public final class RuleIdRules {

    static final String MESSAGE = "룰 ID 는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이은 형식, 50자 이하)을 따라야 합니다";

    private RuleIdRules() {
    }

    public static void validateRuleId(String id) {
        if (id == null || id.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 ID 는 필수입니다.");
        }
        if (id.length() > NamingRules.CODE_MAX || !NamingRules.STD_PHYS_NAME.matcher(id).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, MESSAGE + ": " + id);
        }
    }
}
