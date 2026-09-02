package com.dongkuk.oasis.methodinvoker;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-03-22
 */
class TypeDescribableObjectTest {
    @Test
    void parameterizedTypeReference() {
        List<String> sn = new ArrayList<>();

        TypeDescribableObject typeDescribableObject = new TypeDescribableObject(
                sn, new TypeReference<List<String>>() {
        }
        );
        Type type = typeDescribableObject.getType();
        type.getTypeName();

        System.out.println(type.getTypeName());
        Assertions.assertThat(type.getTypeName()).isEqualTo("java.util.List<java.lang.String>");

    }

    @Test
    void wrongTypeBind() {
        List<String> sn = new ArrayList<>();

        Assertions.assertThatExceptionOfType(IllegalArgumentException.class).isThrownBy(() ->
                new TypeDescribableObject(
                        sn, new TypeReference<String>() {
                }))
        ;
    }
}