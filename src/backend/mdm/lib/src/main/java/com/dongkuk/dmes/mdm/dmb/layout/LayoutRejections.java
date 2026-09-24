package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 레이아웃 저장 거부 예외(TSK-05-02 design.md §2·D4). OASIS 서비스 예외는 {@code meta.message} 원문만 화면에 가므로 메시지 본문에
 * {@code Lnn[seq] 문구} 를 이어 붙인다. 공유 enum {@code MdmErrorCode} 에 코드를 더하지 않고 cactus {@code BUSINESS_ERROR} 로
 * 직접 만든다(D4). details 모양은 {@code DomainRejections} 와 같다(첫 행 코드, 뒤 행 이슈).
 */
public final class LayoutRejections {

    public static final String HEADER_PREFIX = "헤더 저장 거부: ";
    public static final String MESSAGE_PREFIX = "전문 저장 거부: ";
    public static final String DETAIL_CODE = "LAYOUT_SAVE_REJECTED";

    private LayoutRejections() {
    }

    public static BusinessException reject(String prefix, List<LayoutIssue> issues) {
        String summary = issues.stream().map(LayoutIssue::summary).collect(Collectors.joining("; "));
        List<ErrorDetail> details = new ArrayList<>(1 + issues.size());
        details.add(ErrorDetail.of(DETAIL_CODE, "전문 레이아웃 저장 검사를 통과하지 못했습니다"));
        for (LayoutIssue i : issues) {
            details.add(ErrorDetail.ofGrid(null, i.seq() == null ? null : String.valueOf(i.seq()), i.field(), i.code().name(),
                    i.message()));
        }
        return new BusinessException(ErrorCode.BUSINESS_ERROR, prefix + summary, List.copyOf(details));
    }

    public static BusinessException reject(String prefix, LayoutIssue issue) {
        return reject(prefix, List.of(issue));
    }

    /** 대상 레이아웃이 없거나 종류가 다르다(L11). */
    public static BusinessException notFound(Long layoutId, String kind) {
        String prefix = "HEADER".equals(kind) ? HEADER_PREFIX : MESSAGE_PREFIX;
        return reject(prefix, LayoutIssue.of(LayoutIssueCode.L11, null, "LAYOUT_ID",
                ("HEADER".equals(kind) ? "헤더" : "전문") + " 레이아웃이 없다: " + layoutId));
    }
}
