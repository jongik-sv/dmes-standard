package com.dongkuk.oasis.methodinvoker.annotations;

import java.lang.annotation.*;

/**
 * Annotation to mark it as a default method.
 *
 * @author Jeongjin Kim
 * @since 2021-03-09
 */
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface DefaultMethod {
}
