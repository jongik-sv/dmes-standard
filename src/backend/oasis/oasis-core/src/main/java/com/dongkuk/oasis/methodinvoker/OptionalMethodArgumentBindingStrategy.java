package com.dongkuk.oasis.methodinvoker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Binds an object in the context by optional parameter names.
 * <p>
 * If it cannot be retrieved by the parameter type in the context,
 * {@link ParameterBindingResult} in which the object is {@code null} is returned to check the next parameter.
 * When it cannot be found, the processing depends on the implementation using that strategy.
 *
 * @author Jeongjin Kim
 * @since 2023-01-17
 */
public class OptionalMethodArgumentBindingStrategy implements MethodArgumentBindingStrategy {
    private static final Logger log = LoggerFactory.getLogger(OptionalMethodArgumentBindingStrategy.class);

    @Override
    public ParameterBindingResult tryBind(ParameterAndArgumentHolder parameterAndArgumentHolder, Context context) {
        if (context.optionalParameters().contains(parameterAndArgumentHolder.getParameterName())) {
            log.debug("[{}] is bind by optional flag.", parameterAndArgumentHolder.getParameterName());
            return new ParameterBindingResult(
                    parameterAndArgumentHolder,
                    true,
                    String.format("Parameter [%s] is allowed to stay unbound because it is optional.",
                            parameterAndArgumentHolder.getParameterName()));
        } else {
            log.debug("[{}] is skipped. The parameter is not optional.", parameterAndArgumentHolder.getParameterName());
            return new ParameterBindingResult(
                    null,
                    true,
                    String.format("Parameter [%s] is not marked optional.",
                            parameterAndArgumentHolder.getParameterName()));
        }
    }
}
