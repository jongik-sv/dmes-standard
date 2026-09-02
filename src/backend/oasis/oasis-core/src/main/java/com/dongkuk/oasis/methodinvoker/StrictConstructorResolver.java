package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueQualifierException;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The constructor that the longest parameter length among candidate constructors has will be returned.
 * <p>
 * The detailed constructor candidate selection strategy depends on the implementation of
 * {@link CandidateConstructorsSelector}, {@link MethodArgumentBinder} and {@link PriorityPicker}.
 *
 * @author Jeongjin Kim
 * @since 2021-02-23
 */
final class StrictConstructorResolver implements ConstructorResolver {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(StrictConstructorResolver.class);
    private final CandidateConstructorsSelector candidateResolver;
    private final MethodArgumentBinder methodArgumentBinder;
    private final PriorityPicker priorityPicker;

    public StrictConstructorResolver(
            CandidateConstructorsSelector candidateResolver
            , MethodArgumentBinder methodArgumentBinder
            , PriorityPicker priorityPicker) {
        this.candidateResolver = candidateResolver;
        this.methodArgumentBinder = methodArgumentBinder;
        this.priorityPicker = priorityPicker;
    }

    @Override
    public PrioritizableMethodOrConstructorHolder resolve(Class<?> aClass, Context context) {
        // Constructor selection
        Constructor<?>[] constructors;
        try {
            constructors = candidateResolver.select(aClass, null);
        } catch (TooManyDefaultException | NoUniqueQualifierException e) {
            throw new ConstructorNotFoundException(e.getMessage(), e);
        } catch (ConstructorNotFoundException e) {
            throw e;
        }

        // Sort by number of parameter length. many -> few
        Arrays.sort(constructors, (e1, e2) -> Integer.compare(e2.getParameterCount(), e1.getParameterCount()));

        // The parameter length of the constructor that we checked before
        int beforeConstructorParameterLength = Integer.MAX_VALUE;

        List<PrioritizableMethodOrConstructorHolder> candidatesConstructors = new ArrayList<>(constructors.length);

        for (Constructor<?> constructor : constructors) {
            log.info("Try binding for constructor. [{}]", constructor.toGenericString());
            if (beforeConstructorParameterLength > constructor.getParameters().length
                    && candidatesConstructors.size() > 0)
                break;
            PrioritizableMethodOrConstructorHolder holder;
            try {
                holder = methodArgumentBinder.bind(new MethodOrConstructor(constructor), context);
            } catch (MethodBindingException e) {
                throw new ConstructorNotFoundException(e.getMessage(), e);
            }
            if (holder != null)
                candidatesConstructors.add(holder);

            beforeConstructorParameterLength = constructor.getParameters().length;
        }
        if (candidatesConstructors.size() == 0)
            throw new ConstructorNotFoundException("No candidate constructors : " + aClass.getName());

        Prioritizable pick;
        try {
            pick = priorityPicker.pick(candidatesConstructors);
        } catch (PriorityPickingException e) {
            throw new ConstructorNotFoundException(e.getMessage(), e);
        }
        return (PrioritizableMethodOrConstructorHolder) pick;
    }
}
