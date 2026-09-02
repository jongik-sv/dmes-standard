package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
@SuppressFBWarnings("EI_EXPOSE_REP")
public final class SubServiceCallTask extends AbstractTask {
    private final String serviceId;

    /**
     * @param taskId           태스트 식별자
     * @param taskName         태스크 이름
     * @param properties       태스크 속성
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   순서 Flow
     * @param inputs           입력값
     * @param outputs          출력값
     * @param serviceId        서비스 ID
     * @param multiInstance    반복가능 여부
     */
    public SubServiceCallTask(String taskId,
                              String taskName,
                              PropertyContainer properties,
                              Collection<ConditionalFlow> conditionalFlows,
                              DefaultFlow defaultFlow,
                              SequentialFlow sequentialFlow,
                              InputOutputContainer inputs,
                              InputOutputContainer outputs,
                              String serviceId,
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

        if (serviceId == null)
            throw new IllegalArgumentException("Required value is null, serviceId");

        this.serviceId = serviceId;
    }

    /**
     * @return serviceId
     */
    public String serviceId() {
        return serviceId;
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
