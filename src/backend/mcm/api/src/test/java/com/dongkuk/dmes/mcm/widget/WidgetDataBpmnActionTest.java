package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.data.WidgetDataService;
import java.io.InputStream;
import java.lang.reflect.Method;
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
 * {@code services/roleManagement/widgetData.bpmn} 의 OASIS 계약 — 스프링 없이 XML 만 파싱한다(SecWidgetBpmnActionTest 와 같은 방식).
 * 스펙 2026-10-02-widget-admin-generic §5.1: action run 하나, params defId(dto), 응답 data.result.
 */
class WidgetDataBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
    private static final String DTO = "com.dongkuk.dmes.mcm.widget.data.WidgetDataRunRequest";

    @Test
    void widgetData_는_run_한_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/roleManagement/widgetData.bpmn");

        assertEquals("widgetData", processId(doc), "process id = 파일 이름 = objId");
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("run"), List.copyOf(byAction.keySet()));
        assertEquals(1, doc.getElementsByTagNameNS(BPMN, "serviceTask").getLength());
        assertEquals("action", properties(gateway(doc)).get("input"), "게이트웨이 분기 키");

        Element task = byAction.get("run");
        Map<String, String> props = properties(task);
        assertEquals("widgetDataService", task.getAttributeNS(CAMUNDA, "class"));
        assertEquals("run", props.get("method"), "method 이름 = action");
        assertEquals("result", props.get("output"), "output (§6-C-2)");
        assertFalse(props.containsKey("grid"), "grid 속성 금지 (§6-C-1)");
        assertEquals(DTO, props.get("dto"));
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        Method run = method(WidgetDataService.class, "run");
        assertEquals(1, run.getParameterCount(), "params 만 받는다 — grids 없음");
        assertEquals(DTO, run.getParameterTypes()[0].getName(), "첫 파라미터 = dto");
        assertEquals(Map.class, run.getReturnType(), "output=result 는 Map");

        assertEquals("widgetDataService", WidgetDataService.class.getAnnotation(Service.class).value());
        assertFalse(WidgetDataService.class.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : WidgetDataService.class.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName());
        }
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

    private static Element gateway(Document doc) {
        NodeList list = doc.getElementsByTagNameNS(BPMN, "exclusiveGateway");
        assertEquals(1, list.getLength(), "게이트웨이 하나");
        Element gw = (Element) list.item(0);
        assertEquals("actionGateway", gw.getAttribute("id"));
        return gw;
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

    private static Map<String, String> properties(Element element) {
        Map<String, String> props = new HashMap<>();
        NodeList list = element.getElementsByTagNameNS(CAMUNDA, "property");
        for (int i = 0; i < list.getLength(); i++) {
            Element p = (Element) list.item(i);
            props.put(p.getAttribute("name"), p.getAttribute("value"));
        }
        return props;
    }

    private static Document parse(String path) throws Exception {
        try (InputStream in = WidgetDataBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
