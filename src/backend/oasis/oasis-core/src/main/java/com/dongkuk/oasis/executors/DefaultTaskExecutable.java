package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.DefaultTask;

import java.util.Arrays;
import java.util.List;

import static com.dongkuk.oasis.model.PropertyNames.INPUT_KEY;
import static com.dongkuk.oasis.model.PropertyNames.OUTPUT_KEY;

/**
 * {@code input_key}에 입력한 값을 그대로 반환하는 태스크.
 *
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class DefaultTaskExecutable implements Executable {
    private final DefaultTask task;
    private final List<String> acceptablePropertyNames = Arrays.asList(OUTPUT_KEY, INPUT_KEY);

    /**
     * @param task defaultTask
     */
    public DefaultTaskExecutable(DefaultTask task) {
        this.task = task;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        Property property = task.getProperty(INPUT_KEY);

        TypedObject result = null;

        if (property != null) {
            List<PropertyExpression> propertyExpressions = PropertyParser.parse(property);
            if (propertyExpressions.size() > 1)
                throw new PropertyException(String.format(
                        "The [%s] property cannot be specified with more than one value separated by [,].",
                        INPUT_KEY));

            PropertyExpression propertyExpression = propertyExpressions.get(0);
            String inputKey = propertyExpression.getValue(String.class);

            result = executableContext.get(inputKey);
            if (result == null)
                throw new IllegalArgumentException(String.format("[%s] is not present in the context.", inputKey));

            result = PropertyUtil.access(result, propertyExpression.getAccessors());
        }

        return new UnmodifiableExecutionResult(result == null ? new TypedObject(null, void.class) : result,
                task.outputs().export());
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }
}
