package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.model.event.UserExceptionEndEvent;
import com.dongkuk.oasis.utils.BindVariableUtil;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.model.PropertyNames.INPUT_KEY;

/**
 * @author Jeongjin Kim
 * @since 2021-06-28
 */
final class UserExceptionEndEventExecutable implements Executable {
    private final List<String> acceptablePropertyNames = Collections.singletonList(INPUT_KEY);
    private final UserExceptionEndEvent userExceptionEndEvent;

    UserExceptionEndEventExecutable(UserExceptionEndEvent userExceptionEndEvent) {
        this.userExceptionEndEvent = userExceptionEndEvent;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        String exceptionMessage = userExceptionEndEvent.errorMessage();
        String value = userExceptionEndEvent.properties().getValue(INPUT_KEY);
        if (value != null) {
            Map<String, String> exceptionMessageMap = new HashMap<>();

            List<PropertyExpression> parse = PropertyParser.parse(value);
            for (PropertyExpression propertyExpression : parse) {
                TypedObject typedObject = executableContext.get(propertyExpression.getValue(String.class));
                if(typedObject == null)
                    throw new PropertyException(String.format(
                            "[%s] does not exist in the context.", propertyExpression.getValue(String.class)));

                typedObject = PropertyUtil.access(typedObject, propertyExpression.getAccessors());
                exceptionMessageMap.put(propertyExpression.getAlias(String.class), typedObject.getObject().toString());
            }
            exceptionMessage = BindVariableUtil.bindVariables(exceptionMessage, exceptionMessageMap);
        }
        throw new UserException(exceptionMessage);
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }
}
