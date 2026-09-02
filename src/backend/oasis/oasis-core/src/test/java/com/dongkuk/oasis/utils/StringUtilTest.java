package com.dongkuk.oasis.utils;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * @author Jeongjin Kim
 * @since 2022-04-20
 */
class StringUtilTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "camelCase",
            "CamelCase",
            "camel_case",
            "CAMEL_CASE",
            "CAMEL_case",
            "camel_CASE",
            "cAmel_CasE"})
    void convertStringToCamelCase(String str) {
        Assertions.assertThat(StringUtil.convertToCamelCase(str)).isEqualTo("camelCase");
    }

    @Test
    void uppercaseOnlyStringConvertToCamelCase() {
        Assertions.assertThat(StringUtil.convertToCamelCase("ID")).isEqualTo("id");
    }
}