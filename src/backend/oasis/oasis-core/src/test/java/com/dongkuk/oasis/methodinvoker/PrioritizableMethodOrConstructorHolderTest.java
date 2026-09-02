package com.dongkuk.oasis.methodinvoker;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-03-02
 */
class PrioritizableMethodOrConstructorHolderTest {
    @Test
    void givenLowestParamContainedThenPriorityIsLowest() {
        ParameterAndArgumentHolder holder1 = mock(ParameterAndArgumentHolder.class);
        ParameterAndArgumentHolder holder2 = mock(ParameterAndArgumentHolder.class);
        MethodOrConstructor methodOrConstructor = new MethodOrConstructor(PrioritizableParameterAndArgumentHolder.class.getMethods()[0]);

        given(holder1.priority()).willReturn(0);
        given(holder2.priority()).willReturn(Integer.MAX_VALUE);

        PrioritizableMethodOrConstructorHolder constructorHolder = new PrioritizableMethodOrConstructorHolder(methodOrConstructor, Arrays.asList(holder1, holder2));
        Assertions.assertThat(constructorHolder.priority()).isEqualTo(Integer.MAX_VALUE);
    }

    @Test
    void givenHighestPriorityParamThenPriorityIsHighest() {
        ParameterAndArgumentHolder holder1 = mock(ParameterAndArgumentHolder.class);
        ParameterAndArgumentHolder holder2 = mock(ParameterAndArgumentHolder.class);
        MethodOrConstructor methodOrConstructor = new MethodOrConstructor(PrioritizableParameterAndArgumentHolder.class.getMethods()[0]);

        given(holder1.priority()).willReturn(0);
        given(holder2.priority()).willReturn(0);

        PrioritizableMethodOrConstructorHolder constructorHolder = new PrioritizableMethodOrConstructorHolder(methodOrConstructor, Arrays.asList(holder1, holder2));
        Assertions.assertThat(constructorHolder.priority()).isEqualTo(0);
    }
}