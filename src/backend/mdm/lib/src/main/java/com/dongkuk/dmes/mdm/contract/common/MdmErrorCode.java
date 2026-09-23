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
    RESERVED_CATEGORY("MDM012", 400, ErrorCode.BUSINESS_ERROR, "예약 카테고리 BASE 는 편집·삭제할 수 없습니다"),
    /** TSK-01-03 D3 — 확정·선점은 담당자(MDM_STEWARD) 역할만 할 수 있다. */
    STEWARD_ROLE_REQUIRED("MDM013", 403, ErrorCode.ACCESS_DENIED, "담당자 역할이 있어야 할 수 있습니다"),
    /** TSK-01-03 D3 — 확정 검사 경고가 있는데 확인(warningsAcknowledged) 없이 확정을 요청했다. */
    CONFIRM_WARNINGS_NOT_ACKNOWLEDGED("MDM014", 409, ErrorCode.BUSINESS_ERROR, "확정 검사 경고를 확인한 뒤 다시 확정하세요"),
    /** TSK-04-04 D1 — 컬럼 저장·용어 인라인 등록은 표준 관리자(MDM_STD_ADMIN) 역할만 할 수 있다. */
    STD_ADMIN_ROLE_REQUIRED("MDM015", 403, ErrorCode.ACCESS_DENIED, "표준 관리자 역할이 있어야 할 수 있습니다"),
    /** TSK-04-04 I12 — 미등록 용어 자리({@code ***})가 남은 컬럼은 저장할 수 없다. */
    NAME_PLACEHOLDER_REMAINS("MDM016", 400, ErrorCode.INVALID_VALUE, "미등록 용어(***)가 남아 있어 저장할 수 없습니다"),
    /** TSK-04-04 I13 — 한 시스템 안 같은 필드명의 두 번째 등록. */
    SYSTEM_FIELD_ALREADY_MAPPED("MDM017", 409, ErrorCode.DUPLICATE_DATA,
            "한 시스템 안에서 필드명 하나는 컬럼 하나에만 붙일 수 있습니다"),
    /** TSK-04-04 — 같은 논리명 또는 표준 물리명의 컬럼이 이미 있다. */
    COLUMN_DUPLICATED("MDM018", 409, ErrorCode.DUPLICATE_DATA, "같은 논리명 또는 물리명의 컬럼이 이미 있습니다"),
    /** TSK-04-04 I18 — 같은 (표기, 의미 번호) 또는 영문 약어(대소문자 무시)의 용어가 이미 있다. */
    TERM_DUPLICATED("MDM019", 409, ErrorCode.DUPLICATE_DATA, "같은 표기·의미 번호 또는 영문 약어의 용어가 이미 있습니다"),
    /** TSK-04-04 — 형식·길이·존재 검사 실패. 어느 칸인지는 message 의 상세로 싣는다. */
    INVALID_INPUT("MDM020", 400, ErrorCode.INVALID_VALUE, "입력값이 올바르지 않습니다");

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
