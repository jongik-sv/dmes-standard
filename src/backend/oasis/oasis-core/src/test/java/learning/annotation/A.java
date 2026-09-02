package learning.annotation;

import java.lang.annotation.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface A {
    String value() default "";
}
