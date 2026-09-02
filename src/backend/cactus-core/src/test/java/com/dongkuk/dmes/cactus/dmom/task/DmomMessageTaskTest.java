package com.dongkuk.dmes.cactus.dmom.task;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessageService;
import com.dongkuk.dmes.cactus.dmom.message.DmomSendRequest;
import com.dongkuk.dmes.cactus.dmom.transport.CaravanHubTransport;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DmomMessageTaskTest {

    private final DmomMessageService service = mock(DmomMessageService.class);
    private final DmomMessageTask task = new DmomMessageTask(service);

    @Test
    void createMessage_HTTP_요청전달_및_반환() {
        when(service.createMsg(any())).thenReturn("hello|");

        String result = task.createMessage("TC", "MMQCMMCMTT01", "HTTP", Map.of("A", "hello"));

        assertThat(result).isEqualTo("hello|");
        ArgumentCaptor<DmomSendRequest> captor = ArgumentCaptor.forClass(DmomSendRequest.class);
        verify(service).createMsg(captor.capture());
        DmomSendRequest req = captor.getValue();
        assertThat(req.transactionCode()).isEqualTo("TC");
        assertThat(req.interfaceId()).isEqualTo("MMQCMMCMTT01");
        assertThat(req.transport()).isEqualTo(CaravanHubTransport.HTTP);
        assertThat(req.data()).containsEntry("A", "hello");
    }

    @Test
    void createMessage_transport_대소문자_무관_DB() {
        when(service.createMsg(any())).thenReturn("x|");

        task.createMessage("TC", "IF", "db", Map.of());

        ArgumentCaptor<DmomSendRequest> captor = ArgumentCaptor.forClass(DmomSendRequest.class);
        verify(service).createMsg(captor.capture());
        assertThat(captor.getValue().transport()).isEqualTo(CaravanHubTransport.DB);
    }

    @Test
    void createMessage_알수없는_transport면_DmomException() {
        assertThatThrownBy(() -> task.createMessage("TC", "IF", "KAFKA", Map.of()))
                .isInstanceOf(DmomException.class);
    }

    @Test
    void createMessage_transport_누락이면_DmomException() {
        assertThatThrownBy(() -> task.createMessage("TC", "IF", null, Map.of()))
                .isInstanceOf(DmomException.class);
    }
}
