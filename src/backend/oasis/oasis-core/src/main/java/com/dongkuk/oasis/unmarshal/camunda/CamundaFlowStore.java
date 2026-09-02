package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.flow.*;
import com.dongkuk.oasis.unmarshal.FlowStore;

import java.util.ArrayList;
import java.util.Collection;

import static com.dongkuk.oasis.unmarshal.camunda.CamundaFlowsStoreBuilder.ByFlowNode;

/**
 * @author Jeongjin Kim
 * @since 2021-02-06
 */
final class CamundaFlowStore implements FlowStore {
    private final ByFlowNode byFlowNode;

    /**
     * @param byFlowNode 노드별 흐름 데이터
     */
    public CamundaFlowStore(ByFlowNode byFlowNode) {
        this.byFlowNode = byFlowNode;
    }

    @Override
    public Collection<ConditionalFlow> conditionalFlows(String flowNodeId) {
        return byFlowNode.flows(flowNodeId, ConditionalFlow.class);
    }

    @Override
    public DefaultFlow defaultFlow(String flowNodeId) {
        Collection<DefaultFlow> flows = byFlowNode.flows(flowNodeId, DefaultFlow.class);
        if (flows.size() == 0)
            return null;
        else if (flows.size() > 1)
            throw new IllegalStateException("There are more than two default flows. " +
                    "Default flow should be one or none.");
        else
            return new ArrayList<>(flows).get(0);
    }

    @Override
    public SequentialFlow sequentialFlow(String flowNodeId) {
        Collection<SequentialFlow> flows = byFlowNode.flows(flowNodeId, SequentialFlow.class);
        if (flows.size() == 0)
            return null;
        else if (flows.size() > 1)
            throw new IllegalStateException("There are more than 2 sequential flows. " +
                    "Sequential flow should be one or none.");
        else
            return new ArrayList<>(flows).get(0);
    }

    @Override
    public Collection<ParallelFlow> parallelFlows(String flowNodeId) {
        return byFlowNode.flows(flowNodeId, ParallelFlow.class);
    }

    @Override
    public <T extends Flow> T flow(String flowId, Class<T> flowType) {
        return byFlowNode.flow(flowId, flowType);
    }

    @Override
    public <T extends Flow> T flow(String flowId) {
        return byFlowNode.flow(flowId);
    }
}
