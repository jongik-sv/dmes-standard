package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.ElementExecutor;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.utils.MapBuilder;
import net.datafaker.Faker;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.dongkuk.oasis.model.PropertyNames.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-07-16
 */
class CoreElementExecutorTest {
    ElementExecutor elementExecutor =
            new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver()).generateElementExecutor();

    @Test
    void givenIterableTaskThenRunAll() {
        List<HelloDto> helloDtos = new ArrayList<>();
        Faker faker = new Faker();
        for (int i = 0; i < faker.random().nextInt(3, 10); i++) {
            helloDtos.add(new HelloDto(faker.funnyName().name()));
        }
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                new MapBuilder<String, TypedObject>()
                        .addEntity("data", new TypedObject(helloDtos, new TypeReference<List<HelloDto>>() {
                        }))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property(METHOD, "hello"));
        propertyContainer.add(new Property(ITERATOR, "data->helloDto"));

        ExecutionResult execute = elementExecutor.execute(
                getElement(propertyContainer, MultiInstance.loopMultiInstance()),
                executableContext
        );
        assertThat(execute.result().getObject()).isInstanceOf(List.class);
        assertThat(execute.result().getObject(List.class)).hasSize(helloDtos.size());
        assertThat(execute.result().getObject(new TypeReference<List<TypedObject>>() {
        }).get(0).getObject()).isEqualTo(helloDtos.get(0).getName());
        assertThat(execute.result()
                .getObject(new TypeReference<List<TypedObject>>() {
                }).
                        get(helloDtos.size() - 1).getObject())
                .isEqualTo(helloDtos.get(helloDtos.size() - 1)
                        .getName());
    }

    @Test
    void givenIterableTaskWithMapExplodeMapIntoContext() {
        List<Map<String, Object>> helloDtos = new ArrayList<>();
        Faker faker = new Faker();
        for (int i = 0; i < faker.random().nextInt(3, 10); i++) {
            helloDtos.add(new MapBuilder<String, Object>()
                    .addEntity("message", faker.artist().name())
                    .build());
        }
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                new MapBuilder<String, TypedObject>()
                        .addEntity("data", new TypedObject(helloDtos, new TypeReference<List<Map<String, Object>>>() {
                        }))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property(METHOD, "hello"));
        propertyContainer.add(new Property(ITERATOR, "data"));

        ExecutionResult execute = elementExecutor.execute(
                getElement(propertyContainer, MultiInstance.loopMultiInstance()),
                executableContext
        );
        assertThat(execute.result().getObject(List.class)).hasSize(helloDtos.size());
        assertThat(execute.result().getObject(new TypeReference<List<TypedObject>>() {
        }).get(0).getObject(String.class)).isEqualTo("Hi! " + helloDtos.get(0).get("message"));
    }

    @Test
    void givenIterableTaskWithMapIntoContext() {
        List<Map<String, Object>> helloDtos = new ArrayList<>();
        Faker faker = new Faker();
        for (int i = 0; i < faker.random().nextInt(3, 10); i++) {
            helloDtos.add(new MapBuilder<String, Object>()
                    .addEntity("message", faker.artist().name())
                    .build());
        }
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                new MapBuilder<String, TypedObject>()
                        .addEntity("data", new TypedObject(helloDtos, new TypeReference<List<Map<String, Object>>>() {
                        }))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property(METHOD, "hello"));
        propertyContainer.add(new Property(ITERATOR, "data -> hellos"));

        ExecutionResult execute = elementExecutor.execute(
                getElement(propertyContainer, MultiInstance.loopMultiInstance()),
                executableContext
        );
        System.out.println(execute);

        assertThat(execute.result().getObject(List.class)).hasSize(helloDtos.size());
        List<TypedObject> object = execute.result().getObject(new TypeReference<List<TypedObject>>() {
        });
        for (TypedObject o : object) {
            System.out.println(o);
        }
        List<Object> message = helloDtos.stream()
                .map(stringObjectMap -> stringObjectMap.get("message")).collect(Collectors.toList());
        for (int i = 0; i < message.size(); i++) {
            assertThat(object.get(i).getObject()).isEqualTo(message.get(i));
        }
    }

    @Test
    void givenIterableTaskWithAccessorIntoContext() {
        Map<String, List<Map<String, Object>>> data = new HashMap<>();
        List<Map<String, Object>> helloDtos = new ArrayList<>();
        Faker faker = new Faker();
        for (int i = 0; i < faker.random().nextInt(3, 10); i++) {
            helloDtos.add(new MapBuilder<String, Object>()
                    .addEntity("message", faker.artist().name())
                    .build());
        }
        data.put("m1", helloDtos);
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                new MapBuilder<String, TypedObject>()
                        .addEntity("data", new TypedObject(data, new TypeReference<Map<String, List<Map<String, Object>>>>() {
                        }))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property(METHOD, "hello"));
        propertyContainer.add(new Property(ITERATOR, "data['m1']"));

        ExecutionResult execute = elementExecutor.execute(
                getElement(propertyContainer, MultiInstance.loopMultiInstance()),
                executableContext
        );
        assertThat(execute.result().getObject(List.class)).hasSize(helloDtos.size());
        assertThat(execute.result().getObject(new TypeReference<List<TypedObject>>() {
        }).get(0).getObject(String.class)).isEqualTo("Hi! " + helloDtos.get(0).get("message"));
    }

    @Test
    void givenIterableTaskWithoutIterPropertyThenException() {
        List<HelloDto> helloDtos = new ArrayList<>();
        Faker faker = new Faker();
        for (int i = 0; i < faker.random().nextInt(3, 10); i++) {
            helloDtos.add(new HelloDto(faker.funnyName().name()));
        }
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                new MapBuilder<String, TypedObject>()
                        .addEntity("data", new TypedObject(helloDtos, new TypeReference<List<HelloDto>>() {
                        }))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        processContext.add("data", new TypedObject(new KorHello()));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property(METHOD, "hello"));

        Assertions.assertThatExceptionOfType(PropertyException.class)
                .isThrownBy(() -> elementExecutor.execute(
                        getElement(propertyContainer, MultiInstance.loopMultiInstance()),
                        executableContext
                ));
    }

    @Test
    void givenIterPropertyButNotIterableTaskThenException() {
        List<HelloDto> helloDtos = new ArrayList<>();
        Faker faker = new Faker();
        for (int i = 0; i < faker.random().nextInt(3, 10); i++) {
            helloDtos.add(new HelloDto(faker.funnyName().name()));
        }
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                new MapBuilder<String, TypedObject>()
                        .addEntity("data", new TypedObject(helloDtos, new TypeReference<List<HelloDto>>() {
                        }))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        processContext.add("data", new TypedObject(new KorHello()));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property(METHOD, "hello"));
        propertyContainer.add(new Property(ITERATOR, "data"));

        Assertions.assertThatExceptionOfType(PropertyException.class)
                .isThrownBy(() -> elementExecutor.execute(
                        getElement(propertyContainer, MultiInstance.nonMultiInstance()),
                        executableContext
                ));
    }

    @Test
    void givenIterIsNotIterableThenException() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                new MapBuilder<String, TypedObject>()
                        .addEntity("data", new TypedObject("hi"))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        processContext.add("data", new TypedObject(new KorHello()));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property(METHOD, "hello"));
        propertyContainer.add(new Property(ITERATOR, "data"));

        Assertions.assertThatExceptionOfType(PropertyException.class)
                .isThrownBy(() -> elementExecutor.execute(
                        getElement(propertyContainer, MultiInstance.loopMultiInstance()),
                        executableContext
                ));
    }

    private JavaServiceTask getElement(PropertyContainer propertyContainer, MultiInstance multiInstance) {
        return new JavaServiceTask("t1",
                "t1",
                null,
                null,
                mock(SequentialFlow.class),
                "com.dongkuk.oasis.executors.SimpleClass",
                propertyContainer,
                new InputOutputContainer(),
                new InputOutputContainer(),
                multiInstance);
    }
}