package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.ext.WidgetExtService;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtExchangeRequest;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtWeatherRequest;
import com.dongkuk.oasis.utils.ObjectUtil;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * {@code services/roleManagement/widgetExt.bpmn} 의 OASIS 계약(스펙 2026-10-02-widget-admin-generic §5.1) — 스프링 없이
 * XML 만 파싱한다(SecWidgetBpmnActionTest 와 같은 방식). 두 action 모두 dto 하나를 받고, 요청 params·grids 가 OASIS 의
 * DTO 변환({@link ObjectUtil#convertMapToObject})으로 그 dto 에 들어가는지도 본다(symbols 는 쉼표 문자열 또는 grids 행).
 */
class WidgetExtBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    @Test
    void widgetExt_는_exchange_weather_두_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/roleManagement/widgetExt.bpmn");

        assertEquals("widgetExt", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("exchange", "weather"), List.copyOf(byAction.keySet()));

        assertEquals(2, doc.getElementsByTagNameNS(BPMN, "serviceTask").getLength());
        for (Map.Entry<String, Element> e : byAction.entrySet()) {
            Element task = e.getValue();
            Map<String, String> props = properties(task);
            assertEquals("widgetExtService", task.getAttributeNS(CAMUNDA, "class"), e.getKey());
            assertEquals("result", props.get("output"), e.getKey() + " output (§6-C-2)");
            assertFalse(props.containsKey("grid"), e.getKey() + " grid 속성 금지 (§6-C-1)");
            assertEquals(e.getKey(), props.get("method"), "method 이름 = action");
        }
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        assertDto(byAction, "exchange", WidgetExtExchangeRequest.class);
        assertDto(byAction, "weather", WidgetExtWeatherRequest.class);

        assertEquals("widgetExtService", WidgetExtService.class.getAnnotation(Service.class).value());
        assertFalse(WidgetExtService.class.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : WidgetExtService.class.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName());
        }
    }

    @Test
    void exchange_요청은_쉼표_문자열과_grids_행_둘_다_dto_로_들어간다() {
        Map<String, Object> params = new HashMap<>();
        params.put("action", "exchange");
        params.put("base", "KRW");
        params.put("symbols", "USD,EUR");
        params.put("days", 30);
        WidgetExtExchangeRequest fromParams = ObjectUtil.convertMapToObject(params, WidgetExtExchangeRequest.class);
        assertEquals("KRW", fromParams.getBase());
        assertEquals("USD,EUR", fromParams.getSymbols());
        assertEquals(30, fromParams.getDays());

        Map<String, Object> grids = new HashMap<>();
        grids.put("symbols", List.of(Map.of("cur", "USD"), Map.of("cur", "JPY")));
        WidgetExtExchangeRequest fromGrids = ObjectUtil.convertMapToObject(grids, WidgetExtExchangeRequest.class);
        List<?> rows = assertInstanceOf(List.class, fromGrids.getSymbols());
        assertEquals(2, rows.size());
        assertEquals("JPY", assertInstanceOf(Map.class, rows.get(1)).get("cur"));
        assertEquals(null, fromGrids.getDays(), "days 가 없으면 null → 서비스 기본 30");
    }

    @Test
    void weather_요청의_위도_경도는_숫자_문자열_모두_BigDecimal_로_들어간다() {
        Map<String, Object> params = new HashMap<>();
        params.put("lat", 37.5665);
        params.put("lon", "126.978");
        WidgetExtWeatherRequest r = ObjectUtil.convertMapToObject(params, WidgetExtWeatherRequest.class);
        assertEquals(0, new BigDecimal("37.5665").compareTo(r.getLat()));
        assertEquals(0, new BigDecimal("126.978").compareTo(r.getLon()));
    }

    private static void assertDto(Map<String, Element> byAction, String action, Class<?> dto) {
        assertEquals(dto.getName(), properties(byAction.get(action)).get("dto"), action);
        Method m = method(WidgetExtService.class, action);
        assertEquals(1, m.getParameterCount(), action + " 파라미터는 dto 하나");
        assertEquals(dto, m.getParameterTypes()[0], action + " 첫 파라미터 = dto");
        assertEquals(Map.class, m.getReturnType(), action + " 는 Map 을 돌려준다(output=result)");
    }

    // ── helpers: SecWidgetBpmnActionTest 에서 그대로 옮긴다 ──

    private static Method method(Class<?> type, String name) {
        List<Method> found = Arrays.stream(type.getMethods()).filter(m -> m.getName().equals(name)).toList();
        assertEquals(1, found.size(), name + " 는 public 메서드 하나");
        return found.get(0);
    }

    private static String processId(Document doc) {
        Element process = (Element) doc.getElementsByTagNameNS(BPMN, "process").item(0);
        assertEquals("true", process.getAttribute("isExecutable"));
        return process.getAttribute("id");
    }

    private static Map<String, Element> tasksByAction(Document doc) {
        Map<String, Element> tasks = new HashMap<>();
        NodeList list = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        for (int i = 0; i < list.getLength(); i++) {
            Element t = (Element) list.item(i);
            tasks.put(t.getAttribute("id"), t);
        }
        Map<String, Element> out = new TreeMap<>();
        NodeList flows = doc.getElementsByTagNameNS(BPMN, "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                Element target = tasks.get(flow.getAttribute("targetRef"));
                assertNotNull(target, flow.getAttribute("name") + " 분기의 대상이 serviceTask 가 아니다");
                out.put(flow.getAttribute("name"), target);
            }
        }
        assertTrue(!out.isEmpty(), "actionGateway 분기가 없다");
        return out;
    }

    private static Map<String, String> properties(Element task) {
        Map<String, String> props = new HashMap<>();
        NodeList list = task.getElementsByTagNameNS(CAMUNDA, "property");
        for (int i = 0; i < list.getLength(); i++) {
            Element p = (Element) list.item(i);
            props.put(p.getAttribute("name"), p.getAttribute("value"));
        }
        return props;
    }

    private static Document parse(String path) throws Exception {
        try (InputStream in = WidgetExtBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
