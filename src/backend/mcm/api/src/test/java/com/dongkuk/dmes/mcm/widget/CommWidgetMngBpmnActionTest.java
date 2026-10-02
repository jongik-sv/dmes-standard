package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.admin.service.CommWidgetMngService;
import com.dongkuk.dmes.mcm.widget.layout.service.CommWidgetLayoutService;
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
 * {@code services/csa/commWidgetMng.bpmn} 의 OASIS 계약 — 스프링 없이 XML 만 파싱한다({@link SecWidgetBpmnActionTest} 와 같은 방식).
 * 정의 action 4개는 commWidgetMngService, 기본 배치 action 5개는 commWidgetLayoutService. saveLayout 은 dto(params) +
 * grids.widgets.rows 두 파라미터(secWidget saveTab 과 같은 모양). action 이름은 DataInitializer 의 PERM_ALL 토큰과 같아야 한다.
 */
class CommWidgetMngBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
    private static final String MNG_DTO = "com.dongkuk.dmes.mcm.widget.admin.dto.CommWidgetMngRequest";
    private static final String SAVE_DTO = "com.dongkuk.dmes.mcm.widget.admin.dto.WidgetDefSaveRequest";
    private static final String LAYOUT_DTO = "com.dongkuk.dmes.mcm.widget.layout.dto.CommWidgetLayoutRequest";

    /** action → (빈 이름, 서비스 클래스, dto). */
    private record Binding(String bean, Class<?> service, String dto) {}

    private static final Map<String, Binding> EXPECTED = new TreeMap<>(Map.of(
            "search", new Binding("commWidgetMngService", CommWidgetMngService.class, MNG_DTO),
            "save", new Binding("commWidgetMngService", CommWidgetMngService.class, SAVE_DTO),
            "delete", new Binding("commWidgetMngService", CommWidgetMngService.class, MNG_DTO),
            "previewQuery", new Binding("commWidgetMngService", CommWidgetMngService.class, MNG_DTO),
            "searchLayouts", new Binding("commWidgetLayoutService", CommWidgetLayoutService.class, LAYOUT_DTO),
            "loadLayout", new Binding("commWidgetLayoutService", CommWidgetLayoutService.class, LAYOUT_DTO),
            "saveLayout", new Binding("commWidgetLayoutService", CommWidgetLayoutService.class, LAYOUT_DTO),
            "deleteLayout", new Binding("commWidgetLayoutService", CommWidgetLayoutService.class, LAYOUT_DTO),
            "searchDepts", new Binding("commWidgetLayoutService", CommWidgetLayoutService.class, LAYOUT_DTO)));

    @Test
    void commWidgetMng_는_아홉_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/csa/commWidgetMng.bpmn");

        assertEquals("commWidgetMng", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.copyOf(EXPECTED.keySet()), List.copyOf(byAction.keySet()));
        assertEquals(9, doc.getElementsByTagNameNS(BPMN, "serviceTask").getLength());
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        for (Map.Entry<String, Element> e : byAction.entrySet()) {
            String action = e.getKey();
            Binding expected = EXPECTED.get(action);
            Element task = e.getValue();
            Map<String, String> props = properties(task);
            assertEquals(expected.bean(), task.getAttributeNS(CAMUNDA, "class"), action + " 빈 이름");
            assertEquals(action, props.get("method"), "method 이름 = action");
            assertEquals("result", props.get("output"), action + " output (§6-C-2)");
            assertFalse(props.containsKey("grid"), action + " grid 속성 금지 (§6-C-1)");
            assertEquals(expected.dto(), props.get("dto"), action + " dto");

            Method m = method(expected.service(), action);
            assertEquals(expected.dto(), m.getParameterTypes()[0].getName(), action + " 첫 파라미터 = dto");
            assertEquals(Map.class, m.getReturnType(), action + " 반환 = Map(result)");
            assertEquals("saveLayout".equals(action) ? 2 : 1, m.getParameterCount(), action + " 파라미터 수");
        }

        Method saveLayout = method(CommWidgetLayoutService.class, "saveLayout");
        assertEquals("widgets", saveLayout.getParameters()[1].getName(), "grids.widgets.rows ↔ 파라미터 이름 (§6-E-3)");
        assertEquals(List.class, saveLayout.getParameterTypes()[1]);

        assertServiceBean(CommWidgetMngService.class, "commWidgetMngService");
        assertServiceBean(CommWidgetLayoutService.class, "commWidgetLayoutService");
    }

    private static void assertServiceBean(Class<?> type, String bean) {
        assertEquals(bean, type.getAnnotation(Service.class).value());
        assertFalse(type.isAnnotationPresent(Transactional.class), type.getSimpleName() + " @Transactional 금지 (§6-B-1)");
        for (Method m : type.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), type.getSimpleName() + "." + m.getName());
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
        try (InputStream in = CommWidgetMngBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
