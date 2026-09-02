package learning.wow;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface Wow {
    /**
     * 이 메소드와 매핑할 이름 지정.
     * <p>
     * 클래스 내에 중복된 이름이 있으면 안 됨.
     * <p>
     * 기본 값은 공백 문자.
     *
     * @return 이름
     */
    String name() default "";
}
