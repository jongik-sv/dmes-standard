package com.dongkuk.dmes.cactus.dmom.transport;

/**
 * 전문 송신 채널. {@code createMsg} 호출 시 호출자가 선택한다.
 *
 * <ul>
 *   <li>{@link #HTTP} — 버퍼 적재 후 커밋 성공 시(afterCommit) {@code CaravanHubIntegrationClient.send()} 로 REST 전송.</li>
 *   <li>{@link #DB} — {@code createMsg} 시점에 업무 트랜잭션 커넥션으로 {@code EAIUSER.IF_*} 즉시 INSERT(원자적).
 *       CaravanHub DB-inbound 폴러가 커밋된 행을 Kafka 로 발행.</li>
 * </ul>
 *
 * <p>{@link #protocol()} 값은 {@code TB_MCM_MOM_TC_ERROR.INTERFACE_PROTOCOL} 에 기록된다.
 */
public enum CaravanHubTransport {

    HTTP("HUB_HTTP"),
    DB("HUB_DB");

    private final String protocol;

    CaravanHubTransport(String protocol) {
        this.protocol = protocol;
    }

    /** 추적/에러로그용 프로토콜 문자열. */
    public String protocol() {
        return protocol;
    }
}
