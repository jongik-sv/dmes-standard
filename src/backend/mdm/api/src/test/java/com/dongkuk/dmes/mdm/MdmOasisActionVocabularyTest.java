package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.security.MdmActions;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

/**
 * 불변 규칙 I14 정적 검사 — {@code services/dma/unitMng.bpmn}·{@code termMng.bpmn} 을 파싱해
 * {@code actionGateway} 에서 나가는 모든 {@code sequenceFlow} 의 {@code name}(액션 이름)이
 * {@link MdmActions} 13개 상수의 부분집합인지 단언한다.
 *
 * <p>스프링 컨텍스트 없이 XML 파싱만 하는 순수 단위 테스트다(빠르다). {@code e2e} 스모크1 은
 * {@code search} 하나만 실행하므로 이것만으로는 {@code compare}/{@code execute} 오타를 못 잡는다 —
 * 이 정적 검사가 그 빈틈을 메운다.
 */
class MdmOasisActionVocabularyTest {

    private static final Set<String> ALLOWED_ACTIONS = Set.of(
            MdmActions.SEARCH, MdmActions.VIEW, MdmActions.EXPORT, MdmActions.COMPARE, MdmActions.SAVE,
            MdmActions.DELETE, MdmActions.REG, MdmActions.IMPORT, MdmActions.VALIDATE, MdmActions.EXECUTE,
            MdmActions.COPY, MdmActions.RESTORE, MdmActions.CONFIRM);

    @Test
    void unitMng_bpmn_의_모든_액션이_13개_어휘_안에_있다() throws Exception {
        assertActionsWithinVocabulary(bpmnPath("unitMng.bpmn"));
    }

    @Test
    void termMng_bpmn_의_모든_액션이_13개_어휘_안에_있다() throws Exception {
        assertActionsWithinVocabulary(bpmnPath("termMng.bpmn"));
    }

    @Test
    void unitMng_는_search_save_delete_compare_4개_액션을_쓴다() throws Exception {
        Set<String> actions = actionsFromGateway(bpmnPath("unitMng.bpmn"));
        assertTrue(actions.containsAll(Set.of("search", "save", "delete", "compare")), actions.toString());
        assertFalse(actions.contains("execute"), "unitMng 는 execute 를 쓰지 않는다: " + actions);
    }

    @Test
    void termMng_는_search_save_delete_compare_execute_5개_액션을_쓴다() throws Exception {
        Set<String> actions = actionsFromGateway(bpmnPath("termMng.bpmn"));
        assertTrue(actions.containsAll(Set.of("search", "save", "delete", "compare", "execute")), actions.toString());
    }

    private void assertActionsWithinVocabulary(Path bpmnFile) throws Exception {
        Set<String> actions = actionsFromGateway(bpmnFile);
        assertFalse(actions.isEmpty(), bpmnFile + " 에서 액션을 하나도 찾지 못했다 — 파싱 로직을 확인하라.");
        assertTrue(ALLOWED_ACTIONS.containsAll(actions),
                bpmnFile + " 의 액션이 MdmActions 13개 어휘 밖이다: " + actions);
    }

    /** {@code actionGateway} 에서 나가는(sourceRef=actionGateway) sequenceFlow 들의 name 집합. */
    private Set<String> actionsFromGateway(Path bpmnFile) throws IOException, ParserConfigurationException, SAXException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true); // getElementsByTagNameNS 가 매치하려면 필수.
        Document doc = factory.newDocumentBuilder().parse(bpmnFile.toFile());
        Set<String> actions = new LinkedHashSet<>();
        NodeList flows = doc.getElementsByTagNameNS("*", "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                String name = flow.getAttribute("name");
                if (name != null && !name.isBlank()) {
                    actions.add(name);
                }
            }
        }
        return actions;
    }

    private Path bpmnPath(String fileName) {
        Path path = Path.of("src/main/resources/services/dma", fileName);
        assertTrue(Files.isRegularFile(path), path.toAbsolutePath() + " 가 없다");
        return path;
    }
}
