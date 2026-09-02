package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ContextAccessor;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.model.ExclusiveGateway;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.utils.StringUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.List;

import static com.dongkuk.oasis.model.PropertyNames.INPUT_KEY;

/**
 * @author Jeongjin Kim
 * @since 2021-06-28
 */
final class ExclusiveGatewayExecutable implements Executable {
    private static final Logger log = LoggerFactory.getLogger(ExclusiveGatewayExecutable.class);
    private final ExclusiveGateway exclusiveGateway;
    private final List<String> acceptablePropertyNames = Collections.singletonList(INPUT_KEY);

    /**
     * @param exclusiveGateway exclusiveGateway
     */
    public ExclusiveGatewayExecutable(ExclusiveGateway exclusiveGateway) {
        this.exclusiveGateway = exclusiveGateway;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        Property key = exclusiveGateway.getProperty(INPUT_KEY);
        if (key != null) {
            String value = key.getValue();
            if (!StringUtil.hasText(value))
                throw new IllegalStateException(
                        String.format(
                                "The key for branching is an empty string. " +
                                        "Please enter the value for property [%s] accurately.",
                                INPUT_KEY));
            TypedObject o = executableContext.get(value);
            if (o == null)
                throw new IllegalStateException(
                        String.format("The value for the key [%s] used for branching cannot be found in the context. " +
                                        "No value in the service context or in the case of a sub-service call " +
                                        "the key might not have been passed to the property [%s] " +
                                        "during the service invocation.",
                                key.getName(), INPUT_KEY));
            return new UnmodifiableExecutionResult(o);
        } else {
            log.warn("Because {} is not specified, the Service context and Process context are being evaluated. " +
                            "Please write the SpEL expression accurately.",
                    INPUT_KEY);
            ContextAccessor contextAccessor = new ContextAccessor(executableContext);
            return new UnmodifiableExecutionResult(new TypedObject(contextAccessor));
        }
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }
}
