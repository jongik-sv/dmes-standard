package com.dongkuk.dmes.mcm.widget.admin.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.query.QueryCodeLookup;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 위젯 저장 경로도 multi IN 자리 제한과 코드 그룹 확인을 거친다(2차 스펙 §2.6·§3.1). */
class WidgetDefConfigRulesQueryTest {

    private static final String SQL = "SELECT 1 FROM DUAL WHERE (:cnt = 0 OR 'S' IN (:st))";
    private static final String CONFIG = "{\"sql\":\"" + SQL + "\",\"params\":[{\"name\":\"st\",\"type\":\"multi\",\"countName\":\"cnt\","
            + "\"codeGroup\":\"WIDGET_CTG\"}]}";

    @Test
    @DisplayName("저장 검사가 multi 이름을 listNames 로 넘기고 선언 이름에 countName 을 넣으며, 코드 그룹이 없으면 거절한다")
    void passesListNamesAndChecksGroup() {
        WidgetQueryRunner runner = mock(WidgetQueryRunner.class);
        when(runner.validateSql(anyString(), anySet(), anySet())).thenReturn(List.of("st", "cnt"));
        QueryCodeLookup lookup = new QueryCodeLookup() {
            public Set<String> items(String groupCd) { return Set.of("PROD"); }
            public boolean groupExists(String groupCd) { return "WIDGET_CTG".equals(groupCd); }
        };
        WidgetDefConfigRules.check("query-table", "mcm", CONFIG, runner, lookup);
        verify(runner).validateSql(eq(SQL), eq(Set.of("st", "cnt")), eq(Set.of("st")));

        assertThatThrownBy(() -> WidgetDefConfigRules.check("query-table", "mcm", CONFIG.replace("WIDGET_CTG", "NO_SUCH"), runner, lookup))
                .isInstanceOf(BusinessException.class).hasMessageContaining("코드 그룹");
        assertThatThrownBy(() -> WidgetDefConfigRules.check("query-table", "mcm", CONFIG, runner, null))
                .isInstanceOf(BusinessException.class).hasMessageContaining("코드 그룹");
    }
}
