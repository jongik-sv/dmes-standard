package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.utils.MapBuilder;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-04-18
 */
class MethodInvokerContextTest {
    @Test
    void givenPropertyThenReturnValueFromPropertyIfExists() {
        Map<String, TypedObject> inputs = new MapBuilder<String, TypedObject>()
                .addEntity("prop", new TypedObject("v")).build();
        MethodInvokerContext context = new MethodInvokerContext(
                mock(ExecutableContext.class),
                inputs,
                null,
                null);

        TypeDescribableObject prop = context.getValueByKey("prop");

        assertThat(prop.getObject()).isEqualTo("v");
    }

    @Test
    void givenInputKeysThenOnlyGetFromInputKeys() {
        ProcessContext processContext = new DefaultProcessContext(mock(ServiceContext.class));
        processContext.add("abc", new TypedObject("abc"));
        processContext.add("def", new TypedObject("def"));
        processContext.add("hij", new TypedObject("hij"));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        String inputKeys = "abc,ccc";

        List<PropertyExpression> parse = PropertyParser.parse(inputKeys);
        MethodInvokerContext context = new MethodInvokerContext(
                executableContext,
                Collections.emptyMap(),
                parse,
                true);

        assertThat(context.getValueByKey("abc").getObject()).isEqualTo("abc");
        assertThat(context.hasKey("abc")).isTrue();
        assertThatExceptionOfType(NoSuchElementException.class).isThrownBy(() -> context.getValueByKey("def"));
        assertThatExceptionOfType(NoSuchElementException.class).isThrownBy(() -> context.getValueByKey("ccc"));
    }

    @Test
    void givenInputKeysWithExpressionThenGetAccessedObject() {
        ProcessContext processContext = new DefaultProcessContext(mock(ServiceContext.class));
        processContext.add("abc", new TypedObject(Arrays.asList("hi", "roo"), new TypeReference<List<String>>() {
        }));
        processContext.add("def", new TypedObject(Arrays.asList("what", "the"), new TypeReference<List<String>>() {
        }));
        processContext.add("hij", new TypedObject("hij"));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        String inputKeys = "abc[0],def[0] -> kkk,def -> yyy";

        List<PropertyExpression> inputProperty = PropertyParser.parse(inputKeys);
        MethodInvokerContext context = new MethodInvokerContext(
                executableContext,
                Collections.emptyMap(),
                inputProperty,
                true);

        assertThat(context.getValueByKey("abc").getObject()).isEqualTo("hi");
        assertThat(context.hasKey("abc")).isTrue();
        assertThat(context.getValueByKey("kkk").getObject()).isEqualTo("what");
        assertThat(context.hasKey("kkk")).isTrue();
        assertThat(context.getValueByKey("yyy").getObject(List.class)).hasSize(2);
        assertThat(context.hasKey("yyy")).isTrue();
        assertThatExceptionOfType(NoSuchElementException.class).isThrownBy(() -> context.getValueByKey("def"));
        assertThatExceptionOfType(NoSuchElementException.class).isThrownBy(() -> context.getValueByKey("hij"));
    }

    @Test
    void givenInputOnlyIsFalseWithExpressionThenGetAccessedObject() {
        ProcessContext processContext = new DefaultProcessContext(mock(ServiceContext.class));
        processContext.add("abc", new TypedObject(Arrays.asList("hi", "roo"), new TypeReference<List<String>>() {
        }));
        processContext.add("def", new TypedObject(Arrays.asList("what", "the"), new TypeReference<List<String>>() {
        }));
        processContext.add("hij", new TypedObject("hij"));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        String inputKeys = "abc[0],def[0] -> kkk,def -> yyy";

        List<PropertyExpression> inputProperty = PropertyParser.parse(inputKeys);
        MethodInvokerContext context = new MethodInvokerContext(
                executableContext,
                Collections.emptyMap(),
                inputProperty,
                false);

        assertThat(context.getValueByKey("abc").getObject()).isEqualTo("hi");
        assertThat(context.hasKey("abc")).isTrue();
        assertThat(context.getValueByKey("kkk").getObject()).isEqualTo("what");
        assertThat(context.hasKey("kkk")).isTrue();
        assertThat(context.getValueByKey("yyy").getObject(List.class)).hasSize(2);
        assertThat(context.hasKey("yyy")).isTrue();
        assertThat(context.getValueByKey("def").getObject(List.class)).hasSize(2);
        assertThat(context.hasKey("def")).isTrue();
        assertThat(context.getValueByKey("hij").getObject()).isEqualTo("hij");
        assertThat(context.hasKey("hij")).isTrue();
    }
}