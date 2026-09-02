package com.dongkuk.dmes.cactus.dmom.message;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.context.DmomSendBuffer;
import com.dongkuk.dmes.cactus.dmom.dispatch.DmomDbOutboundWriter;
import com.dongkuk.dmes.cactus.dmom.dispatch.DmomDispatchSynchronization;
import com.dongkuk.dmes.cactus.dmom.dispatch.DmomHttpSender;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

/**
 * {@link DmomMessageService} 기본 구현.
 *
 * <p>처리 순서: 활성 tx 검증 → 포맷 조회 → 직렬화 → transport 분기.
 * <ul>
 *   <li>{@code DB} : {@link DmomDbOutboundWriter#insert} 즉시 호출 (업무 tx 합류, 원자적).</li>
 *   <li>{@code HTTP} : 버퍼 적재 + 최초 1회 {@link DmomDispatchSynchronization} 등록 → 커밋 후 전송.</li>
 * </ul>
 */
public class DefaultDmomMessageService implements DmomMessageService {

    private final DmomFormatRepository formatRepository;
    private final MessageSerializer serializer;
    private final DmomDbOutboundWriter dbWriter;
    /** CaravanHubIntegrationClient 부재 모듈에서는 null 일 수 있음(DB 방식만 사용 가능). */
    private final DmomHttpSender httpSender;
    private final DmomErrorLogger errorLogger;

    public DefaultDmomMessageService(DmomFormatRepository formatRepository,
                                     MessageSerializer serializer,
                                     DmomDbOutboundWriter dbWriter,
                                     DmomHttpSender httpSender,
                                     DmomErrorLogger errorLogger) {
        this.formatRepository = formatRepository;
        this.serializer = serializer;
        this.dbWriter = dbWriter;
        this.httpSender = httpSender;
        this.errorLogger = errorLogger;
    }

    @Override
    public String createMsg(DmomSendRequest request) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new DmomException("createMsg requires an active Spring transaction "
                    + "(OASIS: cactus.oasis.transactional=true, 또는 호출 메서드에 @Transactional). "
                    + "interfaceId=" + request.interfaceId());
        }

        FormatLayout layout = formatRepository.getActiveLayout(request.formatLookupTc(), request.interfaceId());
        if (layout.isEmpty()) {
            throw new DmomException("FORMAT_LAYOUT 없음: TC=" + request.formatLookupTc()
                    + ", interfaceId=" + request.interfaceId());
        }

        String interfaceMsg = serializer.serialize(layout, request.data());

        switch (request.transport()) {
            case DB -> dbWriter.insert(request, interfaceMsg);   // 즉시 in-tx INSERT (원자적)
            case HTTP -> bufferHttp(request, interfaceMsg);      // 버퍼 + afterCommit 등록
        }
        return interfaceMsg;
    }

    private void bufferHttp(DmomSendRequest request, String interfaceMsg) {
        if (httpSender == null) {
            throw new DmomException("HTTP transport 는 CaravanHubIntegrationClient 빈이 필요합니다 "
                    + "(cactus.caravan-hub.enabled). interfaceId=" + request.interfaceId());
        }
        boolean first = !DmomSendBuffer.isActive();
        List<DmomMessage> buffer = DmomSendBuffer.openIfAbsent();
        if (first) {
            TransactionSynchronizationManager.registerSynchronization(
                    new DmomDispatchSynchronization(buffer, httpSender, errorLogger));
        }
        buffer.add(new DmomMessage(request.transactionCode(), request.interfaceId(), interfaceMsg));
    }
}
