package com.dongkuk.oasis.unmarshal.camunda;

import java.util.HashSet;
import java.util.Set;

/**
 * @author Jeongjin Kim
 * @since 2021-02-06
 */
final class CamundaFlowGroup {
    private final Set<CamundaFlowElement> flowElements = new HashSet<>();
    private final Set<String> parallelGateways;
    private boolean isConditional;
    private boolean isParallel;

    CamundaFlowGroup(Set<String> parallelGateways) {
        this.parallelGateways = parallelGateways;
    }

    void addFlowElement(CamundaFlowElement element) {
        flowElements.add(element);
        if (element.getConditionExpression() != null)
            this.isConditional = true;

        this.isParallel = parallelGateways.contains(element.getSourceId());
    }

    Set<CamundaFlowElement> getFlowElements() {
        return flowElements;
    }

    boolean isConditional() {
        return isConditional;
    }

    public boolean isParallel() {
        return isParallel;
    }
}