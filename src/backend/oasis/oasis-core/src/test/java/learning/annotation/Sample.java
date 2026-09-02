package learning.annotation;

import org.springframework.context.annotation.Bean;

import javax.annotation.Nonnull;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
public class Sample {
    @C("hi")
    @B("hihi")
    public void test() {

    }

    @Bean
    @Nonnull
    @C("ff")
    public void test2() {

    }

    @A("ff")
    @Bean
    @Nonnull
    public void test3() {

    }
}
