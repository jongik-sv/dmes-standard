package com.dongkuk.dmes.mcm.widget.def;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.dto.WidgetDefListRequest;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.def.service.WidgetDefService;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** {@link WidgetDefService} — 사용자용 목록의 서버 전용 키 제거(Review Focus 3)와 부서 → 상위 부서 → 전사 기본 배치(§4.2). */
@ExtendWith(MockitoExtension.class)
class WidgetDefServiceTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock WidgetDefRepository defRepository;
    @Mock WidgetDefaultLayoutRepository layoutRepository;
    @Mock WidgetUserContextResolver userContextResolver;

    @InjectMocks WidgetDefService service;

    private static WidgetDef def(String widgetId, String srcTp, String typeId, String configJson) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(widgetId);
        d.setSrcTp(srcTp);
        d.setTypeId(typeId);
        d.setTitle("제목 " + widgetId);
        d.setDefW(8);
        d.setDefH(6);
        d.setUseYn("Y");
        d.setDataSrc(typeId != null && typeId.startsWith("query-") ? "mcm" : null);
        d.setConfigJson(configJson);
        return d;
    }

    private static WidgetDefaultLayout layout(String key, String instId, String widgetId) {
        WidgetDefaultLayout l = new WidgetDefaultLayout();
        l.setLayoutKey(key);
        l.setInstId(instId);
        l.setWidgetId(widgetId);
        l.setPosX(0);
        l.setPosY(0);
        l.setSizeW(12);
        l.setSizeH(6);
        l.setLockYn("Y");
        return l;
    }

    /** 키별 배치 — 없는 키는 빈 목록(strict stub 이 다른 인자 호출을 문제로 보지 않게 인자로 답한다). */
    private void layouts(Map<String, List<WidgetDefaultLayout>> byKey) {
        when(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc(anyString()))
                .thenAnswer(inv -> byKey.getOrDefault(inv.getArgument(0, String.class), List.of()));
    }

    private void userInDepts(String... chain) {
        String deptCd = chain.length == 0 ? null : chain[0];
        when(userContextResolver.current())
                .thenReturn(new WidgetUserContext("userA", "사용자A", deptCd, null, List.of(chain)));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> defs(Map<String, Object> result) {
        return (List<Map<String, Object>>) result.get("defs");
    }

    private static Map<String, Object> byId(Map<String, Object> result, String widgetId) {
        return defs(result).stream().filter(m -> widgetId.equals(m.get("widgetId"))).findFirst().orElseThrow();
    }

    private static JsonNode config(Map<String, Object> row) throws Exception {
        return JSON.readTree((String) row.get("configJson"));
    }

    @Test
    @DisplayName("목록은 query-* 의 sql, chat 의 systemPrompt·dataQueryDefIds 를 지우고 다른 키는 남긴다. 깨진 JSON 은 null")
    void listStripsServerOnlyKeys() throws Exception {
        when(defRepository.findAllByOrderByWidgetIdAsc()).thenReturn(List.of(
                def("def.c1", "D", "chat",
                        "{\"systemPrompt\":\"비밀 지시\",\"dataQueryDefIds\":[\"def.q1\"],\"welcome\":\"안녕\",\"pageGuide\":true}"),
                def("def.md1", "D", "markdown", "{\"markdown\":\"# 제목\"}"),
                def("def.md2", "D", "markdown", "{broken"),
                def("def.q1", "D", "query-table", "{\"sql\":\"select * from t\",\"columns\":[{\"field\":\"A\"}]}"),
                def("def.q2", "D", "query-number", "{\"sql\":\"select 1 v\",\"valueField\":\"V\"}"),
                def("home.notice", "C", null, null)));
        userInDepts();

        Map<String, Object> result = service.list(new WidgetDefListRequest());

        assertThat(defs(result)).hasSize(6);
        JsonNode q1 = config(byId(result, "def.q1"));
        assertThat(q1.has("sql")).isFalse();
        assertThat(q1.path("columns").get(0).path("field").asText()).isEqualTo("A");
        assertThat(config(byId(result, "def.q2")).has("sql")).isFalse();
        assertThat(config(byId(result, "def.q2")).path("valueField").asText()).isEqualTo("V");
        JsonNode c1 = config(byId(result, "def.c1"));
        assertThat(c1.has("systemPrompt")).isFalse();
        assertThat(c1.has("dataQueryDefIds")).isFalse();
        assertThat(c1.path("welcome").asText()).isEqualTo("안녕");
        assertThat(c1.path("pageGuide").asBoolean()).isTrue();
        assertThat(byId(result, "def.md1").get("configJson")).isEqualTo("{\"markdown\":\"# 제목\"}");
        assertThat(byId(result, "def.md2").get("configJson")).isNull();
        assertThat(byId(result, "home.notice").get("configJson")).isNull();

        Map<String, Object> q1Row = byId(result, "def.q1");
        assertThat(q1Row.keySet()).containsExactly("widgetId", "srcTp", "typeId", "title", "subtitle", "description",
                "defW", "defH", "minW", "minH", "maxW", "maxH", "refreshSec", "linkPageId", "multipleYn", "useYn",
                "dataSrc", "categoryCd", "privateYn", "placeTp", "configJson");
        assertThat(q1Row).containsEntry("srcTp", "D").containsEntry("typeId", "query-table")
                .containsEntry("defW", 8).containsEntry("useYn", "Y").containsEntry("dataSrc", "mcm");
        assertThat(result).containsEntry("homeDefault", null).containsEntry("homeDefaultKey", null);
    }

    @Test
    @DisplayName("자기 부서 D100 배치가 있으면 그것을 돌려준다")
    void ownDeptLayout() {
        when(defRepository.findAllByOrderByWidgetIdAsc()).thenReturn(List.of());
        userInDepts("D100", "D10");
        layouts(Map.of("D100", List.of(layout("D100", "w1", "home.notice")),
                "*", List.of(layout("*", "c1", "home.todo"))));

        Map<String, Object> result = service.list(new WidgetDefListRequest());

        assertThat(result.get("homeDefaultKey")).isEqualTo("D100");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) result.get("homeDefault");
        assertThat(items).containsExactly(Map.of("instId", "w1", "widgetId", "home.notice", "posX", 0, "posY", 0,
                "sizeW", 12, "sizeH", 6, "lockYn", "Y"));
    }

    @Test
    @DisplayName("자기 부서 배치가 없고 상위 부서 D10 배치가 있으면 D10")
    void upperDeptLayout() {
        when(defRepository.findAllByOrderByWidgetIdAsc()).thenReturn(List.of());
        userInDepts("D100", "D10");
        layouts(Map.of("D10", List.of(layout("D10", "w1", "home.notice"), layout("D10", "w2", "home.todo")),
                "*", List.of(layout("*", "c1", "home.todo"))));

        Map<String, Object> result = service.list(new WidgetDefListRequest());

        assertThat(result.get("homeDefaultKey")).isEqualTo("D10");
        assertThat((List<?>) result.get("homeDefault")).hasSize(2);
    }

    @Test
    @DisplayName("부서·상위 부서 배치가 없으면 전사(*) 배치")
    void companyLayout() {
        when(defRepository.findAllByOrderByWidgetIdAsc()).thenReturn(List.of());
        userInDepts("D100", "D10");
        layouts(Map.of("*", List.of(layout("*", "w1", "home.notice"))));

        Map<String, Object> result = service.list(new WidgetDefListRequest());

        assertThat(result.get("homeDefaultKey")).isEqualTo("*");
        assertThat((List<?>) result.get("homeDefault")).hasSize(1);
    }

    @Test
    @DisplayName("부서가 없는 사용자도 전사 배치를 보고, 아무 배치도 없으면 homeDefault·homeDefaultKey 가 null")
    void noLayout() {
        when(defRepository.findAllByOrderByWidgetIdAsc()).thenReturn(List.of());
        userInDepts("D100");

        Map<String, Object> result = service.list(new WidgetDefListRequest());

        assertThat(result).containsEntry("homeDefault", null).containsEntry("homeDefaultKey", null);
        assertThat(defs(result)).isEmpty();
    }
}
