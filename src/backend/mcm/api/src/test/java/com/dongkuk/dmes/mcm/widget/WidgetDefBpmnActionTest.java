package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.def.service.WidgetDefService;
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
 * {@code services/roleManagement/widgetDef.bpmn} 의 OASIS 계약 — 스프링 없이 XML 만 파싱한다({@link SecWidgetBpmnActionTest} 와 같은 방식).
 * 사용자용(AUTH_ONLY) 조회 하나: list → widgetDefService.list(WidgetDefListRequest), output=result.
 */
class WidgetDefBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
    private static final String DTO = "com.dongkuk.dmes.mcm.widget.def.dto.WidgetDefListRequest";

    @Test
    void widgetDef_는_list_분기_하나이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/roleManagement/widgetDef.bpmn");

        assertEquals("widgetDef", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("list"), List.copyOf(byAction.keySet()));
        assertEquals(1, doc.getElementsByTagNameNS(BPMN, "serviceTask").getLength());

        Element task = byAction.get("list");
        Map<String, String> props = properties(task);
        assertEquals("widgetDefService", task.getAttributeNS(CAMUNDA, "class"));
        assertEquals("list", props.get("method"), "method 이름 = action");
        assertEquals("result", props.get("output"), "output (§6-C-2)");
        assertFalse(props.containsKey("grid"), "grid 속성 금지 (§6-C-1)");
        assertEquals(DTO, props.get("dto"));
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        Method list = method(WidgetDefService.class, "list");
        assertEquals(1, list.getParameterCount());
        assertEquals(DTO, list.getParameterTypes()[0].getName(), "첫 파라미터 = dto");
        assertEquals(Map.class, list.getReturnType());

        assertEquals("widgetDefService", WidgetDefService.class.getAnnotation(Service.class).value());
        assertFalse(WidgetDefService.class.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : WidgetDefService.class.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName());
        }
    }

    // ── helpers: SecWidgetBpmnActionTest 와 같다 ──

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
        try (InputStream in = WidgetDefBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
