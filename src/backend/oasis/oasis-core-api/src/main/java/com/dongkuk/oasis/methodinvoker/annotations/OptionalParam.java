package com.dongkuk.oasis.methodinvoker.annotations;

import java.lang.annotation.*;

/**
 * Mark if the parameter is optional. Method and Argument binder may treat marked parameter as matched.
 *
 * @author Jeongjin Kim
 * @since 2021-03-11
 */
@Target({ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface OptionalParam {
}
