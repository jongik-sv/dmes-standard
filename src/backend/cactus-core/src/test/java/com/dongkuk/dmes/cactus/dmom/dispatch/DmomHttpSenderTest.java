package com.dongkuk.dmes.cactus.dmom.dispatch;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import com.dongkuk.dmes.cactus.integration.caravanhub.CaravanHubIntegrationClient;
import com.dongkuk.dmes.cactus.integration.caravanhub.CaravanHubSendResult;
import com.dongkuk.dmes.cactus.integration.caravanhub.exception.CaravanHubIntegrationException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DmomHttpSenderTest {

    private final CaravanHubIntegrationClient client = mock(CaravanHubIntegrationClient.class);
    private final DmomHttpSender sender = new DmomHttpSender(client);
    private final DmomMessage message = new DmomMessage("PQR02012", "MMQCMMCMTT01", "a|b|");

    @Test
    void 성공응답이면_예외없음() {
        when(client.send("MMQCMMCMTT01", "PQR02012", "a|b|"))
                .thenReturn(new CaravanHubSendResult("SUCCESS", "uuid-1", "MMQCMMCMTT01", null, null, "2026-05-29T20:00:00"));

        assertThatCode(() -> sender.send(message)).doesNotThrowAnyException();
    }

    @Test
    void 실패응답이면_DmomException() {
        when(client.send(any(), any(), any()))
                .thenReturn(new CaravanHubSendResult("ERROR", null, null, "INVALID_PARAMETER", "bad", "2026-05-29T20:00:00"));

        assertThatThrownBy(() -> sender.send(message))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("INVALID_PARAMETER");
    }

    @Test
    void null응답이면_DmomException() {
        when(client.send(any(), any(), any())).thenReturn(null);

        assertThatThrownBy(() -> sender.send(message)).isInstanceOf(DmomException.class);
    }

    @Test
    void 클라이언트예외는_그대로_전파() {
        when(client.send(any(), any(), any())).thenThrow(new CaravanHubIntegrationException("http 500"));

        assertThatThrownBy(() -> sender.send(message)).isInstanceOf(CaravanHubIntegrationException.class);
    }
}
