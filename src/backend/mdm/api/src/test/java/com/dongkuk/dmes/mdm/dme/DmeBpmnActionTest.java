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

    /**
     * D-105 — 헤더·버전 관리가 이 화면으로 왔다. {@code save} 는 target HEADER(룰명 등)만 받는다(적중 정책은 D-133 으로 ruleEdit 표 저장).
     * {@code delete} 는 target VERSION(DRAFT 삭제)·RULE(폐기)·CONFIRM(확정 취소, ADR-0002 D8)를 가른다.
     */
    @Test
    void ruleMng_는_search_reg_view_save_copy_delete_lock_unlock_handover() throws Exception {
        Map<String, String> methods = new HashMap<>();
        methods.put("search", "search");
        methods.put("reg", "register");
        methods.put("view", "view");
        methods.put("save", "save");
        methods.put("copy", "copy");
        methods.put("delete", "delete");
        methods.put("lock", "lock");
        methods.put("unlock", "unlock");
        methods.put("handover", "handover");
        Map<String, Boolean> readOnly = Map.of("search", true, "reg", false, "view", true, "save", false, "copy", false,
                "delete", false, "lock", false, "unlock", false, "handover", false);
        assertActions("services/dme/ruleMng.bpmn", "ruleMng", "ruleMngService", methods, readOnly);
    }

    /**
     * D-105 — 헤더·버전 관리(copy·delete·lock·unlock·handover)와 save 의 part HEADER 가 ruleMng 으로 갔다. 여기 남는 것은
     * 내용 편집뿐이라 5개다. 버전 목록은 읽기만 하므로 view 는 그대로 있고 관리 버튼은 없다.
     */
    @Test
    void ruleEdit_는_search_view_save_validate_execute() throws Exception {
        Map<String, String> methods = new HashMap<>();
        methods.put("search", "search"); // target=RULE|DOMAIN 을 Java 가 가른다(TSK-08-03 — 새 action 은 mcm 시드 어휘 16종 밖이라 못 만든다)
        methods.put("validate", "parseExpr");
        methods.put("view", "view");
        methods.put("save", "save");
        methods.put("execute", "runTest"); // 값 테스트(TSK-08-04 D3) — 원장에 쓰지 않지만 EDIT 권한 액션이라 readOnly 가 아니다
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

    /**
     * TSK-08-06 I17 — 룰 세트 편집. search 의 갈래(target SET·RULE·GUIDE)는 Java 가 가른다. delete 는 폐기, restore 는 되살리기다.
     * 흐름도 2단계 P5 — validate 는 조건식 IO(condIo), execute 는 기록 실행(simulate). 원장에 쓰지 않지만 EDIT 권한 액션이라 readOnly 가 아니다.
     */
    @Test
    void ruleSetEdit_는_search_view_save_delete_restore_validate_execute() throws Exception {
        Map<String, String> methods = Map.of("search", "search", "view", "view", "save", "save", "delete", "delete", "restore", "restore",
                "validate", "condIo", "execute", "simulate");
        Map<String, Boolean> readOnly = new HashMap<>();
        methods.keySet().forEach(a -> readOnly.put(a, a.equals("search") || a.equals("view")));
        assertActions("services/dme/ruleSetEdit.bpmn", "ruleSetEdit", "ruleSetEditService", methods, readOnly);
    }

    /**
     * 흐름도 3단계 P-D2 — 케이스 저장(save)·일괄 실행(execute)·식 파싱(validate)은 새 action 이 아니라 기존 동사다. 셋 다 EDIT 권한이고 READ 에는
     * 없다(표준 관리자 같은 READ 역할의 403 은 BFF RBAC — e2e E9 가 본다).
     */
    @Test
    void ruleSetEdit_의_save_execute_validate_는_EDIT_권한이고_READ_에_없다() {
        for (String action : new String[] {"save", "execute", "validate"}) {
            assertTrue(MdmPermissions.EDIT_ACTIONS.contains(action), action + " 은 EDIT 세트에 있어야 한다");
            assertFalse(MdmPermissions.READ_ACTIONS.contains(action), action + " 은 READ 세트에 없어야 한다");
        }
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
