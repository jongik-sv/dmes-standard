package com.dongkuk.dmes.cactus.dmom;

/**
 * dmom 전문 송수신 처리 중 발생하는 런타임 예외.
 *
 * <p>포맷 부재, 활성 트랜잭션 부재, 직렬화 오류, CaravanHub 전송 실패 래핑 등에 사용한다.
 * {@code createMsg}(커밋 전) 단계에서 던지면 호출자에게 전파되어 업무 트랜잭션이 롤백된다.
 */
public class DmomException extends RuntimeException {

    public DmomException(String message) {
        super(message);
    }

    public DmomException(String message, Throwable cause) {
        super(message, cause);
    }
}
