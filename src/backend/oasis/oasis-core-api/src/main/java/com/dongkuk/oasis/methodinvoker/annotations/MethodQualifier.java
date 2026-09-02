package com.dongkuk.oasis.methodinvoker.annotations;

import java.lang.annotation.*;

/**
 * An annotation specifying a uniquely distinguishable value within a class, separate from the method name.
 * Annotation values must be unique within the class.
 *
 * @author Jeongjin Kim
 * @since 2021-03-09
 */
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface MethodQualifier {
    /**
     * Method qualifier. Usually method name.
     * @return the value of the method qualifier
     */
    String value() default "";
}
