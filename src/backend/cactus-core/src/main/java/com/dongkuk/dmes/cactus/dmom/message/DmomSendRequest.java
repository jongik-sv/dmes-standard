package com.dongkuk.dmes.cactus.dmom.message;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.transport.CaravanHubTransport;

import java.util.Map;

/**
 * 전문 송신 요청. {@code DmomMessageService.createMsg} 의 입력.
 *
 * <ul>
 *   <li>{@code transactionCode} — 필수. 트랜잭션 코드.</li>
 *   <li>{@code interfaceId} — 필수. 인터페이스 ID(= Kafka topicId).</li>
 *   <li>{@code transport} — 필수. {@link CaravanHubTransport#HTTP} / {@link CaravanHubTransport#DB}.</li>
 *   <li>{@code data} — FORMAT 항목값 Map. Element 는 scalar, Group 은 {@code List<Map>}.</li>
 *   <li>{@code transferTc} — (옵션) 포맷 조회용 대체 TC(레거시 {@code msgCreate_TransferTC}).</li>
 * </ul>
 *
 * <p>KEY_DATA1/2/3 는 미사용(요청 확정).
 */
public record DmomSendRequest(
        String transactionCode,
        String interfaceId,
        CaravanHubTransport transport,
        Map<String, Object> data,
        String transferTc
) {

    public DmomSendRequest {
        if (transactionCode == null || transactionCode.isBlank()) {
            throw new DmomException("transactionCode required");
        }
        if (interfaceId == null || interfaceId.isBlank()) {
            throw new DmomException("interfaceId required");
        }
        if (transport == null) {
            throw new DmomException("transport required");
        }
        data = (data == null) ? Map.of() : data;
    }

    /** 포맷 조회에 사용할 TC. transferTc 가 있으면 그것을, 없으면 transactionCode. */
    public String formatLookupTc() {
        return (transferTc == null || transferTc.isBlank()) ? transactionCode : transferTc;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String transactionCode;
        private String interfaceId;
        private CaravanHubTransport transport;
        private Map<String, Object> data;
        private String transferTc;

        public Builder transactionCode(String transactionCode) {
            this.transactionCode = transactionCode;
            return this;
        }

        public Builder interfaceId(String interfaceId) {
            this.interfaceId = interfaceId;
            return this;
        }

        public Builder transport(CaravanHubTransport transport) {
            this.transport = transport;
            return this;
        }

        public Builder data(Map<String, Object> data) {
            this.data = data;
            return this;
        }

        public Builder transferTc(String transferTc) {
            this.transferTc = transferTc;
            return this;
        }

        public DmomSendRequest build() {
            return new DmomSendRequest(transactionCode, interfaceId, transport, data, transferTc);
        }
    }
}
