package com.dongkuk.dmes.mdm.contract.common;

import com.dongkuk.dmes.cactus.common.ErrorCode;

/**
 * mdm 공통 오류 코드(design.md D7). 코드 {@code MDMnnn}, 의미 HTTP 상태, 운반용 cactus {@link ErrorCode}, 기본 메시지.
 *
 * <p>던질 때는 cactus {@code BusinessException(code.transport(), msg, List.of(ErrorDetail(... code.code() ...)))}
 * 으로 싣는다. OASIS 경로는 HTTP 상태 대신 {@code meta.code} 로 돌려주므로 httpStatus 는 의미 상태다 —
 * 표현 방식은 TSK-01-03 이 확정한다. 원천 인용 메시지(MDM001 04:305, MDM007 04:299)는 원천 문구 그대로다.
 */
public enum MdmErrorCode {

    ROW_VERSION_CONFLICT("MDM001", 409, ErrorCode.BUSINESS_ERROR, "다른 사용자가 수정했습니다. 다시 불러오세요"),
    NOT_DRAFT("MDM002", 409, ErrorCode.BUSINESS_ERROR, "DRAFT 상태에서만 할 수 있습니다"),
    NOT_DRAFT_OWNER("MDM003", 403, ErrorCode.ACCESS_DENIED, "DRAFT 소유자만 할 수 있습니다"),
    DRAFT_ALREADY_OWNED("MDM004", 409, ErrorCode.BUSINESS_ERROR, "다른 사용자가 선점한 DRAFT 입니다"),
    HANDOVER_TARGET_NOT_STEWARD("MDM005", 400, ErrorCode.INVALID_VALUE, "넘겨받는 사람은 담당자 역할이 있어야 합니다"),
    UNAPPLIED_VERSION_EXISTS("MDM006", 409, ErrorCode.BUSINESS_ERROR, "미적용 버전이 있어 새 버전을 만들 수 없습니다"),
    MULTIPLE_UNAPPLIED_VERSIONS("MDM007", 409, ErrorCode.BUSINESS_ERROR, "미적용 버전이 2개입니다. 하나를 삭제하세요"),
    APPLY_FROM_NOT_AFTER_PREVIOUS("MDM008", 400, ErrorCode.INVALID_VALUE,
            "적용 시작 일시는 직전 확정 버전의 적용 시작 일시보다 뒤여야 합니다"),
    TRANSITION_NOT_ALLOWED("MDM009", 409, ErrorCode.BUSINESS_ERROR, "허용되지 않는 상태 전이입니다"),
    CONFIRM_CHECK_FAILED("MDM010", 400, ErrorCode.BUSINESS_ERROR, "확정 검사를 통과하지 못했습니다"),
    MARU_ID_NAMESPACE_CONFLICT("MDM011", 400, ErrorCode.DUPLICATE_DATA, "마루 코드·마루 데이터에 같은 ID 가 있습니다"),
    RESERVED_CATEGORY("MDM012", 400, ErrorCode.BUSINESS_ERROR, "예약 카테고리 BASE 는 편집·삭제할 수 없습니다");

    private final String code;
    private final int httpStatus;
    private final ErrorCode transport;
    private final String defaultMessage;

    MdmErrorCode(String code, int httpStatus, ErrorCode transport, String defaultMessage) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.transport = transport;
        this.defaultMessage = defaultMessage;
    }

    /** mdm 오류 코드(MDMnnn). cactus {@code ErrorDetail.code} 에 싣는다. */
    public String code() {
        return code;
    }

    /** 의미 HTTP 상태. OASIS 경로는 이 값을 HTTP 상태로 쓰지 않는다. */
    public int httpStatus() {
        return httpStatus;
    }

    /** 운반용 cactus 오류 코드({@code BusinessException} 첫 인자). */
    public ErrorCode transport() {
        return transport;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
