package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.service.SecWidgetService;
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
 * {@code services/roleManagement/secWidget.bpmn} 의 OASIS 계약 — 스프링 없이 XML 만 파싱한다(mls NoticeBpmnActionTest 와 같은 방식).
 * saveTab 은 dto(params) + grids.widgets.rows 두 파라미터(mdm headerMng.save 와 같은 모양), reorderTabs 는 grids.tabs.rows 하나,
 * shareTab 은 dto(params) + grids.targets.rows 두 파라미터.
 */
class SecWidgetBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    @Test
    void secWidget_는_여덟_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/roleManagement/secWidget.bpmn");

        assertEquals("secWidget", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("deleteTab", "reorderTabs", "resetHome", "resetTab", "saveTab", "search", "searchUsers", "shareTab"),
                List.copyOf(byAction.keySet()));

        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(8, tasks.getLength());
        for (Map.Entry<String, Element> e : byAction.entrySet()) {
            Element task = e.getValue();
            Map<String, String> props = properties(task);
            assertEquals("secWidgetService", task.getAttributeNS(CAMUNDA, "class"), e.getKey());
            assertEquals("result", props.get("output"), e.getKey() + " output (§6-C-2)");
            assertFalse(props.containsKey("grid"), e.getKey() + " grid 속성 금지 (§6-C-1)");
            assertEquals(e.getKey(), props.get("method"), "method 이름 = action");
        }
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        assertDto(byAction, "search", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest");
        assertDto(byAction, "resetHome", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest");
        assertDto(byAction, "deleteTab", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest");
        assertDto(byAction, "saveTab", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest");
        assertFalse(properties(byAction.get("reorderTabs")).containsKey("dto"), "reorderTabs 는 grids.tabs 만");
        // 기본 탭·공유(docs/widget-2026-10/design-widget-tabs.md §3.1)
        assertDto(byAction, "resetTab", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest");
        assertDto(byAction, "shareTab", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest");
        assertDto(byAction, "searchUsers", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetUserSearchRequest");
        Method share = method(SecWidgetService.class, "shareTab");
        assertEquals(2, share.getParameterCount());
        assertEquals("targets", share.getParameters()[1].getName(), "grids.targets.rows ↔ 파라미터 이름 (§6-E-3)");
        assertEquals(List.class, share.getParameterTypes()[1]);

        Method save = method(SecWidgetService.class, "saveTab");
        assertEquals(2, save.getParameterCount());
        assertEquals("widgets", save.getParameters()[1].getName(), "grids.widgets.rows ↔ 파라미터 이름 (§6-E-3)");
        assertEquals("tabs", method(SecWidgetService.class, "reorderTabs").getParameters()[0].getName());

        assertEquals("secWidgetService", SecWidgetService.class.getAnnotation(Service.class).value());
        assertFalse(SecWidgetService.class.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : SecWidgetService.class.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName());
        }
    }

    private static void assertDto(Map<String, Element> byAction, String action, String dto) throws Exception {
        assertEquals(dto, properties(byAction.get(action)).get("dto"), action);
        assertEquals(dto, method(SecWidgetService.class, action).getParameterTypes()[0].getName(), action + " 첫 파라미터 = dto");
    }

    // ── helpers: mls NoticeBpmnActionTest 에서 그대로 옮긴다 ──

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
        try (InputStream in = SecWidgetBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
