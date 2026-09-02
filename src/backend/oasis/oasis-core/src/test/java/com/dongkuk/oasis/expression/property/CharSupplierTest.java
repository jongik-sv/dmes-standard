package com.dongkuk.oasis.expression.property;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-07-05
 */
class CharSupplierTest {
    @Test
    void hasNextTest() {
        CharSupplier charSupplier = new CharSupplier("hi");
        assertThat(charSupplier.hasNext()).isTrue();
        assertThat(charSupplier.next()).isEqualTo('h');
        assertThat(charSupplier.hasNext()).isTrue();
        assertThat(charSupplier.next()).isEqualTo('i');
        assertThat(charSupplier.hasNext()).isFalse();
    }
}