package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.context.SubProcessResult;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.process.ProcessStarter;
import com.dongkuk.oasis.service.ServiceFindableContext;
import com.dongkuk.oasis.service.ServiceFindableProcessContext;

import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.PROCESS_DTO;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
abstract class SubProcessExecutable implements Executable {
    protected SubProcessResult runSubProcess(ExecutableContext executableContext,
                                             SubProcess subProcess,
                                             ProcessStarter processStarter,
                                             Property inputProperty,
                                             Map<String, TypedObject> taskInputs) {
        Map<String, TypedObject> inputs = new HashMap<>();

        if (inputProperty != null) {
            List<PropertyExpression> propertyExpressions = PropertyParser.parse(inputProperty);
            for (PropertyExpression propertyExpression : propertyExpressions) {
                TypedObject result;
                String inputKey = propertyExpression.getValue(String.class);

                result = executableContext.get(inputKey);
                if (result == null)
                    throw new NoSuchElementException(String.format("[%s] is not in the context.", inputKey));

                result = PropertyUtil.access(result, propertyExpression.getAccessors());

                String inputKeyAlias = propertyExpression.getAlias(String.class);
                inputs.put(inputKeyAlias, result);
            }
        }

        inputs.putAll(taskInputs);
        ServiceFindableContext elementFindableExecutableNodeContext
                = (ServiceFindableContext) executableContext.processContext();
        ProcessContext processContext = new DefaultProcessContext(executableContext.serviceContext());

        for (Map.Entry<String, TypedObject> stringTypedObjectEntry : inputs.entrySet()) {
            processContext.add(stringTypedObjectEntry.getKey(), stringTypedObjectEntry.getValue());
        }

        Map<String, TypedObject> unpackedIterable = null;
        if (executableContext instanceof IteratorUnpackedContext) {
            unpackedIterable = ((IteratorUnpackedContext) executableContext).getUnpackedIterable();
        }

        if (unpackedIterable != null) {
            for (Map.Entry<String, TypedObject> stringTypedObjectEntry : unpackedIterable.entrySet()) {
                processContext.add(stringTypedObjectEntry.getKey(), stringTypedObjectEntry.getValue());
            }
        }

        List<Class<?>> serviceDtoClasses = getDtoClasses(subProcess);
        Map<String, TypedObject> dtos = new HashMap<>();
        if (serviceDtoClasses != null) {
            DtoGeneratorFromServiceContextAndProcessContext dtoGenerator
                    = new DtoGeneratorFromServiceContextAndProcessContext();
            for (Class<?> serviceDtoClass : serviceDtoClasses) {
                dtos.put(serviceDtoClass.getSimpleName(),
                        new TypedObject(dtoGenerator.generator(executableContext, serviceDtoClass)));
            }
        }
        for (Map.Entry<String, TypedObject> dto : dtos.entrySet()) {
            processContext.add(dto.getKey(), dto.getValue());
        }

        ServiceFindableProcessContext serviceFindableProcessContext
                = new ServiceFindableProcessContext(processContext, elementFindableExecutableNodeContext);

        processStarter.start(subProcess, serviceFindableProcessContext);

        return new SubProcessResult(processContext);
    }

    private List<Class<?>> getDtoClasses(Process process) {
        Property dto = process.getProperty(PROCESS_DTO);
        if (dto == null)
            return null;

        String[] dtoClassNames = Arrays.stream(dto.getValue().split(","))
                .map(String::trim)
                .toArray(String[]::new);

        List<Class<?>> classes = new ArrayList<>();

        for (String dtoClassName : dtoClassNames) {
            try {
                classes.add(Class.forName(dtoClassName));
            } catch (ClassNotFoundException e) {
                throw new RuntimeException("The service DTO class is incorrect.", e);
            }
        }

        return classes;
    }
}
