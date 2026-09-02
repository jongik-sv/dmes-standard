package com.dongkuk.dmes.cactus.dmom.task;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.message.DmomMessageService;
import com.dongkuk.dmes.cactus.dmom.message.DmomSendRequest;
import com.dongkuk.dmes.cactus.dmom.transport.CaravanHubTransport;

import java.util.Map;

/**
 * OASIS BPMN 선언적 재사용 송신 태스크 (DI 가능한 Spring 빈 + method 스타일).
 *
 * <p><b>왜 {@code Wow} 가 아닌가</b>: OASIS 의 {@code WowJavaServiceTaskExecutable} 은 {@code Class.newInstance()}
 * 로 인스턴스를 직접 생성하여 Spring 의존성 주입이 불가하다. 반면 {@code PlainJavaServiceTaskExecutable} 은
 * camunda:class 가 가리키는 <b>Spring 빈</b>을 컨텍스트에서 조회해 method 를 호출하므로 {@code DmomMessageService}
 * 주입이 가능하다. 따라서 본 태스크는 빈 + method 스타일로 구현한다.
 *
 * <p><b>BPMN 사용 예</b> (method-style):
 * <pre>{@code
 * <bpmn:serviceTask id="sendTask" name="전문송신" camunda:class="dmomMessageTask">
 *   <bpmn:extensionElements><camunda:properties>
 *     <camunda:property name="method" value="createMessage"/>
 *   </camunda:properties></bpmn:extensionElements>
 *   <!-- inputs: transactionCode, interfaceId, transport, data -->
 * </bpmn:serviceTask>
 * }</pre>
 *
 * <p><b>권장 1순위</b>는 업무 {@code @Service} 빈이 {@link DmomMessageService} 를 직접 주입받아
 * 메서드 내부에서 {@code createMsg} 를 호출하는 것이다(별도 태스크 불요). 본 태스크는 Java 작성 없이
 * 선언적으로 송신을 추가하려는 경우의 보조 수단이다.
 */
public class DmomMessageTask {

    private final DmomMessageService dmomMessageService;

    public DmomMessageTask(DmomMessageService dmomMessageService) {
        this.dmomMessageService = dmomMessageService;
    }

    /**
     * 전문 송신 (BPMN method-style 진입점).
     *
     * @param transactionCode 트랜잭션 코드
     * @param interfaceId     인터페이스 ID(= topicId)
     * @param transport       {@code "HTTP"} | {@code "DB"} (대소문자 무관)
     * @param data            FORMAT 항목값 Map (E: scalar, G: {@code List<Map>})
     * @return 직렬화된 전문 문자열
     */
    public String createMessage(String transactionCode, String interfaceId, String transport,
                                Map<String, Object> data) {
        CaravanHubTransport seraiTransport = parseTransport(transport);
        return dmomMessageService.createMsg(DmomSendRequest.builder()
                .transactionCode(transactionCode)
                .interfaceId(interfaceId)
                .transport(seraiTransport)
                .data(data)
                .build());
    }

    private static CaravanHubTransport parseTransport(String transport) {
        if (transport == null || transport.isBlank()) {
            throw new DmomException("transport required (HTTP | DB)");
        }
        try {
            return CaravanHubTransport.valueOf(transport.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DmomException("알 수 없는 transport: " + transport + " (HTTP | DB)");
        }
    }
}
