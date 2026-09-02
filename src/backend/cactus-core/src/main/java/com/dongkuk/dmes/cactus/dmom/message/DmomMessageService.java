package com.dongkuk.dmes.cactus.dmom.message;

/**
 * 전문 송신 진입점. BPMN Service Task 또는 {@code @Transactional} 서비스에서 호출한다.
 *
 * <p>활성 Spring 트랜잭션 내에서 호출해야 한다(DB 즉시 INSERT 의 원자성 + HTTP afterCommit 등록).
 */
public interface DmomMessageService {

    /**
     * 전문 생성 → (DB: 즉시 in-tx INSERT / HTTP: 버퍼 적재 + afterCommit 등록).
     *
     * @param request 송신 요청
     * @return 직렬화된 전문 문자열({@code 값|값|값|}) — 로깅/검증용
     */
    String createMsg(DmomSendRequest request);
}
