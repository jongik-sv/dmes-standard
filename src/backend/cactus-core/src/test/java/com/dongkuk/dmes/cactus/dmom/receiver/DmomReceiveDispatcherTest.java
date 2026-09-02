package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DmomReceiveDispatcherTest {

    private final ServiceStarter serviceStarter = mock(ServiceStarter.class);
    private final ApplicationContext springCtx = mock(ApplicationContext.class);
    private final DmomErrorLogger errorLogger = mock(DmomErrorLogger.class);
    private final DmomReceiveDispatcher dispatcher =
            new DmomReceiveDispatcher(serviceStarter, springCtx, errorLogger);

    private static DmomReceiveRequest req() {
        return new DmomReceiveRequest("TC1", "IF1", "a|b|", "IF_KAFKA", "key-123");
    }

    @AfterEach
    void tearDown() {
        AuditHolder.remove();
    }

    @Test
    void dispatch_성공이면_예외없이_종료_에러로그_미적재() {
        ServiceResult result = mock(ServiceResult.class);
        when(result.serviceResultCode()).thenReturn(ServiceResultCode.SUCCESS);
        when(serviceStarter.start(eq("TC1"), any(ServiceContext.class))).thenReturn(result);

        assertThatCode(() -> dispatcher.dispatch(req())).doesNotThrowAnyException();

        verify(serviceStarter).start(eq("TC1"), any(ServiceContext.class));
        verify(errorLogger, never()).logReceive(any(), any(), any(), any(), any());
        assertThat((Object) AuditHolder.getAudit()).isNull();   // finally 정리 확인
    }

    @Test
    void dispatch_결과가_USER_ERROR면_DmomException_및_에러로그_R() {
        ServiceResult result = mock(ServiceResult.class);
        when(result.serviceResultCode()).thenReturn(ServiceResultCode.USER_ERROR);
        when(result.serviceResultMessage()).thenReturn("업무오류");
        when(serviceStarter.start(eq("TC1"), any(ServiceContext.class))).thenReturn(result);

        assertThatThrownBy(() -> dispatcher.dispatch(req()))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("수신 서비스 실패");

        verify(errorLogger).logReceive(eq("TC1"), eq("IF1"), eq("IF_KAFKA"), eq("a|b|"), any());
        assertThat((Object) AuditHolder.getAudit()).isNull();
    }

    @Test
    void dispatch_start가_예외면_DmomException_래핑_및_에러로그_R() {
        when(serviceStarter.start(eq("TC1"), any(ServiceContext.class)))
                .thenThrow(new IllegalStateException("boom"));

        assertThatThrownBy(() -> dispatcher.dispatch(req()))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("수신 처리 실패");

        verify(errorLogger).logReceive(eq("TC1"), eq("IF1"), eq("IF_KAFKA"), eq("a|b|"), any());
        assertThat((Object) AuditHolder.getAudit()).isNull();
    }

    @Test
    void dispatch_DmomException은_그대로_전파() {
        when(serviceStarter.start(eq("TC1"), any(ServiceContext.class)))
                .thenThrow(new DmomException("포맷 없음"));

        assertThatThrownBy(() -> dispatcher.dispatch(req()))
                .isInstanceOf(DmomException.class)
                .hasMessage("포맷 없음");

        verify(errorLogger).logReceive(eq("TC1"), eq("IF1"), eq("IF_KAFKA"), eq("a|b|"), any());
    }
}
