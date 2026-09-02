package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.SubServiceCallTask;
import com.dongkuk.oasis.process.ProcessStarterFactory;

import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.*;

abstract class AbstractSubServiceCallTaskExecutable implements Executable {
    protected final SubServiceCallTask subServiceCallTask;
    protected final ProcessStarterFactory processStarterFactory;
    protected final int timeoutSecond;
    private final List<String> acceptablePropertyNames = Arrays.asList(
            OUTPUT_KEY, INPUT_KEY, SERVICE_DTO, CREATE_NEW_SERVICE);

    AbstractSubServiceCallTaskExecutable(SubServiceCallTask subServiceCallTask,
                                         ProcessStarterFactory processStarterFactory,
                                         int timeoutSecond) {
        this.subServiceCallTask = subServiceCallTask;
        this.processStarterFactory = processStarterFactory;
        this.timeoutSecond = timeoutSecond;
    }

    AbstractSubServiceCallTaskExecutable(SubServiceCallTask subServiceCallTask,
                                         ProcessStarterFactory processStarterFactory) {
        this(subServiceCallTask, processStarterFactory, Integer.MAX_VALUE);
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }

    protected List<Class<?>> extractDtoClasses() {
        Property dto = subServiceCallTask.getProperty(SERVICE_DTO);
        if (dto == null)
            return Collections.emptyList();

        String[] dtoClassNames = Arrays.stream(dto.getValue().split(","))
                .map(String::trim)
                .toArray(String[]::new);

        List<Class<?>> classes = new ArrayList<>();

        for (String dtoClassName : dtoClassNames) {
            try {
                classes.add(Class.forName(dtoClassName));
            } catch (ClassNotFoundException e) {
                throw new RuntimeException("The service DT class is incorrect.", e);
            }
        }
        return classes;
    }

    protected Map<String, TypedObject> createServiceInput(Process subProcess, ExecutableContext executableContext) {
        Map<String, TypedObject> inputs = new HashMap<>();

        bindWithPropertyAndContext(executableContext, inputs, subServiceCallTask.getProperty(INPUT_KEY));
        bindWithPropertyAndContext(executableContext, inputs, subProcess.getProperty(INPUT_KEY));

        if (executableContext instanceof IteratorUnpackedContext) {
            Map<String, TypedObject> unpackedIterable;
            unpackedIterable = ((IteratorUnpackedContext) executableContext).getUnpackedIterable();
            for (Map.Entry<String, TypedObject> stringTypedObjectEntry : unpackedIterable.entrySet()) {
                inputs.put(stringTypedObjectEntry.getKey(), stringTypedObjectEntry.getValue());
            }
        }

        inputs.putAll(subServiceCallTask.inputs().export());

        return inputs;
    }

    private void bindWithPropertyAndContext(ExecutableContext executableContext,
                                            Map<String, TypedObject> inputs,
                                            Property callerProperty) {
        if (callerProperty != null) {
            List<PropertyExpression> propertyExpressions = PropertyParser.parse(callerProperty);
            for (PropertyExpression propertyExpression : propertyExpressions) {
                TypedObject result;
                String inputKey = propertyExpression.getValue(String.class);
                String inputKeyAlias = propertyExpression.getAlias(String.class);
                result = executableContext.get(inputKey);
                if (result == null) {
                    result = inputs.get(inputKey);
                    if (result == null)
                        throw new NoSuchElementException(
                                String.format("[%s] is not present in the context.", inputKey));
                }
                result = PropertyUtil.access(result, propertyExpression.getAccessors());
                inputs.put(inputKeyAlias, result);
            }
        }
    }
}
