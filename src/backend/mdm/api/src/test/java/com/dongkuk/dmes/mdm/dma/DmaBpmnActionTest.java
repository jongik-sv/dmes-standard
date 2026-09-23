package com.dongkuk.dmes.mdm.dma;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.security.MdmActions;
import com.dongkuk.dmes.mdm.contract.security.MdmPermissions;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * TSK-04-04 design.md §3.3 — 두 BPMN 의 액션 분기가 허용 목록과 정확히 같은지(불변 규칙 I16).
 *
 * <p>액션 이름이 {@code MdmActions} 밖이면 SYSADMIN 도 BFF 403 이고(F14), 읽기 액션이 READ 세트 밖이면 담당자가
 * 분해조차 못 한다(D6). serviceTask 는 모두 {@code output=result} 이고 {@code grid} 속성이 없어야 한다(F11).
 */
class DmaBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    @Test
    void columnMng_액션은_search_view_compare_save() throws Exception {
        assertActions("services/dma/columnMng.bpmn", "columnMng", "columnMngService",
                Set.of("search", "view", "compare", "save"), Set.of("save"));
    }

    @Test
    void termRegPop_액션은_search_reg() throws Exception {
        assertActions("services/dma/termRegPop.bpmn", "termRegPop", "termRegPopService",
                Set.of("search", "reg"), Set.of("reg"));
    }

    private void assertActions(String path, String processId, String bean, Set<String> expected, Set<String> writes)
            throws Exception {
        Document doc = parse(path);
        Element process = (Element) doc.getElementsByTagNameNS(BPMN, "process").item(0);
        assertEquals(processId, process.getAttribute("id"));

        Set<String> actions = new HashSet<>();
        Map<String, String> targetByAction = new HashMap<>();
        NodeList flows = doc.getElementsByTagNameNS(BPMN, "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                actions.add(flow.getAttribute("name"));
                targetByAction.put(flow.getAttribute("name"), flow.getAttribute("targetRef"));
            }
        }
        assertEquals(expected, actions, path + " 분기 이름");
        Set<String> known = mdmActions();
        for (String action : actions) {
            assertTrue(known.contains(action), action + " 은 MdmActions 에 없다");
            if (!writes.contains(action)) {
                assertTrue(MdmPermissions.READ_ACTIONS.contains(action), action + " 은 READ 세트 밖이다");
            }
        }

        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(expected.size(), tasks.getLength());
        for (int i = 0; i < tasks.getLength(); i++) {
            Element task = (Element) tasks.item(i);
            assertEquals(bean, task.getAttributeNS(CAMUNDA, "class"), task.getAttribute("id"));
            Map<String, String> props = properties(task);
            assertEquals("result", props.get("output"), task.getAttribute("id") + " output");
            assertFalse(props.containsKey("grid"), task.getAttribute("id") + " 에 grid 속성 금지");
            assertNotNull(props.get("method"));
            String action = targetByAction.entrySet().stream()
                    .filter(e -> e.getValue().equals(task.getAttribute("id"))).map(Map.Entry::getKey)
                    .findFirst().orElseThrow();
            assertEquals(action, props.get("method"), "분기 이름과 메서드 이름이 같다");
        }
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

    private static Set<String> mdmActions() throws IllegalAccessException {
        Set<String> out = new HashSet<>();
        for (Field f : MdmActions.class.getDeclaredFields()) {
            if (Modifier.isStatic(f.getModifiers()) && f.getType() == String.class) {
                out.add((String) f.get(null));
            }
        }
        return out;
    }

    private static Document parse(String path) throws Exception {
        try (InputStream in = DmaBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
