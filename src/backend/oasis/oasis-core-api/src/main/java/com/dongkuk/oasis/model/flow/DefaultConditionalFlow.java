package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.Condition;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;

/**
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
public class DefaultConditionalFlow implements ConditionalFlow {
    private final String flowId;
    private final String flowName;
    private final String sourceElementId;
    private final String targetElementId;
    private final Condition<?> condition;
    private final PropertyContainer properties;

    /**
     * @param flowId          흐름 식별자
     * @param flowName        흐름 이름
     * @param sourceElementId 출발 요소 식별자
     * @param targetElementId 도착 요소 식별자
     * @param condition       조건
     * @param properties      속성
     */
    public DefaultConditionalFlow(String flowId,
                                  String flowName,
                                  String sourceElementId,
                                  String targetElementId,
                                  Condition<?> condition,
                                  PropertyContainer properties) {
        if (flowId == null ||
                sourceElementId == null ||
                targetElementId == null ||
                condition == null ||
                properties == null
        )
            throw new IllegalArgumentException();

        this.flowId = flowId;
        this.flowName = flowName == null ? flowId : flowName;
        this.sourceElementId = sourceElementId;
        this.targetElementId = targetElementId;
        this.condition = condition;
        this.properties = properties;
    }

    @Override
    public String getId() {
        return flowId;
    }

    @Override
    public String getName() {
        return flowName;
    }

    @Override
    public Property getProperty(String name) {
        return properties.get(name);
    }

    @Override
    public PropertyContainer properties() {
        return properties;
    }

    @Override
    public String sourceElementId() {
        return sourceElementId;
    }

    @Override
    public String targetElementId() {
        return targetElementId;
    }

    @Override
    public Condition<?> condition() {
        return condition;
    }
}
