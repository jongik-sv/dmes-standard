package com.dongkuk.oasis.methodinvoker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Finds and binds an object in the context by the method parameter name.
 * <p>
 * If the object taken by the parameter name from the context is not
 * compatible with the parameter type, it is considered a failure.
 * Handling in case of failure depends on the implementation using that strategy.
 * <p>
 * If it cannot be retrieved by the method name in the context,
 * {@link ParameterBindingResult} in which the object is {@code null} is
 * returned to check the next parameter.
 *
 * @author Jeongjin Kim
 * @since 2021-03-26
 */
public class ParameterNameMethodArgumentBindingStrategy implements MethodArgumentBindingStrategy {
    private static final Logger log = LoggerFactory.getLogger(ParameterNameMethodArgumentBindingStrategy.class);

    @Override
    public ParameterBindingResult tryBind(ParameterAndArgumentHolder parameterAndArgumentHolder, Context context) {
        // check by parameter name
        if (context.hasKey(parameterAndArgumentHolder.getParameterName())) {
            TypeDescribableObject argCandidate =
                    context.getValueByKey(parameterAndArgumentHolder.getParameterName());
            if (parameterAndArgumentHolder.canAccept(argCandidate.getType())) {
                parameterAndArgumentHolder.accept(argCandidate);
                log.debug("Parameter [{}] has bound by name.", parameterAndArgumentHolder.getParameterName());
                return new ParameterBindingResult(
                        parameterAndArgumentHolder,
                        false,
                        String.format("Matched by parameter name [%s] with declared type [%s].",
                                parameterAndArgumentHolder.getParameterName(),
                                argCandidate.getType().getTypeName()));
            } else if (argCandidate.getObject() != null &&
                    parameterAndArgumentHolder.canAccept(argCandidate.getObject().getClass())) {
                parameterAndArgumentHolder.accept(argCandidate);
                log.debug("Parameter [{}] has bound by name.", parameterAndArgumentHolder.getParameterName());
                return new ParameterBindingResult(
                        parameterAndArgumentHolder,
                        false,
                        String.format("Matched by parameter name [%s] using runtime type [%s].",
                                parameterAndArgumentHolder.getParameterName(),
                                argCandidate.getObject().getClass().getTypeName()));
            } else if (argCandidate.getObject() != null &&
                    parameterAndArgumentHolder.canAccept(argCandidate.getObject())) {
                parameterAndArgumentHolder.accept(argCandidate);
                log.debug("Parameter [{}] has bound by name.", parameterAndArgumentHolder.getParameterName());
                return new ParameterBindingResult(
                        parameterAndArgumentHolder,
                        false,
                        String.format("Matched by parameter name [%s] using runtime object conversion.",
                                parameterAndArgumentHolder.getParameterName()));
            } else {
                log.debug("Parameter [{}] is skipped. (type mismatch). " +
                                "Parameter type is [{}] but the object type is [{}]",
                        parameterAndArgumentHolder.getParameterName(),
                        parameterAndArgumentHolder.getParameterType(),
                        argCandidate.getType());
                return new ParameterBindingResult(
                        null,
                        true,
                        String.format("Key [%s] exists but value type [%s] is not assignable to [%s].",
                                parameterAndArgumentHolder.getParameterName(),
                                argCandidate.getType().getTypeName(),
                                parameterAndArgumentHolder.getParameterType().getTypeName()));
            }
        } else {
            log.debug("No parameter name [{}] in the context.", parameterAndArgumentHolder.getParameterName());
            return new ParameterBindingResult(
                    null,
                    true,
                    String.format("Key [%s] is not visible in the binding context.",
                            parameterAndArgumentHolder.getParameterName()));
        }
    }
}
