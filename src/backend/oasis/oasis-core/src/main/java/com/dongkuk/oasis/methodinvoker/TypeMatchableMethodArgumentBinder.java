package com.dongkuk.oasis.methodinvoker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-03-12
 */
final class TypeMatchableMethodArgumentBinder implements MethodArgumentBinder {
    private static final Logger log = LoggerFactory.getLogger(TypeMatchableMethodArgumentBinder.class);

    @Override
    public PrioritizableMethodOrConstructorHolder bind(MethodOrConstructor methodOrConstructor, Context context) {
        return bindWithDiagnostics(methodOrConstructor, context).holder();
    }

    @Override
    public BindingAttemptResult bindWithDiagnostics(MethodOrConstructor methodOrConstructor, Context context) {
        List<ParameterAndArgumentHolder> parameterAndArgumentHolders =
                new ArrayList<>(methodOrConstructor.parameterCount());
        List<String> diagnosticLines = new ArrayList<>(methodOrConstructor.parameterCount());

        if (methodOrConstructor.parameterCount() > 0 && context == null)
            throw new MethodBindingException("Args exist but no context exists.");

        params:
        for (int i = 0; i < methodOrConstructor.parameterCount(); i++) {
            MethodOrConstructorParameter methodParameter =
                    new SpringMethodOrConstructorParameter(methodOrConstructor, i);
            ParameterAndArgumentHolder parameterAndArgumentHolder =
                    new PrioritizableParameterAndArgumentHolder(methodParameter);

            List<MethodArgumentBindingStrategy> parameterQualifierBindingStrategies = bindingStrategies();
            List<String> strategyMessages = new ArrayList<>(parameterQualifierBindingStrategies.size());

            for (MethodArgumentBindingStrategy strategy : parameterQualifierBindingStrategies) {
                log.info("Strategy [{}], Param name [{}], Param type [{}]", strategy.getClass().getSimpleName(),
                        parameterAndArgumentHolder.getParameterName(),
                        parameterAndArgumentHolder.getParameterType());
                ParameterBindingResult parameterBindingResult;
                try {
                    parameterBindingResult = strategy.tryBind(parameterAndArgumentHolder, context);
                } catch (IllegalArgumentException | ClassCastException e) {
                    log.debug("Binding strategy [{}] failed for parameter [{}]: {}",
                            strategy.getClass().getSimpleName(),
                            parameterAndArgumentHolder.getParameterName(),
                            e.getMessage());
                    parameterBindingResult = new ParameterBindingResult(
                            null,
                            false,
                            "Binding error: " + e.getMessage());
                }

                if (parameterBindingResult.getParameterAndArgumentHolder() != null) {
                    parameterAndArgumentHolders.add(parameterBindingResult.getParameterAndArgumentHolder());
                    diagnosticLines.add(String.format("Parameter [%s : %s] matched. %s",
                            parameterAndArgumentHolder.getParameterName(),
                            typeName(parameterAndArgumentHolder.getParameterType()),
                            formatStrategyMessage(strategy, parameterBindingResult.getMessage())));
                    continue params;
                } else {
                    strategyMessages.add(formatStrategyMessage(strategy, parameterBindingResult.getMessage()));
                    if (!parameterBindingResult.isOptional()) {
                        break params;
                    }
                }
            }
            log.debug("Can't bind parameter [{}][{}]",
                    methodParameter.getParameterName(),
                    methodParameter.getParameterType());
            diagnosticLines.add(String.format("Parameter [%s : %s] was not bound. %s",
                    methodParameter.getParameterName(),
                    typeName(methodParameter.getGenericParameterType()),
                    String.join(" | ", strategyMessages)));
            // If getting here, you do not need to try the next parameter because one parameter could not be bound.
            break;
        }

        // When the number of arguments for which mapping was confirmed and the number of parameters ara same
        // then the constructor Approved.
        if (parameterAndArgumentHolders.size() == methodOrConstructor.parameterCount()) {
            return new BindingAttemptResult(
                    new PrioritizableMethodOrConstructorHolder(methodOrConstructor, parameterAndArgumentHolders),
                    diagnosticLines);
        } else {
            return new BindingAttemptResult(null, diagnosticLines);
        }
    }

    private List<MethodArgumentBindingStrategy> bindingStrategies() {
        List<MethodArgumentBindingStrategy> parameterQualifierBindingStrategies = new ArrayList<>(5);
        parameterQualifierBindingStrategies.add(new ParameterQualifierMethodArgumentBindingStrategy());
        parameterQualifierBindingStrategies.add(new ParameterNameMethodArgumentBindingStrategy());
        parameterQualifierBindingStrategies.add(new ParameterTypeMethodArgumentBindingStrategy());
        parameterQualifierBindingStrategies.add(new ParameterNameAndJsonMethodArgumentBindingStrategy());
        parameterQualifierBindingStrategies.add(new OptionalMethodArgumentBindingStrategy());
        return parameterQualifierBindingStrategies;
    }

    private String formatStrategyMessage(MethodArgumentBindingStrategy strategy, String message) {
        return strategy.getClass().getSimpleName() + " -> " + message;
    }

    private String typeName(Type type) {
        return type == null ? "null" : type.getTypeName();
    }
}
