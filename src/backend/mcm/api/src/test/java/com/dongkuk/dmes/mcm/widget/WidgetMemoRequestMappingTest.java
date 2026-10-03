package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.mcm.widget.memo.dto.WidgetMemoRequest;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.utils.ObjectUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * 메모장 제목(2026-10-03)의 「키 없음 = 기존 제목 유지, 빈 문자열 = 지움」 규칙은 요청 본문이 {@link WidgetMemoRequest} 로 옮겨지는 실제 경로가
 * 키 없음을 null, {@code ""} 를 {@code ""} 로 보존한다는 데 기댄다. 그 경로를 실제 클래스로 고정한다:
 * 본문 JSON → {@link CactusRequest}(Jackson) → {@link CactusRequestConverter#convert}(params 마다 TypedObject) →
 * OASIS DTO 변환({@code DtoGeneratorFromServiceContextAndProcessAndInputsContext} 가 부르는 {@link ObjectUtil#convertMapToObject}, Gson).
 * 스프링·DB 없이 돈다. 서비스 쪽 처리는 mcm-core 의 WidgetMemoServiceTest 가 맡는다.
 */
class WidgetMemoRequestMappingTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private final CactusRequestConverter converter = new CactusRequestConverter();

    /** 본문 JSON(params 안쪽) → 서비스가 받는 DTO. */
    private WidgetMemoRequest toDto(String paramsJson) throws Exception {
        CactusRequest request = JSON.readValue("{\"meta\":{\"menuId\":\"HOME\"},\"params\":" + paramsJson + "}", CactusRequest.class);
        Map<String, TypedObject> inputs = converter.convert(request, "save");
        Map<String, Object> flat = inputs.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getObject()));
        return ObjectUtil.convertMapToObject(flat, WidgetMemoRequest.class);
    }

    @Test
    void title_키가_없으면_DTO_title_은_null_이라_서비스가_기존_제목을_유지한다() throws Exception {
        WidgetMemoRequest dto = toDto("{\"instId\":\"i1\",\"defId\":\"def.abc12345\",\"format\":\"text\",\"content\":\"글\"}");
        assertNull(dto.getTitle());
        assertEquals("i1", dto.getInstId());
        assertEquals("글", dto.getContent());
    }

    @Test
    void title_이_빈_문자열이면_그대로_빈_문자열이라_서비스가_제목을_지운다() throws Exception {
        WidgetMemoRequest dto = toDto("{\"instId\":\"i1\",\"content\":\"글\",\"title\":\"\"}");
        assertEquals("", dto.getTitle());
    }

    @Test
    void title_은_자르거나_바꾸지_않고_원문으로_도착한다() throws Exception {
        assertEquals("  나의 할 일  ", toDto("{\"instId\":\"i1\",\"title\":\"  나의 할 일  \"}").getTitle());
        assertEquals("   ", toDto("{\"instId\":\"i1\",\"title\":\"   \"}").getTitle());
    }

    @Test
    void title_을_null_로_보내면_변환기가_요청_전체를_거절한다_그래서_화면은_비운_제목을_빈_문자열로_보낸다() {
        // CactusRequestConverter 는 params 값마다 new TypedObject(value) 를 만들고, null 이면 IllegalArgumentException 이다.
        Map<String, Object> params = new HashMap<>();
        params.put("instId", "i1");
        params.put("title", null);
        CactusRequest request = new CactusRequest(null, params, null);
        assertThrows(IllegalArgumentException.class, () -> converter.convert(request, "save"));
    }
}
