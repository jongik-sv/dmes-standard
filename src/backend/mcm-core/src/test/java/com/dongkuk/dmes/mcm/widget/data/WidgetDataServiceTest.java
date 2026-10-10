package com.dongkuk.dmes.mcm.widget.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** {@link WidgetDataService} — defId 만 읽어 행 상한 500 으로 실행기에 맡긴다(스펙 2026-10-02-widget-admin-generic §5.1). */
@ExtendWith(MockitoExtension.class)
class WidgetDataServiceTest {

    @Mock WidgetQueryRunner queryRunner;

    @InjectMocks WidgetDataService service;

    private static WidgetDataRunRequest request(String defId) {
        WidgetDataRunRequest r = new WidgetDataRunRequest();
        r.setDefId(defId);
        return r;
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   ", "null"})
    @DisplayName("defId 가 없으면 실행기를 부르지 않고 거절한다")
    void rejectsMissingDefId(String defId) {
        assertThatThrownBy(() -> service.run(request(defId)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("위젯 정의 ID 가 없습니다")
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));
        verifyNoInteractions(queryRunner);
    }

    @Test
    @DisplayName("요청이 아예 없어도 거절한다")
    void rejectsNullRequest() {
        assertThatThrownBy(() -> service.run(null)).isInstanceOf(BusinessException.class).hasMessage("위젯 정의 ID 가 없습니다");
        verifyNoInteractions(queryRunner);
    }

    @Test
    @DisplayName("행 상한 500 으로 위임하고 { columns, rows, truncated } 를 돌려준다")
    void delegatesWith500Rows() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("A", 1);
        row.put("B", null);
        when(queryRunner.runDefinition("def.k3x9q2ab", 500, Map.of()))
                .thenReturn(new WidgetQueryResult(List.of("A", "B"), List.of(row), true));

        Map<String, Object> result = service.run(request("  def.k3x9q2ab "));

        verify(queryRunner).runDefinition("def.k3x9q2ab", 500, Map.of());
        assertThat(result.keySet()).containsExactly("columns", "rows", "truncated");
        assertThat(result.get("columns")).isEqualTo(List.of("A", "B"));
        assertThat(result.get("rows")).isEqualTo(List.of(row));
        assertThat(result.get("truncated")).isEqualTo(true);
    }

    @Test
    @DisplayName("paramsJson 의 값은 글자·숫자·불리언을 글자로 바꿔 3인자로 넘긴다(null 은 값 없음)")
    void passesInputValues() {
        WidgetDataRunRequest r = request("def.k3x9q2ab");
        r.setParamsJson("{\"plant\":\"P1\",\"qty\":12.50,\"on\":true,\"skip\":null}");
        when(queryRunner.runDefinition("def.k3x9q2ab", 500, Map.of("plant", "P1", "qty", "12.50", "on", "true")))
                .thenReturn(new WidgetQueryResult(List.of(), List.of(), false));

        service.run(r);

        verify(queryRunner).runDefinition("def.k3x9q2ab", 500, Map.of("plant", "P1", "qty", "12.50", "on", "true"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "[\"a\"]", "\"x\"", "12", "not json", "{\"a\":[1,2]}", "{\"a\":{\"b\":1}}",
            "{\"a\":\"1\",\"a\":\"2\"}", "{\"a\":\"1\"} junk"})
    @DisplayName("paramsJson 이 객체가 아니거나 값이 객체·숫자 배열·빈 배열이거나 겹친 키·군더더기가 있으면 실행기를 부르지 않고 거절한다")
    void rejectsNonScalarValues(String paramsJson) {
        WidgetDataRunRequest r = request("def.k3x9q2ab");
        r.setParamsJson(paramsJson);
        assertThatThrownBy(() -> service.run(r)).isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        verifyNoInteractions(queryRunner);
    }

    @Test
    @DisplayName("paramsJson 이 16000자를 넘으면 거절한다")
    void rejectsTooLongParamsJson() {
        WidgetDataRunRequest r = request("def.k3x9q2ab");
        r.setParamsJson("{\"a\":\"" + "x".repeat(16000) + "\"}");
        assertThatThrownBy(() -> service.run(r)).isInstanceOf(BusinessException.class).hasMessageContaining("너무 깁니다");
        verifyNoInteractions(queryRunner);
    }

    @Test
    @DisplayName("실행기 거절(사용 중지 등)은 그대로 전한다")
    void propagatesRunnerErrors() {
        when(queryRunner.runDefinition("def.off00000", 500, Map.of()))
                .thenThrow(new BusinessException(ErrorCode.BUSINESS_ERROR, "사용 중지된 위젯입니다"));
        assertThatThrownBy(() -> service.run(request("def.off00000"))).hasMessage("사용 중지된 위젯입니다");
    }
}
