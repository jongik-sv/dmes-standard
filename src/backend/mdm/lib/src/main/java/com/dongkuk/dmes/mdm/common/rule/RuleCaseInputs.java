package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;

/**
 * 테스트 케이스 입력·기대 JSON 검사 — 룰 케이스({@code RuleTestCaseService})와 룰 세트 케이스({@code RuleSetTestCaseService})가 같이 쓴다.
 * 룰 케이스 서비스에서 옮긴 것이고 동작은 그대로다.
 */
public final class RuleCaseInputs {

    /** 뒤에 붙은 글자가 있으면 거부한다 — 기본 설정은 첫 값만 읽고 나머지를 버려 DB CHECK 에서야 걸린다. */
    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private RuleCaseInputs() {
    }

    /** 길이 상한(MDM021)을 먼저 보고, JSON 객체가 아니면 INVALID_VALUE(DB CHECK 전에). */
    public static void requireObject(String what, String json) {
        if (json.length() > RuleLimits.MAX_CASE_JSON_CHARS) {
            throw limit(what + " JSON 이 " + json.length() + "자다. " + RuleLimits.MAX_CASE_JSON_CHARS + "자까지 받는다");
        }
        JsonNode node;
        try {
            node = JSON.readTree(json);
        } catch (JsonProcessingException e) {
            node = null;
        }
        if (node == null || !node.isObject()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, what + " JSON 은 JSON 객체({…})여야 합니다.");
        }
    }

    /** MDM021 「테스트 케이스 상한 — …」. */
    public static BusinessException limit(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, "테스트 케이스 상한 — " + detail, List.of());
    }
}
