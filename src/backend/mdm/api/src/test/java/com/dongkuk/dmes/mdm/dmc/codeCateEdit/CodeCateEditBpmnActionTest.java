package com.dongkuk.dmes.mdm.dmc.codeCateEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.security.MdmActions;
import com.dongkuk.dmes.mdm.contract.security.MdmPermissions;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.service.CodeCateEditService;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * TSK-06-04 design.md §5 불변 규칙 16 인접 — {@code services/dmc/codeCateEdit.bpmn} 의 OASIS 계약. {@code DmcBpmnActionTest}
 * ({@code codeItemEdit.bpmn} 몫) 골격을 그대로 복제한다. 검사기 {@code check_oasis_contract.py} 가 mdm 을 스캔하지 않으므로
 * (F20) 이 시험이 대신 고정한다.
 */
class CodeCateEditBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
    private static final String PATH = "services/dmc/codeCateEdit.bpmn";
    private static final String DTO_PACKAGE = "com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.";
    private static final Map<String, String> METHOD_BY_ACTION = Map.of(
            "search", "search", "view", "view", "compare", "preview", "validate", "validate",
            "save", "save", "restore", "revert");
    private static final Set<String> TWO_GRID_METHODS = Set.of("validate", "save");

    @Test
    void B1_분기_이름은_여섯_개이고_모두_MdmActions_상수다() throws Exception {
        Map<String, String> targets = targetsByAction(parse());

        assertEquals(METHOD_BY_ACTION.keySet(), targets.keySet());
        Set<String> known = mdmActions();
        for (String action : targets.keySet()) {
            assertTrue(known.contains(action), action + " 은 MdmActions 에 없다");
        }
    }

    @Test
    void B2_search_view_compare_만_READ_세트다() throws Exception {
        for (String action : targetsByAction(parse()).keySet()) {
            boolean read = Set.of("search", "view", "compare").contains(action);
            assertEquals(read, MdmPermissions.READ_ACTIONS.contains(action), action);
        }
    }

    @Test
    void B3_serviceTask_는_빈_output_dto_를_갖고_grid_와_조건식이_없다() throws Exception {
        Document doc = parse();
        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(6, tasks.getLength());
        for (int i = 0; i < tasks.getLength(); i++) {
            Element task = (Element) tasks.item(i);
            String id = task.getAttribute("id");
            assertEquals("codeCateEditService", task.getAttributeNS(CAMUNDA, "class"), id);
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
    void B4_action_과_method_대응과_그리드_파라미터_이름() throws Exception {
        Document doc = parse();
        Map<String, String> targets = targetsByAction(doc);
        Map<String, Element> tasks = new HashMap<>();
        NodeList list = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        for (int i = 0; i < list.getLength(); i++) {
            Element t = (Element) list.item(i);
            tasks.put(t.getAttribute("id"), t);
        }
        for (Map.Entry<String, String> e : targets.entrySet()) {
            String method = properties(tasks.get(e.getValue())).get("method");
            assertEquals(METHOD_BY_ACTION.get(e.getKey()), method, e.getKey());
            List<Method> found = Arrays.stream(CodeCateEditService.class.getMethods())
                    .filter(m -> m.getName().equals(method)).toList();
            assertEquals(1, found.size(), method + " 는 public 메서드 하나");
            if (TWO_GRID_METHODS.contains(method)) {
                assertEquals(3, found.get(0).getParameterCount(), method);
                assertEquals("categories", found.get(0).getParameters()[1].getName(),
                        "grids.categories 와 파라미터 이름이 같아야 한다(-parameters 컴파일)");
                assertEquals("members", found.get(0).getParameters()[2].getName(),
                        "grids.members 와 파라미터 이름이 같아야 한다(-parameters 컴파일)");
            } else {
                assertEquals(1, found.get(0).getParameterCount(), method);
            }
        }
    }

    @Test
    void B5_process_id_는_파일명과_같다() throws Exception {
        Element process = (Element) parse().getElementsByTagNameNS(BPMN, "process").item(0);

        assertEquals("codeCateEdit", process.getAttribute("id"));
        assertEquals("true", process.getAttribute("isExecutable"));
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
        Set<String> out = new java.util.HashSet<>();
        for (Field f : MdmActions.class.getDeclaredFields()) {
            if (Modifier.isStatic(f.getModifiers()) && f.getType() == String.class) {
                out.add((String) f.get(null));
            }
        }
        return out;
    }

    private static Document parse() throws Exception {
        try (InputStream in = CodeCateEditBpmnActionTest.class.getClassLoader().getResourceAsStream(PATH)) {
            assertNotNull(in, PATH + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
