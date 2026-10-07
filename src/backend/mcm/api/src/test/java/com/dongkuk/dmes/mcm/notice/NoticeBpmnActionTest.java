package com.dongkuk.dmes.mcm.notice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.notice.noticeBoard.service.NoticeBoardService;
import com.dongkuk.dmes.mcm.notice.noticeMgmt.service.NoticeMgmtService;
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
 * {@code services/lsh/noticeMgmt.bpmn}·{@code noticeBoard.bpmn} 의 OASIS 계약 — 스프링 없이 XML 만 파싱한다
 * (mdm {@code RuleConfirmBpmnActionTest} 와 같은 방식).
 *
 * <ul>
 *   <li>process id = 파일명 = serviceId, actionGateway 분기 이름 = action</li>
 *   <li>serviceTask 의 {@code camunda:class} = 서비스 빈 이름, {@code output="result"}, {@code grid} 속성·조건식 없음</li>
 *   <li>method 가 서비스의 public 메서드 하나이고 dto 가 있으면 첫 파라미터 타입과 같다</li>
 *   <li>서비스에 {@code @Transactional} 이 없다(OASIS 파라미터명 바인딩, BackEnd 표준 §6-B-1)</li>
 * </ul>
 */
class NoticeBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    @Test
    void noticeMgmt_는_search_save_changeStatus_세_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/lsh/noticeMgmt.bpmn");

        assertEquals("noticeMgmt", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("changeStatus", "save", "search"), List.copyOf(byAction.keySet()));
        assertServiceTasks(doc, "noticeMgmtService", NoticeMgmtService.class, byAction);
        assertEquals("com.dongkuk.dmes.mcm.notice.noticeMgmt.dto.NoticeMgmtSearchRequest",
                properties(byAction.get("search")).get("dto"));
        // save 는 dto 없이 grids.master.rows 를 파라미터 이름 master 로 받는다(§6-E-3).
        assertFalse(properties(byAction.get("save")).containsKey("dto"));
        assertEquals("master", method(NoticeMgmtService.class, "save").getParameters()[0].getName());
    }

    @Test
    void noticeBoard_는_search_한_분기뿐이고_쓰기_action_이_없다() throws Exception {
        Document doc = parse("services/lsh/noticeBoard.bpmn");

        assertEquals("noticeBoard", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("search"), List.copyOf(byAction.keySet()), "모든 역할이 부르는 서비스 — 조회 하나만 둔다");
        assertServiceTasks(doc, "noticeBoardService", NoticeBoardService.class, byAction);
        assertEquals("com.dongkuk.dmes.mcm.notice.noticeBoard.dto.NoticeBoardSearchRequest",
                properties(byAction.get("search")).get("dto"));
        long publicMethods = Arrays.stream(NoticeBoardService.class.getDeclaredMethods())
                .filter(m -> java.lang.reflect.Modifier.isPublic(m.getModifiers())).count();
        assertEquals(1, publicMethods, "noticeBoardService 의 public 메서드는 search 하나");
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static void assertServiceTasks(Document doc, String bean, Class<?> serviceClass,
                                           Map<String, Element> byAction) throws Exception {
        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(byAction.size(), tasks.getLength(), "분기마다 serviceTask 하나");
        for (Map.Entry<String, Element> e : byAction.entrySet()) {
            Element task = e.getValue();
            String id = task.getAttribute("id");
            assertEquals(bean, task.getAttributeNS(CAMUNDA, "class"), id);
            Map<String, String> props = properties(task);
            assertEquals("result", props.get("output"), id + " output (§6-C-2)");
            assertFalse(props.containsKey("grid"), id + " 에 grid 속성 금지 (§6-C-1)");
            Method m = method(serviceClass, props.get("method"));
            assertEquals(1, m.getParameterCount(), id);
            if (props.containsKey("dto")) {
                assertEquals(props.get("dto"), m.getParameterTypes()[0].getName(), id + " 파라미터 = dto");
                Class.forName(props.get("dto"));
            }
        }
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength(), "조건식 금지(flow name 만)");

        assertEquals(bean, serviceClass.getAnnotation(Service.class).value());
        assertFalse(serviceClass.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : serviceClass.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName() + " — @Transactional 금지 (§6-B-1)");
        }
    }

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

    /** actionGateway 에서 나가는 흐름 이름(action) → 대상 serviceTask. 이름순. */
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
        try (InputStream in = NoticeBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
