package learning.annotation;

import java.lang.annotation.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
@B
public @interface C {
    String value();
}
