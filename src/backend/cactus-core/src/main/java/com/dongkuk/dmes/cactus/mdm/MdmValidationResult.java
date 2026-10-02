package com.dongkuk.dmes.cactus.mdm;

import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;

/**
 * 저장 검증 결과(하위 프로젝트 C spec §6.1).
 *
 * @param errors         값 오류(필수 E001, 그 밖 E002). {@code field} 는 요청 행의 원래 키
 * @param unavailable    검증하지 못한 정의 {@code 종류:키}(예 {@code COLUMN:TITLE}·{@code CODE:PROC_CD}, 마루 데이터 MASTER 는
 *                       {@code MASTER:ID}). 그 정의가 필요한 컬럼·룰 세트는 검사하지 않았다
 * @param ruleSetResults 행 번호(요청 목록 자리) → 룰 세트 판정 결과. 받는 노드가 받아 처리한 것({@code caught})·결과값({@code finalValues})의
 *                       판정은 호출자 몫이다(C8)
 */
public record MdmValidationResult(List<ErrorDetail> errors, List<String> unavailable, Map<Integer, List<RuleSetResult>> ruleSetResults) {

    public MdmValidationResult {
        errors = List.copyOf(errors);
        unavailable = List.copyOf(unavailable);
        ruleSetResults = Collections.unmodifiableMap(new LinkedHashMap<>(ruleSetResults)); // 행 번호 순서를 지킨다
    }

    /** 오류도 검증 불가도 없다. */
    public boolean ok() {
        return errors.isEmpty() && unavailable.isEmpty();
    }
}
