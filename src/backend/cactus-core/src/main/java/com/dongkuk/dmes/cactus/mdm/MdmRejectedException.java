package com.dongkuk.dmes.cactus.mdm;

/**
 * MDM 이 요청을 받고 업무 거부로 답했다(HTTP 200 + {@code meta.success=false} — 키 수 초과·입력 오류 등). MDM 이 살아 있으므로 장애가 아니다:
 * view 는 그 묶음의 키를 {@code failed} 로 돌리고 장애 수·30초 건너뛰기에 넣지 않는다(spec §5.4). search 의 거부는 폴러가 실패로 다룬다.
 */
public class MdmRejectedException extends MdmUnavailableException {

    private static final long serialVersionUID = 1L;

    public MdmRejectedException(String message) {
        super(message);
    }
}
