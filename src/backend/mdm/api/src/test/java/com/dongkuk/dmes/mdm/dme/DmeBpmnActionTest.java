package com.dongkuk.dmes.mdm.dme;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.security.MdmPermissions;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * TSK-08-02 design §3.1 「DmeBpmnActionTest」·§6.1·I23 — dme BPMN 의 action → method 표가 설계와 정확히 같고, action 은 모두 권한
 * 세트 안에 있으며(읽기 action 은 READ 안), serviceTask 는 모두 {@code output=result}·{@code dto} 가 있고 {@code grid} 속성이 없다.
 * process id = serviceId = OBJECT_ID = screenId.
 */
class DmeBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    @Test
    void ruleMng_는_search_reg() throws Exception {
        assertActions("services/dme/ruleMng.bpmn", "ruleMng", "ruleMngService",
                Map.of("search", "search", "reg", "register"), Map.of("search", true, "reg", false));
    }

    @Test
    void ruleEdit_는_search_view_save_delete_copy_lock_unlock_handover_validate() throws Exception {
        Map<String, String> methods = new HashMap<>();
        methods.put("search", "search"); // target=RULE|DOMAIN 을 Java 가 가른다(TSK-08-03 — 새 action 은 mcm 시드 어휘 16종 밖이라 못 만든다)
        methods.put("validate", "parseExpr");
        methods.put("view", "view");
        methods.put("save", "save");
        methods.put("delete", "delete");
        methods.put("copy", "newVersion");
        methods.put("lock", "lock");
        methods.put("unlock", "unlock");
        methods.put("handover", "handover");
        Map<String, Boolean> readOnly = new HashMap<>();
        methods.keySet().forEach(a -> readOnly.put(a, a.equals("search") || a.equals("view")));
        assertActions("services/dme/ruleEdit.bpmn", "ruleEdit", "ruleEditService", methods, readOnly);
    }

    /** TSK-08-06 I17 — 룰 세트 조회·등록. */
    @Test
    void ruleSetMng_는_search_reg() throws Exception {
        assertActions("services/dme/ruleSetMng.bpmn", "ruleSetMng", "ruleSetMngService",
                Map.of("search", "search", "reg", "register"), Map.of("search", true, "reg", false));
    }

    /** TSK-08-06 I17 — 룰 세트 편집. search 의 갈래(target SET·RULE·GUIDE)는 Java 가 가른다. delete 는 폐기, restore 는 되살리기다. */
    @Test
    void ruleSetEdit_는_search_view_save_delete_restore() throws Exception {
        Map<String, String> methods = Map.of("search", "search", "view", "view", "save", "save", "delete", "delete", "restore", "restore");
        Map<String, Boolean> readOnly = new HashMap<>();
        methods.keySet().forEach(a -> readOnly.put(a, a.equals("search") || a.equals("view")));
        assertActions("services/dme/ruleSetEdit.bpmn", "ruleSetEdit", "ruleSetEditService", methods, readOnly);
    }

    private void assertActions(String path, String processId, String bean, Map<String, String> methodByAction, Map<String, Boolean> readOnly)
            throws Exception {
        Document doc = parse(path);
        Element process = (Element) doc.getElementsByTagNameNS(BPMN, "process").item(0);
        assertEquals(processId, process.getAttribute("id"));

        Map<String, String> targetByAction = new HashMap<>();
        NodeList flows = doc.getElementsByTagNameNS(BPMN, "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                targetByAction.put(flow.getAttribute("name"), flow.getAttribute("targetRef"));
            }
        }
        assertEquals(methodByAction.keySet(), targetByAction.keySet(), path + " 분기 이름");
        for (String action : targetByAction.keySet()) {
            assertTrue(MdmPermissions.CONFIRM_ACTIONS.contains(action), action + " 은 권한 세트 밖이다");
            if (readOnly.get(action)) {
                assertTrue(MdmPermissions.READ_ACTIONS.contains(action), action + " 은 READ 세트 밖이다");
            } else {
                assertTrue(MdmPermissions.EDIT_ACTIONS.contains(action), action + " 은 EDIT 세트 밖이다");
            }
        }

        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(methodByAction.size(), tasks.getLength());
        for (int i = 0; i < tasks.getLength(); i++) {
            Element task = (Element) tasks.item(i);
            assertEquals(bean, task.getAttributeNS(CAMUNDA, "class"), task.getAttribute("id"));
            Map<String, String> props = properties(task);
            assertEquals("result", props.get("output"), task.getAttribute("id") + " output");
            assertFalse(props.containsKey("grid"), task.getAttribute("id") + " 에 grid 속성 금지");
            assertNotNull(props.get("dto"), task.getAttribute("id") + " dto");
            String action = targetByAction.entrySet().stream()
                    .filter(e -> e.getValue().equals(task.getAttribute("id"))).map(Map.Entry::getKey)
                    .findFirst().orElseThrow();
            assertEquals(methodByAction.get(action), props.get("method"), action + " 의 method");
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

    private static Document parse(String path) throws Exception {
        try (InputStream in = DmeBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
