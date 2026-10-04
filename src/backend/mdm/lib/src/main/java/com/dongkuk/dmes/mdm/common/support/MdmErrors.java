package com.dongkuk.dmes.mdm.common.support;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.ArrayList;
import java.util.List;

/**
 * {@link MdmErrorCode} 를 cactus {@link BusinessException} 으로 싣는 한 곳(TSK-01-03 B5, D5).
 *
 * <p>OASIS 경로는 HTTP 200 + {@code meta.code} 로 오류를 돌려주므로 의미 상태(예: MDM001 409)는 첫 detail 의
 * code 로 표현한다. 화면은 {@code errors[].code} 로 원인을 가린다. 검사 이슈는 뒤이은 detail 로 싣는다.
 *
 * <p>단, BPMN serviceTask 안에서 던진 예외는 OASIS 가 {@code meta.message}(= 예외 message)만 화면에 싣고
 * {@code errors[]} 를 비운다(TSK-04-04 design.md F12). 그래서 message 는 항상 기본 문구로 <b>시작</b>하고 상세는
 * {@link #of(MdmErrorCode, String, List)} 로 {@code ": "} 뒤에 붙인다(TSK-04-04 I25).
 */
public final class MdmErrors {

    private MdmErrors() {
    }

    public static BusinessException of(MdmErrorCode code) {
        return of(code, List.of());
    }

    public static BusinessException of(MdmErrorCode code, List<MdmCheckIssue> issues) {
        return of(code, null, issues);
    }

    /**
     * {@link #of(MdmErrorCode)} 와 같되, BPMN 안에서 던져도 OASIS {@code meta.code} 에 {@code MDMnnn} 을 싣는다(cactus {@link ResponseCodeAware}).
     * 다른 MDM 오류는 BPMN 경로의 기본 {@code S001} + 문구 관례(TSK-04-04 F12)를 그대로 두고, 계약이 코드를 약속한 경로만 이것을 쓴다 —
     * 지금은 {@code metaFeed/save} 권한 거부(MDM027, 계획 Ruling R10) 하나다.
     */
    public static BusinessException coded(MdmErrorCode code) {
        return new Coded(code.transport(), code.defaultMessage(), List.of(ErrorDetail.of(code.code(), code.defaultMessage())), code.code());
    }

    /** meta.code 를 스스로 정하는 MDM 오류. 나머지는 {@link BusinessException} 그대로다. */
    static final class Coded extends BusinessException implements ResponseCodeAware {

        private static final long serialVersionUID = 1L;
        private final String responseCode;

        Coded(ErrorCode transport, String message, List<ErrorDetail> details, String responseCode) {
            super(transport, message, details);
            this.responseCode = responseCode;
        }

        @Override
        public String responseCode() {
            return responseCode;
        }
    }

    /** message = 기본 문구 + {@code ": "} + detail(detail 이 비면 기본 문구만). detail 목록은 기존과 같다. */
    public static BusinessException of(MdmErrorCode code, String detail, List<MdmCheckIssue> issues) {
        String message = detail == null || detail.isBlank()
                ? code.defaultMessage()
                : code.defaultMessage() + ": " + detail;
        List<ErrorDetail> details = new ArrayList<>(1 + issues.size());
        details.add(ErrorDetail.of(code.code(), code.defaultMessage()));
        for (MdmCheckIssue issue : issues) {
            details.add(ErrorDetail.ofGrid(null, issue.itemKey(), issue.field(), issue.code(), issue.message()));
        }
        return new BusinessException(code.transport(), message, List.copyOf(details));
    }

    /** 입력 검증 실패({@link MdmErrorCode#INVALID_INPUT}) — 서비스들이 따로 두던 {@code invalid(detail)} 의 정본. */
    public static BusinessException invalid(String detail) {
        return of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }
}
