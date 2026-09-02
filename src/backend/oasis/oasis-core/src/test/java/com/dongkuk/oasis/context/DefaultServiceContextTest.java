package com.dongkuk.oasis.context;

import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DefaultServiceContextTest {
    @Test
    void retainGlobalServiceContext() {
        DefaultServiceContext serviceContext = new DefaultServiceContext(
                new TypedMapBuilder().addEntity("key1", "value1").build());
        ServiceContext subCtx =
                serviceContext.createSubServiceContext(new TypedMapBuilder().addEntity("key2", "value2").build());

        ServiceContext subSubCtx
                = subCtx.createSubServiceContext(new TypedMapBuilder().addEntity("key3", "value3").build());

        assertThat(subCtx.get("key2").getObject()).isEqualTo("value2");
        assertThat(subCtx.get("key1").getObject()).isEqualTo("value1");
        assertThat(subSubCtx.get("key1").getObject()).isEqualTo("value1");
        assertThat(subSubCtx.get("key2")).isNull();
    }
}