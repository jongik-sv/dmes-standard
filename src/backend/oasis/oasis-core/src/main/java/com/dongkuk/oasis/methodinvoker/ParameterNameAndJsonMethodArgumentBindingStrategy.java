package com.dongkuk.oasis.methodinvoker;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Finds and binds an object in the context by the method parameter name and json.
 * <p>
 * Bind when the parameter name exists in the context
 * and is a string in json format that can be converted to a parameter type.
 * <p>
 * Handling in case of failure depends on the implementation using that strategy.
 * <p>
 * If it cannot be retrieved by the method name in the context,
 * {@link ParameterBindingResult} in which the object is {@code null} is
 * returned to check the next parameter.
 *
 * @author Jeongjin Kim
 * @since 2021-06-07
 */
public class ParameterNameAndJsonMethodArgumentBindingStrategy implements MethodArgumentBindingStrategy {
    private static final Logger log = LoggerFactory.getLogger(ParameterNameAndJsonMethodArgumentBindingStrategy.class);

    @Override
    public ParameterBindingResult tryBind(ParameterAndArgumentHolder parameterAndArgumentHolder, Context context) {
        if (context.hasKey(parameterAndArgumentHolder.getParameterName())) {
            TypeDescribableObject argCandidate =
                    context.getValueByKey(parameterAndArgumentHolder.getParameterName());
            Object paramObject = null;
            String failureMessage = String.format("Key [%s] is not a JSON string that can be converted to [%s].",
                    parameterAndArgumentHolder.getParameterName(),
                    parameterAndArgumentHolder.getParameterType().getTypeName());
            if (argCandidate.getObject() instanceof String) {
                ObjectMapper objectMapper = new ObjectMapper();
                try {
                    paramObject = objectMapper.readValue(argCandidate.getObject(String.class)
                            , (Class<?>) parameterAndArgumentHolder.getParameterType());
                } catch (JsonProcessingException | ClassCastException e) {
                    log.debug(e.getMessage());
                    paramObject = null;
                    failureMessage = String.format("JSON conversion from key [%s] to [%s] failed: %s",
                            parameterAndArgumentHolder.getParameterName(),
                            parameterAndArgumentHolder.getParameterType().getTypeName(),
                            e.getMessage());
                }
            } else {
                failureMessage = String.format("Key [%s] has runtime type [%s], not String JSON.",
                        parameterAndArgumentHolder.getParameterName(),
                        argCandidate.getType().getTypeName());
            }

            if (paramObject != null && parameterAndArgumentHolder.canAccept(paramObject.getClass())) {
                parameterAndArgumentHolder.accept(
                        new TypeDescribableObject(paramObject, parameterAndArgumentHolder.getParameterType()));
                log.debug("Parameter name json binding of {}", parameterAndArgumentHolder.getParameterName());
                return new ParameterBindingResult(
                        parameterAndArgumentHolder,
                        false,
                        String.format("Matched by JSON conversion from key [%s].",
                                parameterAndArgumentHolder.getParameterName()));
            }
            return new ParameterBindingResult(null, true, failureMessage);
        }
        return new ParameterBindingResult(
                null,
                true,
                String.format("Key [%s] is not visible for JSON conversion.",
                        parameterAndArgumentHolder.getParameterName()));
    }
}
