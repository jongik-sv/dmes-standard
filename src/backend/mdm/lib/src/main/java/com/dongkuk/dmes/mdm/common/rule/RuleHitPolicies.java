package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import java.util.Set;
import java.util.TreeSet;

/**
 * 적중 정책({@code TB_MDM_RULE_VER.HIT_POLICY}) 정규화 — {@code CK_TB_MDM_RULE_VER_HIT} 와 같은 값 집합이다.
 *
 * <p>D-105 (4) 전에는 이 규칙이 {@code RuleTableService.hitPolicy} 한 곳에만 있었고, {@code RuleValueTestService} 가 그것을
 * 빌려 썼다. D-105 로 <b>쓰는 화면이 셋</b>(버전 저장·표 저장·값 테스트)이 되었으므로 룰 공용 영역으로 꺼냈다. 화면이
 * 바뀌어도 판정은 한 곳에 남아야 한다.
 */
public final class RuleHitPolicies {

    /** FIRST·UNIQUE·PRIORITY·COLLECT·ANY — DDL CHECK 와 같은 값 집합. */
    public static final Set<String> VALUES = Set.of("FIRST", "UNIQUE", "PRIORITY", "COLLECT", "ANY");

    private RuleHitPolicies() {
    }

    /**
     * 정규화 — DECISION 은 다섯 정책 중 하나가 필수이고, DERIVE 는 비어 있어야 한다.
     *
     * @param ruleKind {@code DECISION} 또는 {@code DERIVE}
     * @param raw 화면이 준 값. null·빈 문자열이면 정규화 대상이 없는 값으로 본다
     * @return 정규화된 정책. DERIVE 는 항상 null
     * @throws BusinessException 값이 규칙에 맞지 않을 때
     */
    public static String normalize(String ruleKind, String raw) {
        String hit = raw == null || raw.isBlank() ? null : raw.trim();
        if ("DERIVE".equals(ruleKind)) {
            if (hit != null) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "산출 룰에는 적중 정책을 두지 않습니다: " + hit);
            }
            return null;
        }
        if (hit == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "적중 정책은 필수입니다.");
        }
        if (!VALUES.contains(hit)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "적중 정책은 " + String.join("·", new TreeSet<>(VALUES)) + " 중 하나여야 합니다: " + hit);
        }
        return hit;
    }
}
