package com.dongkuk.dmes.mdm.dmc;

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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * TSK-06-02 design.md §3.2·§6.1 — dmc 두 BPMN 의 액션↔메서드 표가 정확한지(불변 규칙 I21).
 *
 * <p>액션(RBAC 키)과 메서드(자바 이름)는 다르다({@code reg→register}, {@code execute→deprecate} 등) — 분기 이름이
 * 메서드와 같다고 보지 않고 표 전체를 대조한다. 모든 액션은 {@link MdmActions} 상수(리플렉션) 안이고 EDIT 세트에 있으며,
 * 읽기 액션({@code search}·{@code view})만 READ 세트에 있다. DRAFT 소유권 액션(lock·unlock·handover)은 TSK-08-02 가
 * {@link MdmActions}·EDIT 세트에 더했다(D-075).
 */
class DmcCodeBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    private static final String MNG_DTO = "com.dongkuk.dmes.mdm.dmc.codeMng.dto.";
    private static final String EDIT_DTO = "com.dongkuk.dmes.mdm.dmc.codeEdit.dto.";

    @Test
    void codeMng_액션은_search_reg() throws Exception {
        Map<String, String[]> table = new LinkedHashMap<>();
        table.put("search", new String[]{"search", MNG_DTO + "CodeMngSearchRequest"});
        table.put("reg", new String[]{"register", MNG_DTO + "CodeRegRequest"});
        assertActions("services/dmc/codeMng.bpmn", "codeMng", "codeMngService", table);
    }

    @Test
    void codeEdit_액션은_설계_표와_같다() throws Exception {
        Map<String, String[]> table = new LinkedHashMap<>();
        table.put("search", new String[]{"searchCodes", EDIT_DTO + "CodeEditSearchRequest"});
        table.put("view", new String[]{"view", EDIT_DTO + "CodeEditViewRequest"});
        table.put("save", new String[]{"saveHeader", EDIT_DTO + "CodeHeaderSaveRequest"});
        table.put("execute", new String[]{"deprecate", EDIT_DTO + "CodeDeprecateRequest"});
        table.put("reg", new String[]{"createVersion", EDIT_DTO + "CodeVersionCreateRequest"});
        table.put("restore", new String[]{"restoreVersion", EDIT_DTO + "CodeVersionRestoreRequest"});
        table.put("delete", new String[]{"deleteDraft", EDIT_DTO + "CodeDraftRequest"});
        table.put("lock", new String[]{"acquire", EDIT_DTO + "CodeDraftRequest"});
        table.put("unlock", new String[]{"release", EDIT_DTO + "CodeDraftRequest"});
        table.put("handover", new String[]{"handover", EDIT_DTO + "CodeDraftRequest"});
        assertActions("services/dmc/codeEdit.bpmn", "codeEdit", "codeEditService", table);
    }

    static void assertActions(String path, String processId, String bean, Map<String, String[]> table) throws Exception {
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
        assertEquals(table.keySet(), targetByAction.keySet(), path + " 분기 이름");

        Set<String> known = mdmActions();
        for (String action : table.keySet()) {
            assertTrue(known.contains(action), action + " 은 MdmActions 밖이다");
            boolean read = action.equals(MdmActions.SEARCH) || action.equals(MdmActions.VIEW);
            assertEquals(read, MdmPermissions.READ_ACTIONS.contains(action), action + " 의 READ 세트 소속");
            assertTrue(MdmPermissions.EDIT_ACTIONS.contains(action), action + " 은 EDIT 세트 밖이다");
        }

        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(table.size(), tasks.getLength());
        Map<String, Element> taskById = new HashMap<>();
        for (int i = 0; i < tasks.getLength(); i++) {
            Element task = (Element) tasks.item(i);
            taskById.put(task.getAttribute("id"), task);
        }
        for (Map.Entry<String, String[]> e : table.entrySet()) {
            Element task = taskById.get(targetByAction.get(e.getKey()));
            assertNotNull(task, e.getKey() + " 분기의 serviceTask");
            assertEquals(bean, task.getAttributeNS(CAMUNDA, "class"), e.getKey());
            Map<String, String> props = properties(task);
            assertEquals(e.getValue()[0], props.get("method"), e.getKey() + " method");
            assertEquals(e.getValue()[1], props.get("dto"), e.getKey() + " dto");
            assertEquals("result", props.get("output"), e.getKey() + " output");
            assertFalse(props.containsKey("grid"), e.getKey() + " 에 grid 속성 금지");
            Class.forName(e.getValue()[1]);
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
        try (InputStream in = DmcCodeBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
