package com.dongkuk.oasis;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * @author Jeongjin Kim
 * @since 2021-07-09
 */
class TypedObjectTest {
    @Test
    void makeVoidType() {
        TypedObject typedObject = new TypedObject(null, void.class);
        Assertions.assertThat(((Class<?>) typedObject.getType()).getName()).isEqualTo("void");
    }

}