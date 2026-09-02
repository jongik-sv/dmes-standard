package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.model.Property;

import java.util.List;

import static com.dongkuk.oasis.model.PropertyNames.ITERATOR;

/**
 * 반복 요소를 순서대로 실행시키는 실행기.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
final class LoopMultiInstanceInternalElementExecutor extends MultiInstanceInternalElementExecutor {
    /**
     * 반복 실행 가능한 요소를 실행한다.
     *
     * @param executable        요소 실행기
     * @param element           요소
     * @param executableContext 실행 가능 요소 컨텍스트
     * @return 태스크 실행 결과, 실행 결과가 없으면 {@code null}을 반환한다.
     */
    public ExecutionResult execute(Executable executable, Element element, ExecutableContext executableContext) {
        Property property = element.getProperty(ITERATOR);

        if (property == null)
            throw new PropertyException(
                    String.format("Although it's a repeating element, the property [%s] is not present.", ITERATOR));

        List<PropertyExpression> propertyExpressions = PropertyParser.parse(property);
        if (propertyExpressions.size() > 1)
            throw new PropertyException("Repeating elements cannot be specified for more than 2 items, " +
                    "separated by [,].");

        PropertyExpression propertyExpression = propertyExpressions.get(0);

        String value = propertyExpression.getValue(String.class);
        String itemVariableNameAttr = propertyExpression.getAlias(String.class);

        TypedObject typedObject = executableContext.get(value);
        if (typedObject == null)
            throw new PropertyException(
                    String.format(
                            "The iterator [%s] for repeating execution in the repeating " +
                                    "element [%s] does not exist in the context. " +
                            "Please verify the exact value.", value, element.getId())
            );

        TypedObject accessedObject = PropertyUtil.access(typedObject, propertyExpression.getAccessors());

        List<ExecutionResult> executionResultList = executeMultiInstanceElement(accessedObject,
                itemVariableNameAttr,
                executableContext,
                executable,
                (executable1, executionResultList1, iteratorUnpackedContext) -> {
                    ExecutionResult iterableExecutionResult = executable1.execute(iteratorUnpackedContext);
                    executionResultList1.add(iterableExecutionResult);
                },
                !propertyExpression.hasAlias()
        );

        return convertExecutionResultListToSingle(executionResultList);
    }
}
