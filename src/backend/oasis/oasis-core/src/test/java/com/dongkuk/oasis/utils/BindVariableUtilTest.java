package com.dongkuk.oasis.utils;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-07-22
 */
class BindVariableUtilTest {
    @Test
    void bind() {
        Map<String, Object> data = new HashMap<>();
        data.put("name", "hi");
        data.put("age", 3);
        String s = BindVariableUtil.bindVariables("#{name} and #{age}", data);
        Assertions.assertThat(s).isEqualTo("hi and 3");
    }

    @Test
    void bindWithSpacesEdgeOfVariables() {
        Map<String, Object> data = new HashMap<>();
        data.put("name", "hi");
        data.put("age", 3);
        String s = BindVariableUtil.bindVariables("#{ name } and #{  age }", data);
        Assertions.assertThat(s).isEqualTo("hi and 3");
    }
}