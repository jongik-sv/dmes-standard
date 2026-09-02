package com.dongkuk.dmes.cactus.dmom.dispatch;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import com.dongkuk.dmes.cactus.integration.caravanhub.CaravanHubIntegrationClient;
import com.dongkuk.dmes.cactus.integration.caravanhub.CaravanHubSendResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * HTTP 방식 송신. 기존 {@link CaravanHubIntegrationClient} 에 위임하여 {@code POST /caravanHubApi/v1/send} 호출.
 *
 * <p>{@code DmomDispatchSynchronization.afterCommit}(업무 커밋 성공 후) 에서 호출된다.
 * 실패 시 예외를 던지면 동기화가 {@code DmomErrorLogger} 로 적재한다.
 */
public class DmomHttpSender {

    private static final Logger log = LoggerFactory.getLogger(DmomHttpSender.class);

    private final CaravanHubIntegrationClient caravanHubClient;

    public DmomHttpSender(CaravanHubIntegrationClient caravanHubClient) {
        this.caravanHubClient = caravanHubClient;
    }

    /**
     * 메시지를 CaravanHub 로 전송. 실패 시 {@link DmomException} 전파
     * (또는 클라이언트가 {@code CaravanHubIntegrationException} 을 직접 던짐).
     */
    public void send(DmomMessage message) {
        CaravanHubSendResult result =
                caravanHubClient.send(message.interfaceId(), message.transactionCode(), message.interfaceMsg());

        if (result == null || !result.isSuccess()) {
            String code = (result == null) ? "NO_RESPONSE" : result.errorCode();
            String msg = (result == null) ? "null result" : result.errorMessage();
            throw new DmomException("caravan-hub 전송 실패 interfaceId=" + message.interfaceId()
                    + " tc=" + message.transactionCode() + " code=" + code + " msg=" + msg);
        }
        log.debug("caravan-hub 전송 성공 interfaceId={} tc={} kafkaKeyData={}",
                message.interfaceId(), message.transactionCode(), result.kafkaKeyData());
    }
}
