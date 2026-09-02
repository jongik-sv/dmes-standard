package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.SendTask;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * 외부로 메시지를 전송하는 태스크.
 * <p>
 *
 * @author Jeongjin Kim
 * @since 2021-12-24
 */
public final class ExternalSendTask extends AbstractTask implements SendTask {
    private final String topic;

    /**
     * {@link ConditionalFlow}와 {@link DefaultFlow} 를 가진 태스크를 생성한다.
     *
     * @param taskId           태스트 식별자
     * @param taskName         태스크 이름
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   순서 Flow
     * @param topic            토픽
     * @param properties       태스크 속성
     * @param inputs           입력값
     * @param outputs          출력값
     * @param multiInstance    반복특성
     */
    public ExternalSendTask(String taskId,
                            String taskName,
                            Collection<ConditionalFlow> conditionalFlows,
                            DefaultFlow defaultFlow,
                            SequentialFlow sequentialFlow,
                            String topic,
                            PropertyContainer properties,
                            InputOutputContainer inputs,
                            InputOutputContainer outputs,
                            MultiInstance multiInstance) {
        super(taskId,
                taskName,
                properties,
                conditionalFlows,
                defaultFlow,
                sequentialFlow,
                inputs,
                outputs,
                multiInstance);
        if (topic == null)
            throw new IllegalArgumentException("Required value is null, topic");
        this.topic = topic;
    }

    /**
     * @return 전송할 토픽
     */
    public String getTopic() {
        return topic;
    }
}
