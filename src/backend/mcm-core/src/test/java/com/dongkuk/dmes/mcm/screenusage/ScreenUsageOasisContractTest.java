package com.dongkuk.dmes.mcm.screenusage;

import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * mcm/api BPMN ↔ mcm-core 서비스 계약 대조 (6-C-2 output, 6-E-3 grids key = 파라미터 이름, 6-B-1 @Transactional 금지).
 * 테스트 작업 디렉터리는 mcm-core 모듈 루트다(mdm MdmOasisActionVocabularyTest 와 같은 상대 경로 방식).
 */
class ScreenUsageOasisContractTest {

    static final Path SERVICES = Path.of("../mcm/api/src/main/resources/services");
    static final Path DATA_INITIALIZER =
            Path.of("../mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java");

    @Test
    @DisplayName("screenUsage.bpmn 은 record 하나를 screenUsageService.record 로 보내고 output 은 result 다")
    void recordBpmn() throws Exception {
        Document doc = parse(SERVICES.resolve("audit/screenUsage.bpmn"));
        assertThat(processId(doc)).isEqualTo("screenUsage");

        Map<String, Element> tasks = tasksByAction(doc);
        assertThat(tasks.keySet()).containsExactly("record");
        Element task = tasks.get("record");
        assertThat(task.getAttribute("camunda:class")).isEqualTo("screenUsageService");
        assertThat(property(task, "method")).isEqualTo("record");
        assertThat(property(task, "output")).isEqualTo("result");
        assertThat(property(task, "grid")).isNull();

        Method record = ScreenUsageService.class.getMethod("record", List.class);
        assertThat(record.getParameters()[0].getName()).isEqualTo("segments"); // grids.segments
        assertThat(ScreenUsageService.class.getAnnotation(Service.class).value()).isEqualTo("screenUsageService");
        assertThat(ScreenUsageService.class.isAnnotationPresent(Transactional.class)).isFalse();
    }

    static Document parse(Path path) throws Exception {
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(path.toFile());
    }

    static String processId(Document doc) {
        return ((Element) doc.getElementsByTagName("bpmn:process").item(0)).getAttribute("id");
    }

    /** actionGateway 에서 나가는 sequenceFlow name(action) → 대상 serviceTask. */
    static Map<String, Element> tasksByAction(Document doc) {
        Map<String, Element> tasksById = new HashMap<>();
        NodeList serviceTasks = doc.getElementsByTagName("bpmn:serviceTask");
        for (int i = 0; i < serviceTasks.getLength(); i++) {
            Element t = (Element) serviceTasks.item(i);
            tasksById.put(t.getAttribute("id"), t);
        }
        Map<String, Element> byAction = new LinkedHashMap<>();
        NodeList flows = doc.getElementsByTagName("bpmn:sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element f = (Element) flows.item(i);
            if ("actionGateway".equals(f.getAttribute("sourceRef"))) {
                byAction.put(f.getAttribute("name"), tasksById.get(f.getAttribute("targetRef")));
            }
        }
        return byAction;
    }

    static String property(Element task, String name) {
        NodeList props = task.getElementsByTagName("camunda:property");
        for (int i = 0; i < props.getLength(); i++) {
            Element p = (Element) props.item(i);
            if (name.equals(p.getAttribute("name"))) {
                return p.getAttribute("value");
            }
        }
        return null;
    }
}
