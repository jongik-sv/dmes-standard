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
@A
public @interface B {
    String value() default "";
}
