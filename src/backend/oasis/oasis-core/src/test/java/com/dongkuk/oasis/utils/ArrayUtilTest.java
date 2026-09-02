package com.dongkuk.oasis.utils;

import org.junit.jupiter.api.Test;

import static com.dongkuk.oasis.utils.ArrayUtil.isLeftSubsetOfRight;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-06-07
 */
class ArrayUtilTest {
    @Test
    void array() {
        String[] a = new String[]{"b"};
        String[] b = new String[]{"b", "c"};

        boolean contains = isLeftSubsetOfRight(a, b);
        assertThat(contains).isTrue();
    }

    @Test
    void array2() {
        String[] a = new String[]{"d", "c"};
        String[] b = new String[]{"b", "c"};

        boolean contains = isLeftSubsetOfRight(a, b);
        assertThat(contains).isFalse();
    }

    @Test
    void array3() {
        String[] a = new String[]{"b", "c"};
        String[] b = new String[]{"b", "c"};

        boolean contains = isLeftSubsetOfRight(a, b);
        assertThat(contains).isTrue();
    }

    @Test
    void array4() {
        String[] a = new String[]{};
        String[] b = new String[]{"b", "c"};

        boolean contains = isLeftSubsetOfRight(a, b);
        assertThat(contains).isTrue();
    }

    @Test
    void array5() {
        String[] a = new String[]{"b", "c"};
        String[] b = new String[]{"b"};

        boolean contains = isLeftSubsetOfRight(a, b);
        assertThat(contains).isFalse();
    }

    @Test
    void array6() {
        String[] a = new String[]{"b", "c"};
        String[] b = new String[]{"c", "b"};

        boolean contains = isLeftSubsetOfRight(a, b);
        assertThat(contains).isTrue();
    }
}