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
 * @param missing        MDM 에 없어 검사에서 뺀 정의 {@code 종류:키}(예 {@code COLUMN:TITLE}·{@code RULE_SET:RS_X}, {@code unavailable} 과 같은 표기).
 *                       컬럼 사전에서 이름이 바뀌거나 지워진 경우처럼 MDM 관리 변경이 업무 저장을 막지 않도록 예외 없이 건너뛰고 WARN 을 남긴다.
 *                       받을 수 없음({@code unavailable})과 다르다 — 정의가 없다고 MDM 이 답한 것이다
 */
public record MdmValidationResult(List<ErrorDetail> errors, List<String> unavailable, Map<Integer, List<RuleSetResult>> ruleSetResults,
                                  List<String> missing) {

    public MdmValidationResult {
        errors = List.copyOf(errors);
        unavailable = List.copyOf(unavailable);
        ruleSetResults = Collections.unmodifiableMap(new LinkedHashMap<>(ruleSetResults)); // 행 번호 순서를 지킨다
        missing = List.copyOf(missing);
    }

    /** 오류도 검증 불가도 없다. {@code missing} 은 판정에 넣지 않는다(없는 정의는 건너뛴 것이지 검증하지 못한 것이 아니다). */
    public boolean ok() {
        return errors.isEmpty() && unavailable.isEmpty();
    }
}
