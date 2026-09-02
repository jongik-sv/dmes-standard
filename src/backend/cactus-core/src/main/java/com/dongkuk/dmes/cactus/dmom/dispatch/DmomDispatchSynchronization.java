package com.dongkuk.dmes.cactus.dmom.dispatch;

import com.dongkuk.dmes.cactus.dmom.context.DmomSendBuffer;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;

import java.util.List;

/**
 * 커밋 경계 디스패치 — <b>HTTP 전용</b>. DB 방식은 {@code createMsg} 에서 이미 in-tx INSERT 되므로
 * 동기화는 HTTP 만 담당한다({@code beforeCommit} 없음).
 *
 * <ul>
 *   <li>{@link #afterCommit()} : 업무 커밋 성공 시 버퍼의 HTTP 메시지를 순서대로 전송. 실패분만 {@code TC_ERROR} 적재.</li>
 *   <li>{@link #afterCompletion(int)} : 버퍼 unbind(누수 방지, 커밋·롤백 무관).</li>
 * </ul>
 *
 * <p>{@code createMsg} 가 HTTP 메시지 최초 적재 시 트랜잭션당 1회 등록한다.
 */
public class DmomDispatchSynchronization implements TransactionSynchronization {

    private static final Logger log = LoggerFactory.getLogger(DmomDispatchSynchronization.class);

    private final List<DmomMessage> buffer;     // HTTP 메시지만 (등록 시 캡처한 참조)
    private final DmomHttpSender httpSender;
    private final DmomErrorLogger errorLogger;

    public DmomDispatchSynchronization(List<DmomMessage> buffer,
                                       DmomHttpSender httpSender,
                                       DmomErrorLogger errorLogger) {
        this.buffer = buffer;
        this.httpSender = httpSender;
        this.errorLogger = errorLogger;
    }

    @Override
    public void afterCommit() {
        for (DmomMessage message : buffer) {
            try {
                httpSender.send(message);
            } catch (Exception e) {
                // 커밋 후라 업무 롤백 불가 → 개별 실패 로깅 후 TC_ERROR 적재. 한 건 실패가 다른 건을 막지 않음.
                log.error("dmom HTTP 송신 실패 interfaceId={} tc={}",
                        message.interfaceId(), message.transactionCode(), e);
                errorLogger.log(message, e);
            }
        }
    }

    @Override
    public void afterCompletion(int status) {
        DmomSendBuffer.close();
    }
}
