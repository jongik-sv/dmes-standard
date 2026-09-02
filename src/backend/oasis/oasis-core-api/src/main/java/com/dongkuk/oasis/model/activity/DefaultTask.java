package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * 프로세스 컨텍스트에서 필요한 값을 반환하는 태스크.
 * <p>
 *
 * @author Jeongjin Kim
 * @since 2021-06-22
 */
public final class DefaultTask extends AbstractTask {
    /**
     * @param taskId           태스트 식별자
     * @param taskName         태스크 이름
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   순서 Flow
     * @param properties       태스크 속성
     * @param inputs           입력값
     * @param outputs          출력값
     * @param multiInstance    반복특성
     */
    public DefaultTask(String taskId,
                       String taskName,
                       Collection<ConditionalFlow> conditionalFlows,
                       DefaultFlow defaultFlow,
                       SequentialFlow sequentialFlow,
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
    }
}
