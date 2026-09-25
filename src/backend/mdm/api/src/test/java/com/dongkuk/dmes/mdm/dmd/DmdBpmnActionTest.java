package com.dongkuk.dmes.mdm.dmd;

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
 * TSK-07-03 design.md §3.2 T-A(A1) — dmd BPMN 두 개의 액션 분기·메서드 매핑 정적 검사. 기존 어휘 검사
 * ({@code MdmOasisActionVocabularyTest}·{@code DmaBpmnActionTest})는 dma 파일 이름을 하드코딩해 dmd 를 보지 않는다(F4).
 *
 * <p>D9: 새 액션을 만들지 않고 13종 안에서 닫기=delete, 다시 열기=restore, 등록=reg, 수정=save 로 매핑한다. 그래서 분기
 * 이름과 메서드 이름이 다르다(reg→register 등) — 매핑 표를 그대로 단언한다.
 */
class DmdBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    @Test
    void dataItemMng_액션은_view_search_reg_save_delete_restore() throws Exception {
        assertActions("services/dmd/dataItemMng.bpmn", "dataItemMng", "dataItemMngService",
                Map.of("view", "view", "search", "search", "reg", "register", "save", "modify", "delete", "close",
                        "restore", "reopen"),
                Set.of("reg", "save", "delete", "restore"));
    }

    @Test
    void dataMng_액션은_search_reg() throws Exception {
        assertActions("services/dmd/dataMng.bpmn", "dataMng", "dataMngService",
                Map.of("search", "search", "reg", "register"), Set.of("reg"));
    }

    @Test
    void dataEdit_액션은_view_save_delete() throws Exception {
        assertActions("services/dmd/dataEdit.bpmn", "dataEdit", "dataEditService",
                Map.of("view", "view", "save", "save", "delete", "deprecate"), Set.of("save", "delete"));
    }

    @Test
    void dataCateEdit_액션은_search_view_compare_reg_save_delete_restore() throws Exception {
        assertActions("services/dmd/dataCateEdit.bpmn", "dataCateEdit", "dataCateEditService",
                Map.of("search", "search", "view", "view", "compare", "compare", "reg", "register", "save", "save",
                        "delete", "close", "restore", "reopen"),
                Set.of("reg", "save", "delete", "restore"));
    }

    @Test
    void dataHistory_액션은_view_search() throws Exception {
        assertActions("services/dmd/dataHistory.bpmn", "dataHistory", "dataHistoryService",
                Map.of("view", "view", "search", "search"), Set.of());
    }

    /**
     * TSK-07-04 design.md B2 — validate 도 {@code writes}(EDIT 세트) 로 둔다. 팝업 진입 자체가 "CSV 업로드" 버튼(EDIT
     * 권한 가드)으로만 열려 validate 만 따로 READ 권한으로 노출할 필요가 없고, {@link MdmPermissions#READ_ACTIONS} 는
     * search·view·export·compare 뿐이라 validate 를 READ 로 두면 이 검사(READ 세트 소속)가 깨진다(design.md 원안의
     * {@code Set.of("save")} 대신 {@code Set.of("validate", "save")} — build-log.md 「설계 이탈」).
     */
    @Test
    void dataCsvUploadPop_액션은_validate_save() throws Exception {
        assertActions("services/dmd/dataCsvUploadPop.bpmn", "dataCsvUploadPop", "dataCsvUploadPopService",
                Map.of("validate", "validate", "save", "save"), Set.of("validate", "save"));
    }

    private void assertActions(String path, String processId, String bean, Map<String, String> methodByAction,
                               Set<String> writes) throws Exception {
        Document doc = parse(path);
        Element process = (Element) doc.getElementsByTagNameNS(BPMN, "process").item(0);
        assertEquals(processId, process.getAttribute("id"));

        Map<String, String> targetByAction = new HashMap<>();
        NodeList flows = doc.getElementsByTagNameNS(BPMN, "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            assertFalse(flow.getElementsByTagNameNS(BPMN, "conditionExpression").getLength() > 0,
                    flow.getAttribute("id") + " 에 conditionExpression 금지");
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                targetByAction.put(flow.getAttribute("name"), flow.getAttribute("targetRef"));
            }
        }
        assertEquals(methodByAction.keySet(), targetByAction.keySet(), path + " 분기 이름");
        Set<String> known = mdmActions();
        for (String action : targetByAction.keySet()) {
            assertTrue(known.contains(action), action + " 은 MdmActions 13종에 없다");
            assertEquals(!writes.contains(action), MdmPermissions.READ_ACTIONS.contains(action),
                    action + " 의 READ 세트 소속이 기대와 다르다");
        }

        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(methodByAction.size(), tasks.getLength());
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < tasks.getLength(); i++) {
            Element task = (Element) tasks.item(i);
            String id = task.getAttribute("id");
            assertEquals(bean, task.getAttributeNS(CAMUNDA, "class"), id);
            Map<String, String> props = properties(task);
            assertEquals("result", props.get("output"), id + " output");
            assertFalse(props.containsKey("grid"), id + " 에 grid 속성 금지");
            assertNotNull(props.get("dto"), id + " dto");
            String action = targetByAction.entrySet().stream().filter(e -> e.getValue().equals(id))
                    .map(Map.Entry::getKey).findFirst().orElseThrow(() -> new AssertionError(id + " 로 가는 분기가 없다"));
            assertEquals(methodByAction.get(action), props.get("method"), action + " → method(D9)");
            seen.add(action);
        }
        assertEquals(methodByAction.keySet(), seen);
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
        try (InputStream in = DmdBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
