package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.stream.Collectors;

import static com.dongkuk.oasis.model.PropertyNames.ITERATOR;

/**
 * @author Jeongjin Kim
 * @since 2021-08-02
 */
abstract class MultiInstanceInternalElementExecutor implements CoreElementExecutor.InnerElementExecutor {
    private static final org.slf4j.Logger log
            = org.slf4j.LoggerFactory.getLogger(MultiInstanceInternalElementExecutor.class);

    protected List<ExecutionResult> executeMultiInstanceElement(TypedObject accessedObject,
                                                                String alias,
                                                                ExecutableContext executableContext,
                                                                Executable executable,
                                                                ItemExecutor itemExecutor,
                                                                boolean unzip) {
        Object iterableObject = accessedObject.getObject();

        validateObject(iterableObject);
        Type itemType = resolveItemType(accessedObject);

        List<ExecutionResult> executionResultList = Collections.synchronizedList(new ArrayList<>());
        int rowCounter = 0;
        for (Object o : ((Iterable<?>) iterableObject)) {
            IteratorUnpackedContext iteratorUnpackedContext =
                    prepareIterableContext(alias, executableContext, itemType, o, unzip);
            itemExecutor.execute(executable, executionResultList, iteratorUnpackedContext);
            rowCounter++;
        }
        if (rowCounter == 0)
            log.warn("There is [0] item to repeat.");
        else
            log.debug("Performed a repeating execution for [{}] items.", rowCounter);
        return executionResultList;
    }

    private void validateObject(Object iterableObject) {
        if (!(iterableObject instanceof Iterable)) {
            throw new PropertyException(
                    String.format("[%s] is not a repeatable type. Specified type is [%S]"
                            , ITERATOR
                            , iterableObject.getClass().getName()));
        }
    }

    private Type resolveItemType(TypedObject accessedObject) {
        Object iterableObject = accessedObject.getObject();
        Type itemType = null;
        if (accessedObject.getType() instanceof ParameterizedType)
            itemType = ((ParameterizedType) accessedObject.getType()).getActualTypeArguments()[0];
        else if (iterableObject.getClass().isArray())
            itemType = iterableObject.getClass().getComponentType();
        return itemType;
    }

    private IteratorUnpackedContext prepareIterableContext(String alias,
                                                           ExecutableContext executableContext,
                                                           Type itemType,
                                                           Object o,
                                                           boolean unzip) {
        IteratorUnpackedContext iteratorUnpackedContext;
        // Map 을 IteratorUnpackedContext 에 풀어서 넣는다.
        if (unzip) {
            iteratorUnpackedContext =
                    new IteratorUnpackedContext(
                            executableContext,
                            new TypedObject(o, itemType == null ? o.getClass() : itemType));
        } else {
            iteratorUnpackedContext =
                    new IteratorUnpackedContext(
                            executableContext,
                            new TypedObject(o, itemType == null ? o.getClass() : itemType), alias);
        }
        return iteratorUnpackedContext;
    }

    ExecutionResult convertExecutionResultListToSingle(List<ExecutionResult> executionResultList) {
        ExecutionResult executionResult = null;
        if (executionResultList.size() > 0) {
            executionResult = executionResultList.get(0);
        }
        List<TypedObject> executionResults =
                executionResultList.stream().map(ExecutionResult::result).collect(Collectors.toList());
        return new UnmodifiableExecutionResult(
                new TypedObject(executionResults, new TypeReference<List<TypedObject>>() {
                }),
                executionResult == null ? new HashMap<>() : executionResult.outputs());
    }

    interface ItemExecutor {
        void execute(Executable executable,
                     List<ExecutionResult> executionResultList,
                     IteratorUnpackedContext iteratorUnpackedContext);
    }
}
