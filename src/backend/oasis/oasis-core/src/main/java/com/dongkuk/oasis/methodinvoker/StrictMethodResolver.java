package com.dongkuk.oasis.methodinvoker;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * When all values of parameter exist in the context, the corresponding method is selected.
 *
 * @author Jeongjin Kim
 * @since 2021-03-10
 */
final class StrictMethodResolver implements MethodResolver {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(StrictMethodResolver.class);
    private final CandidateMethodsSelector candidateMethodsSelector;
    private final MethodArgumentBinder methodArgumentBinder;
    private final PriorityPicker priorityPicker;

    public StrictMethodResolver(CandidateMethodsSelector candidateMethodsSelector
            , MethodArgumentBinder methodArgumentBinder
            , PriorityPicker priorityPicker) {
        this.candidateMethodsSelector = candidateMethodsSelector;
        this.methodArgumentBinder = methodArgumentBinder;
        this.priorityPicker = priorityPicker;
    }

    @Override
    public PrioritizableMethodOrConstructorHolder resolve(Class<?> aClass, String methodName, Context context) {
        Method[] methods = candidateMethodsSelector.select(aClass, methodName);

        // Sort bt parameter length, many -> few
        Arrays.sort(methods, (e1, e2) -> Integer.compare(e2.getParameterCount(), e1.getParameterCount()));

        int beforeConstructorParameterLength = Integer.MAX_VALUE;

        List<PrioritizableMethodOrConstructorHolder> candidatesMethods = new ArrayList<>(methods.length);
        List<String> candidateDiagnostics = new ArrayList<>(methods.length);

        for (Method method : methods) {
            log.info("Try binding for method. [{}]", method.toGenericString());
            if (beforeConstructorParameterLength > method.getParameters().length && candidatesMethods.size() > 0)
                break;

            BindingAttemptResult bindingAttempt =
                    methodArgumentBinder.bindWithDiagnostics(new MethodOrConstructor(method), context);
            candidateDiagnostics.add(formatCandidateDiagnostic(method, bindingAttempt.diagnosticLines()));
            if (bindingAttempt.holder() != null)
                candidatesMethods.add(bindingAttempt.holder());

            beforeConstructorParameterLength = method.getParameters().length;
        }
        if (candidatesMethods.size() == 0)
            throw new MethodNotFoundException(
                    buildNoSuchMethodMessage(aClass, methodName, context, candidateDiagnostics));

        Prioritizable pick;
        try {
            pick = priorityPicker.pick(candidatesMethods);
        } catch (PriorityPickingException e) {
            throw new MethodNotFoundException(
                    String.format("PriorityPicker exception : %s", aClass.getName()), e);
        }
        return (PrioritizableMethodOrConstructorHolder) pick;
    }

    @Override
    public PrioritizableMethodOrConstructorHolder resolve(Class<?> aClass, Context context) {
        return this.resolve(aClass, null, context);
    }

    private String buildNoSuchMethodMessage(Class<?> aClass,
                                            String methodName,
                                            Context context,
                                            List<String> candidateDiagnostics) {
        StringBuilder message = new StringBuilder(
                String.format("No suitable method. : Class[%s], Method[%s]", aClass.getName(), methodName));

        if (context instanceof ContextDiagnosticsProvider) {
            List<String> contextDiagnostics = ((ContextDiagnosticsProvider) context).describeMethodBindingContext();
            if (!contextDiagnostics.isEmpty()) {
                message.append(System.lineSeparator()).append("Context diagnostics:");
                for (String contextDiagnostic : contextDiagnostics) {
                    message.append(System.lineSeparator()).append("- ").append(contextDiagnostic);
                }
            }
        }

        if (!candidateDiagnostics.isEmpty()) {
            message.append(System.lineSeparator()).append("Candidate diagnostics:");
            for (String candidateDiagnostic : candidateDiagnostics) {
                message.append(System.lineSeparator()).append(candidateDiagnostic);
            }
        }

        return message.toString();
    }

    private String formatCandidateDiagnostic(Method method, List<String> diagnosticLines) {
        StringBuilder builder = new StringBuilder("- ").append(method.toGenericString());
        if (diagnosticLines.isEmpty()) {
            builder.append(System.lineSeparator()).append("  No parameter binding diagnostics were recorded.");
            return builder.toString();
        }

        for (String diagnosticLine : diagnosticLines) {
            builder.append(System.lineSeparator()).append("  ").append(diagnosticLine);
        }
        return builder.toString();
    }
}
