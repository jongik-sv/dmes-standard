package com.dongkuk.dmes.cactus.oasis;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.message.Message;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** BPMN 안에서 던진 예외의 meta.code — 기본 S001/E001, {@link ResponseCodeAware} 예외는 그 코드(MDM metaFeed save MDM027, 2026-10-02). */
class CactusResponseConverterErrorCodeTest {

    private final CactusResponseConverter converter = new CactusResponseConverter();

    static final class CodedException extends BusinessException implements ResponseCodeAware {
        CodedException() {
            super(ErrorCode.ACCESS_DENIED, "시스템 관리자만 할 수 있습니다");
        }

        @Override
        public String responseCode() {
            return "MDM027";
        }
    }

    private static ServiceResult failed(ServiceResultCode code, Throwable e) {
        return new ServiceResult() {
            @Override public ServiceResultCode serviceResultCode() { return code; }
            @Override public String serviceResultMessage() { return e.getMessage(); }
            @Override public Throwable exception() { return e; }
            @Override public Map<String, TypedObject> results() { return Map.of(); }
            @Override public TypedObject result(String key) { return null; }
            @Override public List<PathElement> path() { return List.of(); }
            @Override public List<Message> messages() { return List.of(); }
        };
    }

    @Test
    void 일반_예외는_예전대로_S001_이고_사용자_예외는_E001_이다() {
        CactusResponse system = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR,
                new BusinessException(ErrorCode.ACCESS_DENIED, "거부")), "tx");
        CactusResponse user = converter.convert(failed(ServiceResultCode.USER_ERROR, new RuntimeException("사용자")), "tx");

        assertThat(system.getMeta().code()).isEqualTo("S001");
        assertThat(user.getMeta().code()).isEqualTo("E001");
    }

    @Test
    void ResponseCodeAware_예외는_감싸여_있어도_그_코드를_meta_code_로_싣고_메시지는_그대로다() {
        RuntimeException wrapped = new RuntimeException("시스템 관리자만 할 수 있습니다", new IllegalStateException("x", new CodedException()));

        CactusResponse r = converter.convert(failed(ServiceResultCode.SYSTEM_ERROR, wrapped), "tx");

        assertThat(r.getMeta().success()).isFalse();
        assertThat(r.getMeta().code()).isEqualTo("MDM027");
        assertThat(r.getMeta().message()).isEqualTo("시스템 관리자만 할 수 있습니다");
    }
}
