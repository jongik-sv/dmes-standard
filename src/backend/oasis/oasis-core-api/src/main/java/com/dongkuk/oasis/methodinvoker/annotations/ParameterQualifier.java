package com.dongkuk.oasis.methodinvoker.annotations;

import java.lang.annotation.*;

/**
 * Annotation defining which value of the context to map to the associated parameter value.
 *
 * @author Jeongjin Kim
 * @since 2021-02-23
 */
@Target({ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface ParameterQualifier {
    /**
     * Parameter Qualifier. Usually the key of context.
     *
     * @return value of the parameter qualifier
     */
    String value();
}
