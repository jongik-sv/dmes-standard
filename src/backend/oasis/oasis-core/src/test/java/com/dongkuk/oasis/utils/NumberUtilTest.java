package com.dongkuk.oasis.utils;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-06-16
 */
class NumberUtilTest {
    @Test
    void givenNullOrEmptyStringThenThrowException() {
        assertThatExceptionOfType(NumberFormatException.class).isThrownBy(() ->
                NumberUtil.parserNumberAsObject(null)
        );
        assertThatExceptionOfType(NumberFormatException.class).isThrownBy(() ->
                NumberUtil.parserNumberAsObject("")
        );
    }

    @Test
    void givenNoNumberStringThenThrowException() {
        assertThatExceptionOfType(NumberFormatException.class).isThrownBy(() ->
                NumberUtil.parserNumberAsObject("aad")
        );
    }

    @Test
    void givenFloatingPointStringThenReturnDoubleTypeObject() {
        Object o = NumberUtil.parserNumberAsObject("3.123");
        assertThat(o).isInstanceOf(Double.class);
        assertThat(o).isEqualTo(3.123);
    }

    @Test
    void givenIntegerStringThenReturnIntegerTypeObject() {
        Object o = NumberUtil.parserNumberAsObject("33");
        assertThat(o).isInstanceOf(Integer.class);
        assertThat(o).isEqualTo(33);
    }

    @Test
    void givenIntegerStringWithWhiteSpacesThenReturnIntegerTypeObject() {
        Object o = NumberUtil.parserNumberAsObject(" 333 3 ");
        assertThat(o).isInstanceOf(Integer.class);
        assertThat(o).isEqualTo(3333);
    }

}