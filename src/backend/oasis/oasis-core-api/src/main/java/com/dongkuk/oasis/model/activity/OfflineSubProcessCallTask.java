package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public final class OfflineSubProcessCallTask extends AbstractTask {
    /**
     * @param taskId           태스트 식별자
     * @param taskName         태스크 이름
     * @param properties       태스크 속성
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   순서 Flow
     * @param inputs           입력값
     * @param outputs          출력값
     * @param multiInstance    반복가능 여부
     */
    public OfflineSubProcessCallTask(String taskId,
                                     String taskName,
                                     PropertyContainer properties,
                                     Collection<ConditionalFlow> conditionalFlows,
                                     DefaultFlow defaultFlow,
                                     SequentialFlow sequentialFlow,
                                     InputOutputContainer inputs,
                                     InputOutputContainer outputs,
                                     MultiInstance multiInstance
    ) {
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

    @Override
    public String getId() {
        return taskId;
    }

    @Override
    public String getName() {
        return taskName;
    }

    @Override
    public Property getProperty(String name) {
        return properties.get(name);
    }
}
