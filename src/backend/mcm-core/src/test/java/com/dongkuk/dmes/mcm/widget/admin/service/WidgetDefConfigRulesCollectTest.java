package com.dongkuk.dmes.mcm.widget.admin.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 정시 수집(collect) 저장 검사 — 스펙 2026-10-05 정시 수집 §2. 호스트 허용 판정은 호출자가 넘기는 술어(수집 설정)로 한다. */
class WidgetDefConfigRulesCollectTest {

    private static final String HTTP = "{\"schedule\":{\"mode\":\"interval\",\"everyMin\":10},\"source\":{\"kind\":\"http\","
            + "\"url\":\"https://api.example.com/q\",\"items\":[{\"key\":\"a\",\"path\":\"x\"}]}}";
    private static final String SQL = "{\"schedule\":{\"mode\":\"daily\",\"at\":[\"09:00\"]},\"source\":{\"kind\":\"sql\","
            + "\"sql\":\"SELECT 1 AS V FROM T\",\"valueField\":\"V\"}}";

    private final WidgetQueryRunner runner = mock(WidgetQueryRunner.class);

    @Test
    @DisplayName("collect 유형은 DATA_SRC 를 쓰지 않는다(null) — sql 원천은 실행기의 수집 SQL 검사를 거친다")
    void sqlSourceValidatedByRunner() {
        assertThat(WidgetDefConfigRules.check("collect", null, SQL, runner)).isNull();
        verify(runner).validateCollectSql("SELECT 1 AS V FROM T");
    }

    @Test
    @DisplayName("http·환율 원천은 SQL 검사를 부르지 않는다")
    void nonSqlSourcesSkipSqlValidation() {
        assertThat(WidgetDefConfigRules.check("collect", null, HTTP, runner)).isNull();
        assertThat(WidgetDefConfigRules.check("collect", "mcm", "{\"schedule\":{\"mode\":\"interval\",\"everyMin\":60},"
                + "\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\",\"JPY\"]},\"show\":{\"days\":30,\"unit\":\"원\"}}", runner)).isNull();
        verifyNoInteractions(runner);
    }

    @Test
    @DisplayName("호스트 허용 판정을 넘기면 http 원천의 호스트가 목록에 없을 때 저장을 거절한다 — 넘기지 않으면 저장 때는 보지 않는다")
    void hostAllowedPredicate() {
        assertThat(WidgetDefConfigRules.check("collect", null, HTTP, runner, host -> host.equals("api.example.com"))).isNull();
        assertThatThrownBy(() -> WidgetDefConfigRules.check("collect", null, HTTP, runner, host -> false))
                .isInstanceOf(BusinessException.class).hasMessageContaining("allowed-hosts");
        assertThat(WidgetDefConfigRules.check("collect", null, HTTP, runner, null)).isNull();
    }

    @Test
    @DisplayName("설정 규칙 위반은 저장 전에 한국어 한 문장으로 거절한다")
    void ruleViolationsRejected() {
        assertThatThrownBy(() -> WidgetDefConfigRules.check("collect", null,
                "{\"schedule\":{\"mode\":\"interval\",\"everyMin\":7},\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}}", runner))
                .isInstanceOf(BusinessException.class).hasMessageContaining("수집 주기");
        assertThatThrownBy(() -> WidgetDefConfigRules.check("collect", null, "{}", runner))
                .isInstanceOf(BusinessException.class).hasMessageContaining("수집 일정");
        assertThatThrownBy(() -> WidgetDefConfigRules.check("collect", null, HTTP.replace("https://api.example.com/q", "https://u:p@api.example.com/q"), runner))
                .isInstanceOf(BusinessException.class).hasMessageContaining("사용자 정보");
    }
}
