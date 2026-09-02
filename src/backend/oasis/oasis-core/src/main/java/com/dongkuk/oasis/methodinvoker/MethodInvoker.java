package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.annotations.DefaultMethod;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodInvokeException;

/**
 * Interface to invoke the object's method.
 * <p>
 * The method name and parameter type are used to determine the method to be executed.
 * <p>
 * You can also specify a default method with the {@link DefaultMethod} annotation.
 * Only one method can be specified in a class, and in this case, the method name is not required.
 *
 * @author Jeongjin Kim
 * @since 2021-03-09
 */
public interface MethodInvoker {
    /**
     * Invoke method of object determined by method name and context.
     * The value mapped to the context by method annotation, parameter name, type, etc. is used as an argument.
     *
     * @param object     the object the underlying method is invoked from
     * @param methodName the method name to invoke, optional
     * @param context    The context referenced to invoke method
     * @return the result of dispatching the method represented by this object on obj with parameters args
     * @throws MethodInvokeException thrown when failed to invoke the method
     */
    TypeDescribableObject invoke(Object object, String methodName, Context context);

    /**
     * Invoke method of object determined by method name and context.
     * The value mapped to the context by method annotation, parameter name, type, etc. is used as an argument.
     *
     * @param clazz      the class of the method
     * @param methodName the method name to invoke, optional
     * @param context    The context referenced to invoke method
     * @return the result of dispatching the method represented by this object on obj with parameters args
     * @exception MethodInvokeException thrown when failed to invoke the method
     */
    TypeDescribableObject invoke(Class<?> clazz, String methodName, Context context);

    /**
     * Invoke method of object determined by method name and context.
     * The value mapped to the context by method annotation, parameter name, type, etc. is used as an argument.
     *
     * @param fullQualifiedClassName the full qualified class name of the class
     * @param methodName             the method name to invoke, optional
     * @param context                The context referenced to invoke method
     * @return the result of dispatching the method represented by this object on obj with parameters args
     * @exception MethodInvokeException thrown when failed to invoke the method
     */
    TypeDescribableObject invoke(String fullQualifiedClassName, String methodName, Context context);
}
