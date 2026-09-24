package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 도메인 저장 거부 예외(TSK-04-03 design.md §9.1 B0, D11). OASIS 서비스 예외는 {@code meta.message} 만 원문으로 화면에 가고
 * {@code errors[]} 는 오지 않으므로(B0 실측), 메시지 본문에 이슈 코드와 요약을 이어 붙인다. details 모양은
 * {@code MdmErrors.of} 와 같다(첫 행 MDM 코드, 뒤 행 이슈). 공유 파일 {@code MdmErrors} 는 고치지 않는다.
 */
public final class DomainRejections {

    public static final String PREFIX = "도메인 저장 거부: ";

    private DomainRejections() {}

    /** 조회 대상이 없다(S06) — {@code view} 용. */
    public static BusinessException notFound(Long domainId) {
        DomainIssue issue = DomainIssue.of(DomainIssueCode.S06, "DOMAIN_ID", "도메인이 없다: " + domainId);
        MdmErrorCode code = MdmErrorCode.DOMAIN_SAVE_REJECTED;
        return new BusinessException(code.transport(), "S06 " + issue.message(),
                List.of(ErrorDetail.ofGrid(null, null, issue.field(), issue.code().name(), issue.message())));
    }

    /** ERROR 이슈만 메시지에 싣는다. */
    public static BusinessException reject(List<DomainIssue> issues) {
        List<DomainIssue> errors = issues.stream().filter(DomainIssue::isError).toList();
        MdmErrorCode code = MdmErrorCode.DOMAIN_SAVE_REJECTED;
        String summary = errors.stream()
                .map(i -> i.code().name() + (i.itemKey() == null ? "" : "[" + i.itemKey() + "]") + " " + i.message())
                .collect(Collectors.joining("; "));
        List<ErrorDetail> details = new ArrayList<>(1 + errors.size());
        details.add(ErrorDetail.of(code.code(), code.defaultMessage()));
        for (DomainIssue i : errors) {
            details.add(ErrorDetail.ofGrid(null, i.itemKey(), i.field(), i.code().name(), i.message()));
        }
        return new BusinessException(code.transport(), PREFIX + summary, List.copyOf(details));
    }
}
