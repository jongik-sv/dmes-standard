package com.dongkuk.dmes.mcm.searchdefaults;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.searchdefaults.service.SecSrchDfltService;
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
 * {@code services/roleManagement/secSrchDflt.bpmn} 의 OASIS 계약 — 스프링 없이 XML 만 파싱한다({@code SecWidgetBpmnActionTest} 와 같은 방식).
 * savePage 는 dto(params: pageId) + grids.rows.rows 두 파라미터라 둘째 파라미터 이름이 {@code rows} 여야 한다.
 */
class SecSrchDfltBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
    private static final String DTO_PKG = "com.dongkuk.dmes.mcm.searchdefaults.dto.";

    @Test
    void secSrchDflt_는_세_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/roleManagement/secSrchDflt.bpmn");

        assertEquals("secSrchDflt", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("resetPage", "savePage", "search"), List.copyOf(byAction.keySet()));
        assertEquals(3, doc.getElementsByTagNameNS(BPMN, "serviceTask").getLength());

        for (Map.Entry<String, Element> e : byAction.entrySet()) {
            Element task = e.getValue();
            Map<String, String> props = properties(task);
            assertEquals("secSrchDfltService", task.getAttributeNS(CAMUNDA, "class"), e.getKey());
            assertEquals("result", props.get("output"), e.getKey() + " output (§6-C-2)");
            assertFalse(props.containsKey("grid"), e.getKey() + " grid 속성 금지 (§6-C-1)");
            assertEquals(e.getKey(), props.get("method"), "method 이름 = action");
        }
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        assertDto(byAction, "search", DTO_PKG + "SecSrchDfltSearchRequest");
        assertDto(byAction, "savePage", DTO_PKG + "SecSrchDfltPageRequest");
        assertDto(byAction, "resetPage", DTO_PKG + "SecSrchDfltPageRequest");

        Method save = method(SecSrchDfltService.class, "savePage");
        assertEquals(2, save.getParameterCount());
        assertEquals("rows", save.getParameters()[1].getName(), "grids.rows.rows ↔ 파라미터 이름 (§6-E-3)");
        assertEquals(List.class, save.getParameterTypes()[1]);

        assertEquals("secSrchDfltService", SecSrchDfltService.class.getAnnotation(Service.class).value());
        assertFalse(SecSrchDfltService.class.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : SecSrchDfltService.class.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName());
        }
    }

    private static void assertDto(Map<String, Element> byAction, String action, String dto) throws Exception {
        assertEquals(dto, properties(byAction.get(action)).get("dto"), action);
        assertEquals(dto, method(SecSrchDfltService.class, action).getParameterTypes()[0].getName(), action + " 첫 파라미터 = dto");
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
        try (InputStream in = SecSrchDfltBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
