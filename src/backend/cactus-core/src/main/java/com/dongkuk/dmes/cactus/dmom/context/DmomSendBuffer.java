package com.dongkuk.dmes.cactus.dmom.context;

import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.List;

/**
 * 트랜잭션 스코프 HTTP 송신 버퍼. {@link TransactionSynchronizationManager#bindResource} 로
 * 현재 스레드(=트랜잭션)에 바인딩한다.
 *
 * <p>OASIS / 비-OASIS 양쪽 공용 — 단일 버퍼. DB 방식은 {@code createMsg} 시점에 즉시 INSERT 되므로
 * 버퍼를 경유하지 않는다 → 본 버퍼는 <b>HTTP 전용</b>.
 *
 * <p>{@code afterCompletion} 에서 {@link #close()} 로 반드시 unbind 한다(누수 방지).
 */
public final class DmomSendBuffer {

    private static final Object RESOURCE_KEY = DmomSendBuffer.class;

    private DmomSendBuffer() {
    }

    /** 현재 스레드에 버퍼가 바인딩되어 있는지. */
    public static boolean isActive() {
        return TransactionSynchronizationManager.hasResource(RESOURCE_KEY);
    }

    /** 버퍼가 없으면 새로 bind, 있으면 기존 버퍼 반환. */
    @SuppressWarnings("unchecked")
    public static List<DmomMessage> openIfAbsent() {
        if (!isActive()) {
            List<DmomMessage> list = new ArrayList<>();
            TransactionSynchronizationManager.bindResource(RESOURCE_KEY, list);
            return list;
        }
        return (List<DmomMessage>) TransactionSynchronizationManager.getResource(RESOURCE_KEY);
    }

    /** 버퍼 unbind. afterCompletion 에서 호출(커밋·롤백 무관). */
    public static void close() {
        if (isActive()) {
            TransactionSynchronizationManager.unbindResource(RESOURCE_KEY);
        }
    }
}
