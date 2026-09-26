package com.dongkuk.dmes.mdm.dme.ruleConfirm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.security.MdmActions;
import com.dongkuk.dmes.mdm.contract.security.MdmPermissions;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * TSK-08-05 design §3.2 「RuleConfirmBpmnActionTest」(I32) — {@code services/dme/ruleConfirm.bpmn} 의 OASIS 계약.
 * {@code DmeBpmnActionTest.assertActions} 는 모든 액션이 EDIT 세트 안이라고 단언하므로 {@code confirm}(CONFIRM 세트 전용)에 쓸 수 없어
 * 06-05 버전 확정 시험과 같은 파싱으로 따로 짠다(design 함정 4).
 */
class RuleConfirmBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
    private static final String PATH = "services/dme/ruleConfirm.bpmn";
    private static final String DTO_PACKAGE = "com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.";
    private static final Map<String, String> METHOD_BY_ACTION = Map.of(
            "search", "search", "view", "view", "validate", "validate", "confirm", "confirm");

    @Test
    void B1_분기_이름은_네_개이고_모두_MdmActions_상수다() throws Exception {
        Map<String, String> targets = targetsByAction(parse());

        assertEquals(METHOD_BY_ACTION.keySet(), targets.keySet());
        Set<String> known = mdmActions();
        for (String action : targets.keySet()) {
            assertTrue(known.contains(action), action + " 은 MdmActions 에 없다");
        }
    }

    @Test
    void B2_권한_세트_search_view_는_READ_validate_는_EDIT_confirm_은_CONFIRM_에만() {
        assertTrue(MdmPermissions.READ_ACTIONS.containsAll(List.of("search", "view")));
        assertFalse(MdmPermissions.READ_ACTIONS.contains("validate"));
        assertTrue(MdmPermissions.EDIT_ACTIONS.contains("validate"));
        assertFalse(MdmPermissions.READ_ACTIONS.contains("confirm"));
        assertFalse(MdmPermissions.EDIT_ACTIONS.contains("confirm"), "confirm 은 EDIT 세트 밖이어야 한다(담당자만)");
        assertTrue(MdmPermissions.CONFIRM_ACTIONS.contains("confirm"));
        assertEquals(MdmActions.CONFIRM, "confirm");
    }

    @Test
    void B3_serviceTask_는_빈_output_dto_를_갖고_grid_와_조건식이_없다() throws Exception {
        Document doc = parse();
        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(4, tasks.getLength());
        for (int i = 0; i < tasks.getLength(); i++) {
            Element task = (Element) tasks.item(i);
            String id = task.getAttribute("id");
            assertEquals("ruleConfirmService", task.getAttributeNS(CAMUNDA, "class"), id);
            Map<String, String> props = properties(task);
            assertEquals("result", props.get("output"), id + " output");
            assertFalse(props.containsKey("grid"), id + " 에 grid 속성 금지");
            String dto = props.get("dto");
            assertNotNull(dto, id + " dto");
            assertTrue(dto.startsWith(DTO_PACKAGE), dto);
            Class.forName(dto);
        }
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength(), "조건식 금지(flow name 만)");
    }

    @Test
    void B4_action_과_method_대응() throws Exception {
        Document doc = parse();
        Map<String, String> targets = targetsByAction(doc);
        Map<String, Element> tasks = new HashMap<>();
        NodeList list = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        for (int i = 0; i < list.getLength(); i++) {
            Element t = (Element) list.item(i);
            tasks.put(t.getAttribute("id"), t);
        }
        for (Map.Entry<String, String> e : targets.entrySet()) {
            Map<String, String> props = properties(tasks.get(e.getValue()));
            String method = props.get("method");
            assertEquals(METHOD_BY_ACTION.get(e.getKey()), method, e.getKey());
            List<Method> found = Arrays.stream(RuleConfirmService.class.getMethods())
                    .filter(m -> m.getName().equals(method)).toList();
            assertEquals(1, found.size(), method + " 는 public 메서드 하나");
            assertEquals(1, found.get(0).getParameterCount(), method);
            assertEquals(props.get("dto"), found.get(0).getParameterTypes()[0].getName(), method + " 파라미터 = dto");
        }
    }

    @Test
    void B5_process_id_는_파일명과_같고_서비스에_Transactional_이_없다() throws Exception {
        Element process = (Element) parse().getElementsByTagNameNS(BPMN, "process").item(0);

        assertEquals("ruleConfirm", process.getAttribute("id"));
        assertEquals("true", process.getAttribute("isExecutable"));
        assertFalse(RuleConfirmService.class.isAnnotationPresent(Transactional.class), "I23 — @Transactional 금지");
        for (Method m : RuleConfirmService.class.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName() + " — I23 @Transactional 금지");
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static Map<String, String> targetsByAction(Document doc) {
        Map<String, String> out = new TreeMap<>();
        NodeList flows = doc.getElementsByTagNameNS(BPMN, "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                out.put(flow.getAttribute("name"), flow.getAttribute("targetRef"));
            }
        }
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

    private static Set<String> mdmActions() throws IllegalAccessException {
        Set<String> out = new HashSet<>();
        for (Field f : MdmActions.class.getDeclaredFields()) {
            if (Modifier.isStatic(f.getModifiers()) && f.getType() == String.class) {
                out.add((String) f.get(null));
            }
        }
        return out;
    }

    private static Document parse() throws Exception {
        try (InputStream in = RuleConfirmBpmnActionTest.class.getClassLoader().getResourceAsStream(PATH)) {
            assertNotNull(in, PATH + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
