package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.Condition;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.expression.EvaluationException;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;

import java.util.ArrayList;
import java.util.List;

/**
 * <a href="https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#expressions">
 * SpringExpression</a>으로 {@link Flow}의 {@link Condition}을 평가하여 최종적으로 적합한 {@link Flow}를 반환한다.
 *
 * @author Jeongjin Kim
 * @see <a href="https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#expressions">
 * https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#expressions</a>
 * @since 2021-04-05
 */
public class SpElConditionalFlowPicker implements FlowPicker {
    private static final Logger log = LoggerFactory.getLogger(SpElConditionalFlowPicker.class);
    private final ExpressionParser parser = new SpelExpressionParser();

    @Override
    public Flow pick(ComplexFlowNode node, TypedObject typedObject) {
        SequentialFlow sequentialFlow = node.sequenceFlow();
        if (sequentialFlow != null)
            return sequentialFlow;

        return evaluateFlowAndPickOne(node, typedObject);
    }

    private Flow evaluateFlowAndPickOne(ConditionalFlowNode node,
                                        TypedObject typedObject) {
        List<ConditionalFlow> conditionalFlows = new ArrayList<>(node.conditionalFlows());
        List<ConditionalFlow> candidateFlows = new ArrayList<>(conditionalFlows.size());
        for (ConditionalFlow conditionalFlow : conditionalFlows) {
            Condition<?> condition = conditionalFlow.condition();
            String stringConditionExpression = (String) condition.conditionExpression();
            Expression expression;
            try {
                expression = parser.parseExpression(stringConditionExpression);
            } catch (Exception e) {
                continue;
            }
            Boolean value;
            if (typedObject == null)
                value = expression.getValue(Boolean.class);
            else
                try {
                    value = expression.getValue(typedObject.getObject(), Boolean.class);
                } catch (EvaluationException e) {
                    continue;
                }

            log.debug("Condition:[{}], Result:[{}]", stringConditionExpression, value);
            if (value != null && value)
                candidateFlows.add(conditionalFlow);
        }

        if (candidateFlows.size() > 1)
            throw new IllegalFlowException("Too many flows picked.");
        else if (candidateFlows.size() == 0)
            return null;

        return candidateFlows.get(0);
    }

    @Override
    public Flow pick(ConditionalFlowNode node, TypedObject typedObject) {
        return evaluateFlowAndPickOne(node, typedObject);
    }
}
