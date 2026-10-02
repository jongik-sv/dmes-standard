package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.GridData;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.oasis.TypedObject;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * URL action 과 BPMN 분기 action 이 늘 같아야 한다(2026-10-03 보안 지적, 스펙 2026-10-02-widget-admin-generic §5.2).
 * <p>BFF proxy·BE EndpointPermissionFilter 는 URL 의 action 으로 권한을 보고, BPMN 게이트웨이는 입력 맵의 {@code action} 으로
 * 분기한다. 그래서 (1) 게이트웨이의 분기 키가 {@code action} 이고 (2) 요청 본문이 그 키를 바꾸지 못해야 URL 권한 판정이 의미가 있다.
 * 악용 모양 두 가지를 실제 BPMN 으로 고정한다:
 * <ul>
 *   <li>commWidgetMng — {@code search} 권한만으로 본문 {@code action=previewQuery}(임의 SELECT·DB 오류 문구) 실행</li>
 *   <li>secUser — AUTH_ONLY {@code myMenus} 로 본문 {@code action=resetPassword}·{@code save}(관리자 action) 실행</li>
 * </ul>
 * 스프링 없이 XML 만 파싱하고({@link CommWidgetMngBpmnActionTest} 와 같은 방식), 입력 맵은 실제 {@link CactusRequestConverter} 로 만든다.
 */
class OasisPathActionBpmnTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    private final CactusRequestConverter converter = new CactusRequestConverter();

    @Test
    void commWidgetMng_search_권한으로_본문_action_previewQuery_를_실행할_수_없다() throws Exception {
        Document doc = parse("services/csa/commWidgetMng.bpmn");
        assertEquals("action", gatewayInput(doc), "게이트웨이 분기 키");
        Map<String, Element> byAction = tasksByAction(doc);
        assertTrue(byAction.containsKey("previewQuery"));

        Map<String, Object> params = new HashMap<>();
        params.put("action", "previewQuery");
        params.put("dataSrc", "mcm");
        params.put("sql", "SELECT 1");
        assertRejected(request(params, null), "search");

        // 정상 요청은 URL action 의 분기로만 간다.
        Map<String, Object> ok = new HashMap<>();
        ok.put("dataSrc", "mcm");
        ok.put("sql", "SELECT 1");
        assertEquals("previewQuery", routedMethod(byAction, converter.convert(request(ok, null), "previewQuery")));
        assertEquals("search", routedMethod(byAction, converter.convert(request(new HashMap<>(), null), "search")));
    }

    @Test
    void commWidgetMng_본문_grids_action_으로도_다른_action_을_실행할_수_없다() {
        Map<String, GridData> grids = Map.of("action", new GridData(List.of(Map.of("widgetId", "W1"))));
        assertRejected(request(null, grids), "loadLayout");
    }

    @Test
    void secUser_AUTH_ONLY_myMenus_로_본문_action_resetPassword_save_를_실행할_수_없다() throws Exception {
        Document doc = parse("services/security/secUser.bpmn");
        assertEquals("action", gatewayInput(doc), "게이트웨이 분기 키");
        Map<String, Element> byAction = tasksByAction(doc);
        assertTrue(byAction.containsKey("resetPassword") && byAction.containsKey("save") && byAction.containsKey("myMenus"));

        for (String admin : List.of("resetPassword", "save", "search")) {
            Map<String, Object> params = new HashMap<>();
            params.put("action", admin);
            params.put("userId", "victim");
            assertRejected(request(params, null), "myMenus");
            assertRejected(request(params, null), "myPermissions");
        }

        assertEquals(byAction.get("myMenus"), byAction.get(String.valueOf(
                converter.convert(request(new HashMap<>(), null), "myMenus").get("action").getObject())));
    }

    @Test
    void widgetMemo_load_경로로_본문_action_save_를_실행할_수_없다() throws Exception {
        Document doc = parse("services/roleManagement/widgetMemo.bpmn");
        assertEquals("action", gatewayInput(doc), "게이트웨이 분기 키");
        Map<String, Element> byAction = tasksByAction(doc);
        assertTrue(byAction.containsKey("load") && byAction.containsKey("save"));

        Map<String, Object> params = new HashMap<>();
        params.put("action", "save");
        params.put("instId", "w-abc");
        params.put("defId", "def.memo1234");
        params.put("format", "text");
        params.put("content", "x");
        assertRejected(request(params, null), "load");

        assertEquals("load", routedMethod(byAction, converter.convert(request(new HashMap<>(Map.of("instId", "w-abc")), null), "load")));
        assertEquals("save", routedMethod(byAction, converter.convert(request(new HashMap<>(Map.of("instId", "w-abc")), null), "save")));
    }

    private void assertRejected(CactusRequest request, String pathAction) {
        BusinessException e = assertThrows(BusinessException.class, () -> converter.convert(request, pathAction),
                "본문 action 은 URL action(" + pathAction + ")을 바꾸지 못하고 거절돼야 한다");
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
    }

    private static CactusRequest request(Map<String, Object> params, Map<String, GridData> grids) {
        return new CactusRequest(new RequestMeta("u1", "M1"), params, grids);
    }

    /** 입력 맵의 action 으로 게이트웨이가 고를 serviceTask 의 method. */
    private static String routedMethod(Map<String, Element> byAction, Map<String, TypedObject> inputs) {
        Element task = byAction.get(String.valueOf(inputs.get("action").getObject()));
        assertNotNull(task, "분기 없음: " + inputs.get("action").getObject());
        NodeList list = task.getElementsByTagNameNS(CAMUNDA, "property");
        for (int i = 0; i < list.getLength(); i++) {
            Element p = (Element) list.item(i);
            if ("method".equals(p.getAttribute("name"))) return p.getAttribute("value");
        }
        return null;
    }

    private static String gatewayInput(Document doc) {
        NodeList gateways = doc.getElementsByTagNameNS(BPMN, "exclusiveGateway");
        for (int i = 0; i < gateways.getLength(); i++) {
            Element g = (Element) gateways.item(i);
            if (!"actionGateway".equals(g.getAttribute("id"))) continue;
            NodeList props = g.getElementsByTagNameNS(CAMUNDA, "property");
            for (int k = 0; k < props.getLength(); k++) {
                Element p = (Element) props.item(k);
                if ("input".equals(p.getAttribute("name"))) return p.getAttribute("value");
            }
        }
        return null;
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

    private static Document parse(String path) throws Exception {
        try (InputStream in = OasisPathActionBpmnTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
