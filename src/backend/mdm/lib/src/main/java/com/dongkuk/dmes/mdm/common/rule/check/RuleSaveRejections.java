package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 룰 저장 거부 예외(TSK-08-04 design D2). OASIS 서비스 예외는 {@code meta.message} 만 화면에 가므로 메시지 본문에 ERROR 이슈의 코드와
 * 요약을 잇는다. details 는 {@code DomainRejections} 모양(첫 행 MDM 코드, 뒤 행 이슈)이다. 새 MDM 코드를 만들지 않고
 * {@code MDM021 INVALID_INPUT} 을 쓴다(D-096 원칙). {@code MdmErrors.raw} 를 거쳐 {@code meta.code} 가 MDM021 이다(2026-10-05).
 */
public final class RuleSaveRejections {

    public static final String PREFIX = "룰 저장 거부: ";

    private RuleSaveRejections() {
    }

    /** ERROR 이슈만 메시지와 details 에 싣는다. 이슈 message 는 이미 "행 r·열" 을 앞에 두고 있다. */
    public static BusinessException reject(List<Map<String, Object>> issues) {
        List<Map<String, Object>> errors = issues.stream().filter(RuleCheckReport::isError).toList();
        MdmErrorCode code = MdmErrorCode.INVALID_INPUT;
        String summary = errors.stream().map(i -> i.get("code") + " " + i.get("message")).collect(Collectors.joining("; "));
        List<ErrorDetail> details = new ArrayList<>(1 + errors.size());
        details.add(ErrorDetail.of(code.code(), code.defaultMessage()));
        for (Map<String, Object> i : errors) {
            String rowKey = i.get("rowIds") instanceof List<?> ids && !ids.isEmpty()
                    ? "row:" + ids.stream().map(String::valueOf).collect(Collectors.joining(",")) : null;
            String field = i.get("varId") == null ? null : "var:" + i.get("varId");
            details.add(ErrorDetail.ofGrid(null, rowKey, field, String.valueOf(i.get("code")), String.valueOf(i.get("message"))));
        }
        return MdmErrors.raw(code, PREFIX + summary, List.copyOf(details));
    }
}
