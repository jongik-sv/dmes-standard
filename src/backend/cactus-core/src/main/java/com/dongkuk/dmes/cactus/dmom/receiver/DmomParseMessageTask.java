package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;

import java.util.Map;

/**
 * 수신 BPMN 의 <b>첫 번째 서비스 태스크</b> — 파이프 전문(raw)을 역파싱해 항목 Map 으로 변환한다.
 * (DI 가능한 Spring 빈 + method 스타일; 상세설계 R6/§4.3)
 *
 * <p><b>왜 {@code Wow} 가 아닌가</b>: OASIS {@code WowJavaServiceTaskExecutable} 은 {@code newInstance()}
 * 로 직접 생성하여 DI 불가. {@code PlainJavaServiceTaskExecutable} 은 camunda:class 가 가리키는
 * <b>Spring 빈</b>을 조회해 method 를 호출하므로 {@link DmomFormatRepository}/{@link MessageParser}
 * 주입이 가능하다. (송신 {@code DmomMessageTask} 와 동일 패턴. AS-IS {@code DMomParseMessageTask}
 * 가 {@code MOM_RECV_CDATA}→{@code MOM_PARSE_DATA} 출력하던 위치에 대응.)
 *
 * <p><b>BPMN 사용 예</b> (method-style):
 * <pre>{@code
 * <bpmn:serviceTask id="parseTask" name="전문파싱" camunda:class="dmomParseMessageTask">
 *   <bpmn:extensionElements><camunda:properties>
 *     <camunda:property name="method" value="parse"/>
 *     <camunda:property name="output" value="parseData"/>
 *   </camunda:properties></bpmn:extensionElements>
 *   <!-- inputs: transactionCode, interfaceId, interfaceMsg (디스패처가 context 에 적재) -->
 * </bpmn:serviceTask>
 * }</pre>
 */
public class DmomParseMessageTask {

    private final DmomFormatRepository formatRepository;
    private final MessageParser parser;

    public DmomParseMessageTask(DmomFormatRepository formatRepository, MessageParser parser) {
        this.formatRepository = formatRepository;
        this.parser = parser;
    }

    /**
     * 전문 역파싱 (BPMN method-style 진입점).
     *
     * <p>메서드 인자(transactionCode/interfaceId/interfaceMsg)는 서비스 context inputs 에서
     * {@code StrictMethodInvoker} 가 파라미터명으로 바인딩한다({@code -parameters} 컴파일 필요).
     *
     * @param transactionCode 트랜잭션 코드 (포맷 조회 키)
     * @param interfaceId     인터페이스 ID
     * @param interfaceMsg    파이프 구분 전문(raw)
     * @return 항목값 Map (ITEM_ID 키). BPMN {@code output} 키(예: parseData)로 적재됨
     * @throws DmomException FORMAT_LAYOUT 부재 시
     */
    public Map<String, Object> parse(String transactionCode, String interfaceId, String interfaceMsg) {
        FormatLayout layout = formatRepository.getActiveLayout(transactionCode, interfaceId);
        if (layout.isEmpty()) {
            throw new DmomException("FORMAT_LAYOUT 없음: TC=" + transactionCode + ", IF=" + interfaceId);
        }
        return parser.parse(layout, interfaceMsg);
    }
}
