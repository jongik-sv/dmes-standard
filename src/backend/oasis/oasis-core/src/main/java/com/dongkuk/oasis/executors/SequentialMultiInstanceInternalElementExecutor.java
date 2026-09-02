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
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;

import java.util.List;

import static com.dongkuk.oasis.model.PropertyNames.ITERATOR;

/**
 * 반복 요소를 순서대로 실행시키는 실행기.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
final class SequentialMultiInstanceInternalElementExecutor extends MultiInstanceInternalElementExecutor {
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
        if (property != null)
            throw new PropertyException(
                    String.format("The attribute [%s] is not available. Please use Collection and Element Variable."
                            , ITERATOR));

        MultiInstance multiInstanceElement = (MultiInstance) element;
        String collectionNameAttr = multiInstanceElement.collectionName();
        String itemVariableNameAttr = multiInstanceElement.itemVariableName();

        List<PropertyExpression> propertyExpressions = PropertyParser.parse(collectionNameAttr);
        if (propertyExpressions.size() > 1)
            throw new PropertyException("You cannot specify more than 2 repeating elements separated by [,].");

        PropertyExpression propertyExpression = propertyExpressions.get(0);

        String value = propertyExpression.getValue(String.class);
        if (propertyExpression.hasAlias())
            throw new PropertyException("Please specify the alias in 'Element Variable'.");

        TypedObject typedObject = executableContext.get(value);
        if (typedObject == null)
            throw new PropertyException(
                    String.format(
                            "The iterator [%s] for repeating execution in the repeating element [%s] " +
                                    "does not exist in the context." +
                                    "Please check the value.", value, element.getId())
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
                itemVariableNameAttr == null
        );

        return convertExecutionResultListToSingle(executionResultList);
    }
}
