package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.memo.service.WidgetMemoService;
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
 * {@code services/roleManagement/widgetMemo.bpmn} 의 OASIS 계약(스펙 2026-10-02-widget-admin-generic §17.3) — 스프링 없이 XML 만
 * 파싱한다({@link WidgetChatBpmnActionTest} 와 같은 방식). 두 action 모두 dto(params) 하나를 받고 output=result(Map).
 */
class WidgetMemoBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
    private static final String DTO = "com.dongkuk.dmes.mcm.widget.memo.dto.WidgetMemoRequest";

    @Test
    void widgetMemo_는_두_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/roleManagement/widgetMemo.bpmn");

        assertEquals("widgetMemo", processId(doc));
        Element gateway = (Element) doc.getElementsByTagNameNS(BPMN, "exclusiveGateway").item(0);
        assertEquals("actionGateway", gateway.getAttribute("id"));
        assertEquals("action", properties(gateway).get("input"), "게이트웨이는 params.action 으로 분기");

        Map<String, Element> byAction = tasksByAction(doc);
        // widgetMemo 는 서비스 접두(widgetmemo/)로 AUTH_ONLY 다. action 을 더하면 이 단언이 깨지고, 그때 새 action 이
        // 모든 로그인 사용자에게 열려도 되는지(AUTH_ONLY 범위)를 다시 검토한다(스펙 §17.5).
        assertEquals(List.of("load", "save"), List.copyOf(byAction.keySet()));
        assertEquals(2, doc.getElementsByTagNameNS(BPMN, "serviceTask").getLength());
        for (Map.Entry<String, Element> e : byAction.entrySet()) {
            Element task = e.getValue();
            Map<String, String> props = properties(task);
            assertEquals("widgetMemoService", task.getAttributeNS(CAMUNDA, "class"), e.getKey());
            assertEquals("result", props.get("output"), e.getKey() + " output (§6-C-2)");
            assertFalse(props.containsKey("grid"), e.getKey() + " grid 속성 금지 (§6-C-1)");
            assertEquals(e.getKey(), props.get("method"), "method 이름 = action");
            assertEquals(DTO, props.get("dto"), e.getKey() + " dto");
            Method m = method(WidgetMemoService.class, e.getKey());
            assertEquals(1, m.getParameterCount(), e.getKey() + " 는 dto 하나");
            assertEquals(DTO, m.getParameterTypes()[0].getName(), e.getKey() + " 첫 파라미터 = dto");
            assertEquals(Map.class, m.getReturnType(), e.getKey() + " 는 Map 을 돌려준다(data.result)");
        }
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        assertEquals("widgetMemoService", WidgetMemoService.class.getAnnotation(Service.class).value());
        assertFalse(WidgetMemoService.class.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : WidgetMemoService.class.getDeclaredMethods()) {
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
        try (InputStream in = WidgetMemoBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
