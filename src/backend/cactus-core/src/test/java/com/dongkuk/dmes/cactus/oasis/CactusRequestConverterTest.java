package com.dongkuk.dmes.cactus.oasis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.GridData;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.oasis.TypedObject;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * {@link CactusRequestConverter} — 게이트웨이 분기 키 action 은 URL 경로 값만 쓴다(2026-10-03 보안 지적).
 * 본문 params·grids 의 action 이 경로 action 을 덮어쓰면 URL 로 권한을 판정한 action 과 실행되는 action 이 달라진다.
 */
class CactusRequestConverterTest {

    private final CactusRequestConverter converter = new CactusRequestConverter();

    private static CactusRequest request(Map<String, Object> params, Map<String, GridData> grids) {
        return new CactusRequest(new RequestMeta("u1", "M1"), params, grids);
    }

    @Test
    void 본문_params_의_action_은_경로_action_을_바꾸지_못하고_거절된다() {
        Map<String, Object> params = new HashMap<>();
        params.put("action", "previewQuery");
        params.put("sql", "SELECT 1");

        assertThatThrownBy(() -> converter.convert(request(params, null), "search"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE))
                .hasMessage(CactusRequestConverter.MSG_RESERVED_ACTION);
    }

    @Test
    void 본문_grids_의_action_이라는_그리드도_거절된다() {
        Map<String, GridData> grids = Map.of("action", new GridData(List.of(Map.of("x", 1))));

        assertThatThrownBy(() -> converter.convert(request(null, grids), "myMenus"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(CactusRequestConverter.MSG_RESERVED_ACTION);
    }

    @Test
    void 값이_경로와_같거나_null_이어도_본문의_action_키는_거절된다() {
        Map<String, Object> same = new HashMap<>();
        same.put("action", "search");
        Map<String, Object> nullValue = new HashMap<>();
        nullValue.put("action", null);

        assertThatThrownBy(() -> converter.convert(request(same, null), "search")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> converter.convert(request(nullValue, null), "search")).isInstanceOf(BusinessException.class);
    }

    @Test
    void 정상_요청은_params_grids_를_펼치고_action_은_경로_값이다() {
        Map<String, Object> params = new HashMap<>();
        params.put("widgetId", "W1");
        params.put("actionNm", "다른 이름은 그대로 통과");
        Map<String, GridData> grids = Map.of("widgets", new GridData(List.of(Map.of("x", 1))));

        Map<String, TypedObject> inputs = converter.convert(request(params, grids), "saveLayout");

        assertThat(inputs.get(CactusRequestConverter.ACTION_KEY).getObject()).isEqualTo("saveLayout");
        assertThat(inputs.get("widgetId").getObject()).isEqualTo("W1");
        assertThat(inputs.get("actionNm").getObject()).isEqualTo("다른 이름은 그대로 통과");
        assertThat(inputs.get("widgets").getObject()).isEqualTo(List.of(Map.of("x", 1)));
        assertThat(inputs).hasSize(4);
    }

    @Test
    void 본문이_비어도_action_만_들어간다() {
        Map<String, TypedObject> inputs = converter.convert(request(null, null), "list");

        assertThat(inputs).containsOnlyKeys("action");
        assertThat(inputs.get("action").getObject()).isEqualTo("list");
    }
}
