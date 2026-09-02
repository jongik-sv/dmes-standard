package com.dongkuk.oasis.expression.property;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.context.SubProcessResult;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-07-26
 */
class KeyAccessorTest {
    @Test
    void mapAccess() {
        Map<String, String> stringType = new HashMap<>();
        stringType.put("hi", "hello");

        KeyAccessor keyAccessor = new KeyAccessor("hi");
        TypedObject access = keyAccessor.access(new TypedObject(stringType, new TypeReference<Map<String, String>>() {
        }));
        assertThat(access.getObject()).isEqualTo("hello");
        assertThat(access.getType()).isEqualTo(String.class);
    }

    @Test
    void contextAccessor() {
        DefaultProcessContext processContext = new DefaultProcessContext(mock(ServiceContext.class));
        processContext.add("hi", new TypedObject("hello"));
        SubProcessResult contextAccessor = new SubProcessResult(processContext);

        KeyAccessor keyAccessor = new KeyAccessor("hi");
        TypedObject access = keyAccessor.access(new TypedObject(contextAccessor));
        assertThat(access.getObject()).isEqualTo("hello");
        assertThat(access.getType()).isEqualTo(String.class);
    }

    @Test
    void contextAccessorForList() {
        DefaultProcessContext processContext = new DefaultProcessContext(mock(ServiceContext.class));
        processContext.add("hi", new TypedObject(Arrays.asList("hi", "roo"), new TypeReference<List<String>>() {
        }));
        SubProcessResult contextAccessor = new SubProcessResult(processContext);

        KeyAccessor keyAccessor = new KeyAccessor("hi");
        TypedObject access = keyAccessor.access(new TypedObject(contextAccessor));
        List<String> object = access.getObject(new TypeReference<List<String>>() {
        });
        assertThat(object).hasSize(2);
        assertThat(object.get(0)).isEqualTo("hi");
        assertThat(access.getType()).isEqualTo(new TypeReference<List<String>>() {
        }.getType());
    }
}