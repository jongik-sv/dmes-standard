package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.unmarshal.FlowStore;
import org.jdom2.Element;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-07-20
 */
final class CommonElementAttributesAndProperties {
    private final String id;
    private final String name;
    private final PropertyContainer properties;
    private final InputOutputContainer inputs;
    private final InputOutputContainer outputs;
    private final Collection<ConditionalFlow> conditionalFlows;
    private final DefaultFlow defaultFlow;
    private final SequentialFlow sequentialFlow;
    private final MultiInstance multiInstance;

    public CommonElementAttributesAndProperties(Element element, FlowStore flowStore) {
        this.id = CamundaAttributeExtractor.id(element);
        this.name = CamundaAttributeExtractor.name(element);
        this.properties = CamundaElementUtil.extractProperties(element);
        this.inputs = CamundaElementUtil.extractInputs(element);
        this.outputs = CamundaElementUtil.extractOutputs(element);
        this.multiInstance = CamundaElementUtil.extractMultiInstance(element);
        this.conditionalFlows = flowStore.conditionalFlows(id);
        this.defaultFlow = flowStore.defaultFlow(id);
        this.sequentialFlow = flowStore.sequentialFlow(id);
    }

    public String id() {
        return id;
    }

    public String name() {
        return name;
    }

    public PropertyContainer properties() {
        return properties;
    }

    public InputOutputContainer inputs() {
        return inputs;
    }

    public InputOutputContainer outputs() {
        return outputs;
    }

    public Collection<ConditionalFlow> conditionalFlows() {
        return conditionalFlows;
    }

    public DefaultFlow defaultFlow() {
        return defaultFlow;
    }

    public SequentialFlow sequentialFlow() {
        return sequentialFlow;
    }

    public boolean isValidComplexFlowNode() {
        return (conditionalFlows.size() > 0 && defaultFlow != null)
                || (conditionalFlows.size() > 0)
                || (sequentialFlow != null
                || (conditionalFlows.size() == 0 && defaultFlow == null && sequentialFlow == null));
    }

    public MultiInstance multiInstance() {
        return multiInstance;
    }
}
