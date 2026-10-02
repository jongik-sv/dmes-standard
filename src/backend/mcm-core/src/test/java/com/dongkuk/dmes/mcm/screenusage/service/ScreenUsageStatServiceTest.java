package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 퍼사드는 action 하나를 쿼리 클래스 하나로 그대로 넘긴다(슬라이스 병합 뒤에도 성립). */
class ScreenUsageStatServiceTest {

    private final ScreenUsageOverviewQuery overview = mock(ScreenUsageOverviewQuery.class);
    private final ScreenUsageByScreenQuery byScreen = mock(ScreenUsageByScreenQuery.class);
    private final ScreenUsageByDeptQuery byDept = mock(ScreenUsageByDeptQuery.class);
    private final ScreenUsageByUserQuery byUser = mock(ScreenUsageByUserQuery.class);
    private final ScreenUsageUnusedQuery unused = mock(ScreenUsageUnusedQuery.class);
    private final ScreenUsageHistoryQuery history = mock(ScreenUsageHistoryQuery.class);
    private final ScreenUsageStatService service =
            new ScreenUsageStatService(overview, byScreen, byDept, byUser, unused, history);

    @Test
    @DisplayName("6개 action 을 각 쿼리 클래스로 넘기고 결과를 그대로 돌려준다")
    void delegates() {
        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        Map<String, Object> ov = Map.of("totalOpenCnt", 1L);
        List<Map<String, Object>> s = List.of(Map.of("pageId", "a"));
        List<Map<String, Object>> d = List.of(Map.of("deptCd", "b"));
        List<Map<String, Object>> u = List.of(Map.of("userId", "c"));
        List<Map<String, Object>> n = List.of(Map.of("pageId", "d"));
        List<Map<String, Object>> h = List.of(Map.of("usageId", "e"));
        when(overview.overview(r)).thenReturn(ov);
        when(byScreen.byScreen(r)).thenReturn(s);
        when(byDept.byDept(r)).thenReturn(d);
        when(byUser.byUser(r)).thenReturn(u);
        when(unused.unused(r)).thenReturn(n);
        when(history.history(r)).thenReturn(h);

        assertThat(service.overview(r)).isSameAs(ov);
        assertThat(service.byScreen(r)).isSameAs(s);
        assertThat(service.byDept(r)).isSameAs(d);
        assertThat(service.byUser(r)).isSameAs(u);
        assertThat(service.unused(r)).isSameAs(n);
        assertThat(service.history(r)).isSameAs(h);
    }

    @Test
    @DisplayName("빈 이름은 screenUsageStatService 이고 @Transactional 이 없다 (6-B-1)")
    void beanContract() {
        assertThat(ScreenUsageStatService.class.getAnnotation(Service.class).value()).isEqualTo("screenUsageStatService");
        assertThat(ScreenUsageStatService.class.isAnnotationPresent(Transactional.class)).isFalse();
    }
}
