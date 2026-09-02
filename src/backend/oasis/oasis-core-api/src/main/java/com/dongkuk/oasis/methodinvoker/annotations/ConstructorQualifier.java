package com.dongkuk.oasis.methodinvoker.annotations;

import java.lang.annotation.*;

/**
 * An annotation specifying a uniquely distinguishable value within a class.
 * Annotation values must be unique within the class.
 *
 * @author Jeongjin Kim
 * @since 2021-03-09
 */
@Target({ElementType.CONSTRUCTOR})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface ConstructorQualifier {
    /**
     * Constructor Qualifier.
     *
     * @return value of the constructor qualifier
     */
    String value();
}
