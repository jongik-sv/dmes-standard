package com.dongkuk.dmes.mcm.adapter;

import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * mcm-core 업무 예외({@link BusinessException} 사본)를 cactus OASIS 응답 계약(코드·행 단위 상세)으로 옮기는 변환기 —
 * cactus 어댑터(2026-10-16, BE 리팩토링 2회차 F2).
 *
 * <p>mcm-core 는 cactus 에 의존하지 않으므로(McmCoreArchitectureTest) 자기 {@code BusinessException}·{@code ErrorCode}·
 * {@code ErrorDetail} 사본을 쓴다. 응답 변환기는 cactus 형만 알아봐서, 이 변환기가 없으면 mcm-core 화면 서비스의 업무 예외가
 * {@code meta.code=S001} 로 나가고 행 오류 {@code errors[]} 가 빠진다. 이 빈은 mcm 앱에서 {@code OasisAutoConfiguration} 이
 * 응답 변환기에 넘긴다.
 *
 * <p>코드는 mcm-core {@code ErrorCode} 의 코드 문자열 그대로다(cactus {@code ErrorCode} 와 같은 이름·코드 — 시험으로 확인한다).
 * 행 상세는 같은 칸의 cactus {@link ErrorDetail} 로 옮긴다. mcm-core 업무 예외가 아니면 null 이다.
 */
@Component
public class McmBusinessErrorTranslator implements BusinessErrorTranslator {

    @Override
    public Translated translate(Throwable t) {
        if (!(t instanceof BusinessException be)) {
            return null;
        }
        String code = be.getErrorCode() != null ? be.getErrorCode().getCode() : null;
        List<com.dongkuk.dmes.mcm.common.exception.ErrorDetail> details = be.getErrors();
        List<ErrorDetail> errors = details == null ? null : details.stream().map(McmBusinessErrorTranslator::toCactus).toList();
        return new Translated(code, errors);
    }

    /** mcm-core 행 상세 한 건 → 같은 칸의 cactus 행 상세. null 은 null. */
    static ErrorDetail toCactus(com.dongkuk.dmes.mcm.common.exception.ErrorDetail d) {
        if (d == null) {
            return null;
        }
        return new ErrorDetail(d.grid(), d.rowKey(), d.rowIndex(), d.field(), d.code(), d.message());
    }
}
