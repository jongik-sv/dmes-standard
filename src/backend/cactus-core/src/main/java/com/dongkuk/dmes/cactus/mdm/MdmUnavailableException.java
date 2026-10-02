package com.dongkuk.dmes.cactus.mdm;

/** MDM 에서 정의를 받을 수 없다(꺼짐·시간 초과·거부·손상된 응답). "없음"이 아니다 — 캐시하지 않는다(spec §5.4). */
public class MdmUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public MdmUnavailableException(String message) {
        super(message);
    }

    public MdmUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
