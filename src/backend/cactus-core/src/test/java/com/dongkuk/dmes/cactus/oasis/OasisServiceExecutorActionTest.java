package com.dongkuk.dmes.cactus.oasis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.GridData;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.message.Message;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationContext;

/**
 * {@link OasisServiceExecutor} — 권한을 판정한 URL action 과 BPMN 이 분기하는 action 이 늘 같아야 한다(2026-10-03 보안 지적).
 * 본문 params·grids 에 action 키를 넣어 같은 서비스의 다른 action(예: commWidgetMng search → previewQuery,
 * AUTH_ONLY secUser myMenus → resetPassword)을 실행하려는 요청은 BPMN 을 시작하기 전에 E002 로 거절된다.
 */
class OasisServiceExecutorActionTest {

    private final ServiceStarter starter = mock(ServiceStarter.class);
    private final OasisServiceExecutor executor = new OasisServiceExecutor(
            starter, mock(ApplicationContext.class), new CactusRequestConverter(), new CactusResponseConverter());

    private static ServiceResult success() {
        return new ServiceResult() {
            @Override public ServiceResultCode serviceResultCode() { return ServiceResultCode.SUCCESS; }
            @Override public String serviceResultMessage() { return null; }
            @Override public Throwable exception() { return null; }
            @Override public Map<String, TypedObject> results() { return Map.of(); }
            @Override public TypedObject result(String key) { return null; }
            @Override public List<PathElement> path() { return List.of(); }
            @Override public List<Message> messages() { return List.of(); }
        };
    }

    private static CactusRequest request(Map<String, Object> params, Map<String, GridData> grids) {
        return new CactusRequest(new RequestMeta("u1", "M1"), params, grids);
    }

    @Test
    void 본문_params_action_으로_다른_action_을_실행하려는_요청은_BPMN_시작_전에_거절된다() {
        Map<String, Object> params = new HashMap<>();
        params.put("action", "previewQuery");
        params.put("dataSrc", "mcm");
        params.put("sql", "SELECT 1");

        CactusResponse res = executor.execute("commWidgetMng", "search", request(params, null));

        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo(ErrorCode.INVALID_VALUE.getCode());
        assertThat(res.getMeta().message()).isEqualTo(CactusRequestConverter.MSG_RESERVED_ACTION);
        verify(starter, never()).start(anyString(), any(ServiceContext.class));
    }

    @Test
    void 본문_grids_action_도_BPMN_시작_전에_거절된다() {
        Map<String, GridData> grids = Map.of("action", new GridData(List.of(Map.of("userId", "victim"))));

        CactusResponse res = executor.execute("secUser", "myMenus", request(null, grids));

        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo(ErrorCode.INVALID_VALUE.getCode());
        verify(starter, never()).start(anyString(), any(ServiceContext.class));
    }

    @Test
    void 정상_요청은_경로_action_으로_BPMN_을_시작한다() {
        when(starter.start(eq("commWidgetMng"), any(ServiceContext.class))).thenReturn(success());
        Map<String, Object> params = new HashMap<>();
        params.put("widgetId", "W1");

        CactusResponse res = executor.execute("commWidgetMng", "search", request(params, null));

        assertThat(res.getMeta().success()).isTrue();
        ArgumentCaptor<ServiceContext> sc = ArgumentCaptor.forClass(ServiceContext.class);
        verify(starter).start(eq("commWidgetMng"), sc.capture());
        assertThat(sc.getValue().serviceInput("action").getObject()).isEqualTo("search");
        assertThat(sc.getValue().serviceInput("widgetId").getObject()).isEqualTo("W1");
    }

    static final class CodedException extends BusinessException implements ResponseCodeAware {
        CodedException() {
            super(ErrorCode.ACCESS_DENIED, "시스템 관리자만 할 수 있습니다");
        }

        @Override
        public String responseCode() {
            return "MDM027";
        }
    }

    @Test
    void BPMN_밖에서_잡힌_업무_예외도_변환기와_같은_코드를_싣는다() {
        when(starter.start(eq("metaFeed"), any(ServiceContext.class))).thenThrow(new CodedException());

        CactusResponse res = executor.execute("metaFeed", "save", request(new HashMap<>(), null));

        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo("MDM027");
        assertThat(res.getMeta().message()).isEqualTo("시스템 관리자만 할 수 있습니다");
    }
}
