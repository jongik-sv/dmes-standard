package com.dongkuk.oasis.annotations;

import java.lang.annotation.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
@com.dongkuk.oasis.methodinvoker.annotations.MethodQualifier()
public @interface MethodQualifier {
    /**
     * Method qualifier. Usually method name.
     *
     * @return the value of the method qualifier
     */
    String value();
}
