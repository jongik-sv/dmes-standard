package com.dongkuk.oasis.methodinvoker.annotations;

import java.lang.annotation.*;

/**
 * Annotation to mark it as a default constructor.
 * <p>
 * There must be only one in the class.
 * If more than one exists, an exception should be raised.
 *
 * @author Jeongjin Kim
 * @since 2021-03-09
 */
@Target({ElementType.CONSTRUCTOR})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DefaultConstructor {
}
