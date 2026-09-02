package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.utils.StringUtil;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-04-09
 */
public class FlowNameConditionalFlowPicker implements FlowPicker {
    @Override
    public Flow pick(ComplexFlowNode node, TypedObject object) {
        SequentialFlow sequentialFlow = node.sequenceFlow();
        if (sequentialFlow != null)
            return sequentialFlow;

        if (object == null)
            return null;

        return evaluateFlowAndPickOne(node, object);
    }

    private Flow evaluateFlowAndPickOne(ConditionalFlowNode node,
                                        TypedObject typedObject) {
        if (typedObject == null)
            throw new IllegalFlowException("Can not evaluate condition because no result exists in context.");

        Object object = typedObject.getObject();
        if (!(object instanceof String))
            return null;

        List<ConditionalFlow> conditionalFlows = new ArrayList<>(node.conditionalFlows());
        List<ConditionalFlow> candidateFlows = new ArrayList<>(conditionalFlows.size());
        for (ConditionalFlow conditionalFlow : conditionalFlows) {
            String condition = (String) conditionalFlow.condition().conditionExpression();

            if (StringUtil.hasText(condition)) {
                boolean value = condition.equals(object);
                if (value)
                    candidateFlows.add(conditionalFlow);
            }
        }

        if (candidateFlows.size() > 1)
            throw new IllegalFlowException("Too many flows picked.");
        else if (candidateFlows.size() == 0)
            return null;

        return candidateFlows.get(0);
    }

    @Override
    public Flow pick(ConditionalFlowNode node, TypedObject typedObject) {
        if (typedObject == null)
            return null;

        return evaluateFlowAndPickOne(node, typedObject);
    }
}
