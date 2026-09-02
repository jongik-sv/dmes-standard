package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.PropertyContainer;

/**
 * @author Jeongjin Kim
 * @since 2021-02-06
 */
final class CamundaFlowElement {
    private final String flowId;
    private final String flowName;
    private final String conditionExpression;
    private final String sourceId;
    private final String targetId;
    private final PropertyContainer properties;

    CamundaFlowElement(String flowId,
                       String flowName,
                       String conditionExpression,
                       String sourceId,
                       String targetId,
                       PropertyContainer properties) {
        this.flowId = flowId;
        this.flowName = flowName;
        this.conditionExpression = conditionExpression;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.properties = properties;
    }

    String getFlowId() {
        return flowId;
    }

    String getConditionExpression() {
        return conditionExpression;
    }

    String getSourceId() {
        return sourceId;
    }

    String getTargetId() {
        return targetId;
    }

    String getFlowName() {
        return flowName;
    }

    PropertyContainer getProperties() {
        return properties;
    }
}