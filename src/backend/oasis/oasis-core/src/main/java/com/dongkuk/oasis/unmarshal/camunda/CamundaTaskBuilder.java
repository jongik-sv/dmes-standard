package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.Task;
import com.dongkuk.oasis.model.activity.DefaultTask;
import com.dongkuk.oasis.unmarshal.FlowStore;
import com.dongkuk.oasis.unmarshal.TaskBuilder;
import org.jdom2.Element;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-22
 */
final class CamundaTaskBuilder implements TaskBuilder<Element> {
    private final Map<String, TaskBuilder<Element>>
            builders = new HashMap<>();

    /**
     * @param builders builders
     */
    public CamundaTaskBuilder(TaskBuilderMapping... builders) {
        for (TaskBuilderMapping builder : builders) {
            this.builders.put(builder.getTaskName(), builder.getTaskBuilder());
        }
    }

    @Override
    public Task buildTask(Element taskElement, FlowStore flowStore) {
        if (!(taskElement.getName().toLowerCase().contains("task")))
            throw new IllegalArgumentException("Not a task level element :" + taskElement.getName());

        TaskBuilder<Element> taskBuilder = builders.get(taskElement.getName());
        if (taskBuilder != null)
            return taskBuilder.buildTask(taskElement, flowStore);

        CommonElementAttributesAndProperties elementAttrProp =
                new CommonElementAttributesAndProperties(taskElement, flowStore);

        return new DefaultTask(
                elementAttrProp.id(),
                elementAttrProp.name(),
                elementAttrProp.conditionalFlows(),
                elementAttrProp.defaultFlow(),
                elementAttrProp.sequentialFlow(),
                elementAttrProp.properties(),
                elementAttrProp.inputs(),
                elementAttrProp.outputs(),
                elementAttrProp.multiInstance());
    }

    static class TaskBuilderMapping {
        private final String taskName;
        private final TaskBuilder<Element> taskBuilder;

        TaskBuilderMapping(String taskName, TaskBuilder<Element> taskBuilder) {
            this.taskName = taskName;
            this.taskBuilder = taskBuilder;
        }

        public String getTaskName() {
            return taskName;
        }

        public TaskBuilder<Element> getTaskBuilder() {
            return taskBuilder;
        }
    }
}
