package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.container.ComplexFlowContainer;
import com.dongkuk.oasis.model.flow.container.FlowContainer;
import com.dongkuk.oasis.model.flow.nodes.ComplexFlowNode;
import com.dongkuk.oasis.model.flow.nodes.FlowNodeElement;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

import java.util.Collection;
import java.util.HashMap;

/**
 * @author Jeongjin Kim
 * @since 2021-06-15
 */
public abstract class AbstractTask implements Task, ComplexFlowNode, FlowNodeElement {
    protected final String taskId;
    protected final String taskName;
    protected final PropertyContainer properties;
    protected final FlowContainer flowContainer;
    protected final InputOutputContainer inputs;
    protected final InputOutputContainer outputs;
    protected final MultiInstance multiInstance;

    /**
     * @param taskId           태스트 식별자
     * @param taskName         태스크 이름
     * @param properties       태스크 속성
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   기본 Flow
     * @param inputs           입력값
     * @param outputs          출력값
     * @param multiInstance    반복 타입
     */
    public AbstractTask(String taskId,
                        String taskName,
                        PropertyContainer properties,
                        Collection<ConditionalFlow> conditionalFlows,
                        DefaultFlow defaultFlow,
                        SequentialFlow sequentialFlow,
                        InputOutputContainer inputs,
                        InputOutputContainer outputs,
                        MultiInstance multiInstance) {
        if (taskId == null ||
                taskName == null
        )
            throw new IllegalArgumentException(
                    String.format("Required value is missing, " +
                                    "taskId=[%s], " +
                                    "taskName=[%s]",
                            taskId, taskName));

        this.multiInstance = multiInstance;
        this.taskId = taskId;
        this.taskName = taskName;
        this.properties = properties == null ? new PropertyContainer() : properties;
        this.inputs = inputs == null ? new InputOutputContainer(new HashMap<>()) : inputs;
        this.outputs = outputs == null ? new InputOutputContainer(new HashMap<>()) : outputs;

        if (sequentialFlow == null) {
            if (defaultFlow == null) {
                this.flowContainer = new ComplexFlowContainer(conditionalFlows);
            } else {
                this.flowContainer = new ComplexFlowContainer(conditionalFlows, defaultFlow);
            }
        } else {
            this.flowContainer = new ComplexFlowContainer(sequentialFlow);
        }
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

    @Override
    public Flow pick(FlowPicker picker, TypedObject typedObject) {
        return picker.pick(this, typedObject);
    }

    @Override
    public Collection<ConditionalFlow> conditionalFlows() {
        return flowContainer.conditionalFlows();
    }

    @Override
    public DefaultFlow defaultFlow() {
        return flowContainer.defaultFlow();
    }

    @Override
    public SequentialFlow sequenceFlow() {
        return flowContainer.sequenceFlow();
    }

    @Override
    public InputOutputContainer inputs() {
        return this.inputs;
    }

    @Override
    public <T> T input(String key) {
        return this.inputs.getValue(key);
    }

    @Override
    public InputOutputContainer outputs() {
        return this.outputs;
    }

    @Override
    public <T> T output(String key) {
        return this.outputs.getValue(key);
    }

    @Override
    public PropertyContainer properties() {
        return this.properties;
    }

    @Override
    public MultiInstanceType multiInstanceType() {
        return multiInstance.multiInstanceType();
    }

    @Override
    public String collectionName() {
        return multiInstance.collectionName();
    }

    @Override
    public String itemVariableName() {
        return multiInstance.itemVariableName();
    }
}
