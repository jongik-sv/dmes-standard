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
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * {@link CactusResponseConverter} 가 만드는 응답 JSON 특성 테스트(refactor/framework-tx 항목 8, 2026-10-04).
 *
 * <p>BPMN 안 예외의 {@code errors[]} 를 응답에 더하기 전의 직렬화 결과를 문자열 그대로 고정한다.
 * 업무 예외에 행 단위 상세({@code errors})가 없으면 이 JSON 이 한 글자도 바뀌지 않아야 한다.
 */
class CactusResponseConverterJsonTest {

    private static final ObjectMapper JSON = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

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

    static ServiceResult result(ServiceResultCode code, String message, Throwable e, Map<String, TypedObject> results) {
        return new ServiceResult() {
            @Override public ServiceResultCode serviceResultCode() { return code; }
            @Override public String serviceResultMessage() { return message; }
            @Override public Throwable exception() { return e; }
            @Override public Map<String, TypedObject> results() { return results; }
            @Override public TypedObject result(String key) { return results == null ? null : results.get(key); }
            @Override public List<PathElement> path() { return List.of(); }
            @Override public List<Message> messages() { return List.of(); }
        };
    }

    static ServiceResult failed(ServiceResultCode code, Throwable e) {
        return result(code, e.getMessage(), e, Map.of());
    }

    private String json(ServiceResult r) throws Exception {
        CactusResponse response = converter.convert(r, "tx");
        return JSON.writeValueAsString(response);
    }

    @Test
    void 성공은_meta_data_grids_만_싣는다() throws Exception {
        Map<String, TypedObject> results = new LinkedHashMap<>();
        results.put("cnt", new TypedObject(3));
        results.put("rows", new TypedObject(List.of(Map.of("a", 1)), List.class));

        assertThat(json(result(ServiceResultCode.SUCCESS, null, null, results))).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":true,\"code\":\"0000\",\"message\":null},"
                        + "\"data\":{\"cnt\":3},"
                        + "\"grids\":{\"rows\":{\"columns\":null,\"rows\":[{\"a\":1}],\"empty\":false}}}");
    }

    @Test
    void 결과가_없는_성공은_meta_만_싣는다() throws Exception {
        assertThat(json(result(ServiceResultCode.SUCCESS, null, null, Map.of()))).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":true,\"code\":\"0000\",\"message\":null}}");
    }

    @Test
    void 상세_없는_업무_예외는_meta_만_싣는다() throws Exception {
        BusinessException e = new BusinessException(ErrorCode.ACCESS_DENIED, "거부");

        assertThat(json(failed(ServiceResultCode.SYSTEM_ERROR, e))).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":false,\"code\":\"S001\",\"message\":\"거부\"}}");
    }

    @Test
    void 일반_예외는_meta_만_싣는다() throws Exception {
        assertThat(json(failed(ServiceResultCode.SYSTEM_ERROR, new IllegalStateException("시스템 예외")))).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":false,\"code\":\"S001\",\"message\":\"시스템 예외\"}}");
    }

    @Test
    void 사용자_예외는_E001_meta_만_싣는다() throws Exception {
        assertThat(json(failed(ServiceResultCode.USER_ERROR, new RuntimeException("사용자")))).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":false,\"code\":\"E001\",\"message\":\"사용자\"}}");
    }

    @Test
    void 메시지가_없으면_기본_문구를_싣는다() throws Exception {
        assertThat(json(result(ServiceResultCode.SYSTEM_ERROR, null, new NullPointerException(), Map.of()))).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":false,\"code\":\"S001\",\"message\":\"오류가 발생했습니다.\"}}");
    }

    @Test
    void 상세_없는_ResponseCodeAware_예외는_그_코드로_meta_만_싣는다() throws Exception {
        RuntimeException wrapped = new RuntimeException("시스템 관리자만 할 수 있습니다", new CodedException());

        assertThat(json(failed(ServiceResultCode.SYSTEM_ERROR, wrapped))).isEqualTo(
                "{\"meta\":{\"txId\":\"tx\",\"success\":false,\"code\":\"MDM027\",\"message\":\"시스템 관리자만 할 수 있습니다\"}}");
    }
}
