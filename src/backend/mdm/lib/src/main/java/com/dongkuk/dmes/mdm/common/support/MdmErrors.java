package com.dongkuk.dmes.mdm.common.support;

import com.dongkuk.dmes.cactus.common.BusinessException;
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
 */
public final class MdmErrors {

    private MdmErrors() {
    }

    public static BusinessException of(MdmErrorCode code) {
        return of(code, List.of());
    }

    public static BusinessException of(MdmErrorCode code, List<MdmCheckIssue> issues) {
        List<ErrorDetail> details = new ArrayList<>(1 + issues.size());
        details.add(ErrorDetail.of(code.code(), code.defaultMessage()));
        for (MdmCheckIssue issue : issues) {
            details.add(ErrorDetail.ofGrid(null, issue.itemKey(), issue.field(), issue.code(), issue.message()));
        }
        return new BusinessException(code.transport(), code.defaultMessage(), List.copyOf(details));
    }
}
