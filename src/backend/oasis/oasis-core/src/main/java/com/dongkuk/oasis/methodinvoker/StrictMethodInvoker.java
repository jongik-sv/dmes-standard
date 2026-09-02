package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.exceptions.MethodInvokeException;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodResolutionException;

import java.lang.reflect.InvocationTargetException;

/**
 * It is an implementation of MethodInvoker.
 * <p>
 * First, a method is searched using
 * {@link com.dongkuk.oasis.methodinvoker.annotations.MethodQualifier},
 * followed by a method whose parameter name matches the context,
 * and then the method whose parameter type matches the context.
 * <p>
 * All parameters of the method match the context
 *
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
public final class StrictMethodInvoker implements MethodInvoker {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(StrictMethodInvoker.class);
    private final MethodArgumentBinder binder = new TypeMatchableMethodArgumentBinder();
    private final PriorityPicker picker = new HighestPriorityPicker();

    private final MethodResolver methodResolver = new StrictMethodResolver(
            new PublicCandidateMethodsSelector(),
            binder,
            picker
    );
    private final ObjectFactory objectFactory = new DefaultObjectFactory(
            new StrictConstructorResolver(
                    new PublicOnlyCandidateConstructorsSelector(),
                    binder,
                    picker
            )
    );

    /**
     * @return objectFactory
     */
    public ObjectFactory objectFactory() {
        return this.objectFactory;
    }

    @Override
    public TypeDescribableObject invoke(Object object, String methodName, Context context) {
        PrioritizableMethodOrConstructorHolder resolve;
        try {
            if (methodName != null) {
                resolve = methodResolver.resolve(object.getClass(), methodName, context);

            } else {
                resolve = methodResolver.resolve(object.getClass(), context);
            }
        } catch (MethodNotFoundException e) {
            throw new MethodResolutionException(summaryMessage(e.getMessage()), e);
        }

        log.debug("Method [{}] selected.",resolve.method().toGenericString());

        Object invoke;
        try {
            resolve.method().setAccessible(true);
            invoke = resolve.method().invoke(object, resolve.args());
        } catch (IllegalAccessException e) {
            throw new MethodInvokeException(e.getMessage(), e);
        } catch (InvocationTargetException e) {
            if (e.getTargetException() instanceof RuntimeException) {
                throw (RuntimeException) e.getTargetException();
            } else {
                throw new MethodInvokeException(e.getMessage(), e);
            }
        } finally {
            resolve.method().setAccessible(false);
        }

        return new TypeDescribableObject(invoke, resolve.method().getGenericReturnType());
    }

    @Override
    public TypeDescribableObject invoke(Class<?> clazz, String methodName, Context context) {
        Object object = objectFactory.createObject(clazz, context);

        return invoke(object, methodName, context);
    }

    @Override
    public TypeDescribableObject invoke(String fullQualifiedClassName, String methodName, Context context) {
        Object object = objectFactory.createObject(fullQualifiedClassName, context);

        return invoke(object, methodName, context);
    }

    private String summaryMessage(String message) {
        if (message == null) {
            return null;
        }

        int separatorIndex = message.indexOf(System.lineSeparator());
        if (separatorIndex < 0) {
            return message;
        }
        return message.substring(0, separatorIndex);
    }
}
