package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.dmom.DmomException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class DmomReceiveControllerTest {

    private final DmomReceiveDispatcher dispatcher = mock(DmomReceiveDispatcher.class);
    private final DmomReceiveController controller = new DmomReceiveController(dispatcher);

    private static DmomReceiveRequest req(String tc, String ifId, String msg) {
        return new DmomReceiveRequest(tc, ifId, msg, "IF_KAFKA", "k1");
    }

    @Test
    void receive_정상이면_SUCCESS_응답_및_디스패치() {
        doNothing().when(dispatcher).dispatch(any());

        DmomReceiveResponse res = controller.receive(req("TC1", "IF1", "a|b|"));

        assertThat(res.resultCode()).isEqualTo("SUCCESS");
        assertThat(res.transactionCode()).isEqualTo("TC1");
        assertThat(res.interfaceId()).isEqualTo("IF1");
        assertThat(res.errorMessage()).isNull();
        verify(dispatcher).dispatch(any());
    }

    @Test
    void receive_TC누락이면_REQUIRED_VALUE() {
        assertThatThrownBy(() -> controller.receive(req(" ", "IF1", "a|")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.REQUIRED_VALUE);
    }

    @Test
    void receive_IF누락이면_REQUIRED_VALUE() {
        assertThatThrownBy(() -> controller.receive(req("TC1", null, "a|")))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void receive_MSG가_null이면_REQUIRED_VALUE() {
        assertThatThrownBy(() -> controller.receive(req("TC1", "IF1", null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void receive_빈전문은_허용() {
        doNothing().when(dispatcher).dispatch(any());
        DmomReceiveResponse res = controller.receive(req("TC1", "IF1", ""));
        assertThat(res.resultCode()).isEqualTo("SUCCESS");
    }

    @Test
    void receive_디스패치_실패는_그대로_전파() {
        doThrow(new DmomException("수신 서비스 실패")).when(dispatcher).dispatch(any());

        assertThatThrownBy(() -> controller.receive(req("TC1", "IF1", "a|")))
                .isInstanceOf(DmomException.class);
    }
}
