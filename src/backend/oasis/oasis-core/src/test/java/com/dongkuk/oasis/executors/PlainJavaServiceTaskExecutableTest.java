package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.exceptions.MethodNotFoundException;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.utils.MapBuilder;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
class PlainJavaServiceTaskExecutableTest {
    @Test
    void simpleMethodCall() {
        PlainJavaServiceTaskExecutable executable = getPlainJavaServiceTaskExecutable();

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("message", new TypedObject("kate"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);

        ExecutionResult execute = executable.execute(executableContext);
        System.out.println(execute);
        assertThat(execute.result().getObject(String.class)).isEqualTo("Hi! kate");
    }

    @Test
    void givenObjectInProcessContextThenUseIt() {
        PlainJavaServiceTaskExecutable executable = new PlainJavaServiceTaskExecutable(
                NickName.class,
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.NickName",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                "getName"
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        DefaultProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        processContext.add("nicname", new TypedObject(new NickName("nicknick")));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("nicknick");
    }

    @Test
    void givenObjectInApplicationContextThenUseIt() {
        PlainJavaServiceTaskExecutable executable = new PlainJavaServiceTaskExecutable(
                NickName.class,
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.NickName",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                "getName"
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        applicationContext.put("nicname", new TypedObject(new NickName("nicknick")));
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("nicknick");
    }

    @Test
    void givenMultiObjectsWithSameTypeThenThrowException() {
        PlainJavaServiceTaskExecutable executable = new PlainJavaServiceTaskExecutable(
                NickName.class,
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.NickName",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                "getName"
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        applicationContext.put("nicname", new TypedObject(new NickName("nicknick")));
        applicationContext.put("nicname2", new TypedObject(new NickName("ffff")));
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext);
        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
                executable.execute(executableContext)
        );
    }

    @Test
    void givenObjectInServiceContextThenUseIt() {
        PlainJavaServiceTaskExecutable executable = new PlainJavaServiceTaskExecutable(
                NickName.class,
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.NickName",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                "getName"
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                applicationContext,
                new TypedMapBuilder().addEntity("nicname", new NickName("nicknick")).build());

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("nicknick");
    }

    @Test
    void givenObjectInServiceContextAndClassNameIsInterfaceThenUseIt() {
        PlainJavaServiceTaskExecutable executable = new PlainJavaServiceTaskExecutable(
                Hello.class,
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.Hello",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                "sayHello"
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                applicationContext,
                new TypedMapBuilder()
                        .addEntity("hello", new KorHello())
                        .build());

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        Assertions.assertThat(execute.result().getObject()).isEqualTo("안녕하세요.");
    }

    @Test
    void givenMultipleObjectImplementSameInterfaceAndClassNameIsInterfaceThenThrowException() {
        PlainJavaServiceTaskExecutable executable = new PlainJavaServiceTaskExecutable(
                Hello.class,
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.Hello",
                        new PropertyContainer().add(new Property("new", "false")),
                        new InputOutputContainer(),
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                "sayHello"
        );

        DefaultApplicationContext applicationContext = new DefaultApplicationContext();
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                applicationContext,
                new TypedMapBuilder()
                        .addEntity("hello", new KorHello())
                        .addEntity("hello2", new EngHello())
                        .build());

        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
                executable.execute(executableContext)
        );
    }

    @Test
    void givenStringTypeMatchedButNameIsDifferentThenMisMatch() {
        PlainJavaServiceTaskExecutable executable = getPlainJavaServiceTaskExecutable();

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("msg", new TypedObject("kate"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
                executable.execute(executableContext)
        );
    }

    @Test
    void givenNameDifferentButTypeMatchThenMatch() {
        PlainJavaServiceTaskExecutable executable = getPlainJavaServiceTaskExecutable();

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("msg", new TypedObject(new HelloDto("hi")));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        System.out.println(execute);
        assertThat(execute.result().getObject(String.class)).isEqualTo("hi");
    }

    @Test
    void givenNameDifferentButDeliveredTypeMatchThenMatch() {
        PlainJavaServiceTaskExecutable executable = getPlainJavaServiceTaskExecutable();

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("msg", new TypedObject(new KorHelloDto("hi")));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        System.out.println(execute);
        assertThat(execute.result().getObject(String.class)).isEqualTo("hi 입니다.");
    }

    @Test
    void givenInterfaceParameterThenMatchConcreteClass() {
        PlainJavaServiceTaskExecutable executable = getPlainJavaServiceTaskExecutable();

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("msg", new TypedObject(new KorHello()));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        System.out.println(execute);
        assertThat(execute.result().getObject(String.class)).isEqualTo("안녕하세요.");
    }

    @Test
    void givenInterfaceParameterWithParameterNameUsedThenMatchConcreteClass() {
        PlainJavaServiceTaskExecutable executable = getPlainJavaServiceTaskExecutable();

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("message", new TypedObject(new KorHello()));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        System.out.println(execute);
        assertThat(execute.result().getObject(String.class)).isEqualTo("안녕하세요.");
    }

    @Test
    void givenMethodQualifierThenFindFirst() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "nonono"));

        PlainJavaServiceTaskExecutable executable = getPlainJavaServiceTaskExecutable(propertyContainer);

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("message", new TypedObject(new KorHello()));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        System.out.println(execute);
        assertThat(execute.result().getObject(String.class)).isEqualTo("no");
    }

    @Test
    void givenTypeExpressionForInputThenCanItUsedForCreateClass() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "getMessage"));

        Map<String, TypedObject> stringTypedObjectMap = new HashMap<>();
        stringTypedObjectMap.put("hello", new TypedObject("$type{com.dongkuk.oasis.executors.KorHello}"));
        List<String> keyOrder = Arrays.asList("hello");
        InputOutputContainer inputOutputContainer = new InputOutputContainer(stringTypedObjectMap, keyOrder);

        PlainJavaServiceTaskExecutable executable =
                plainJavaServiceTaskExecutable(propertyContainer, inputOutputContainer);

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        assertThat(execute.result().getObject(String.class)).isEqualTo("안녕하세요.");
    }

    @Test
    void givenTypeExpressionForInputAndObjectOfItThenUseTheObjectAlreadyCreated() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "getMessage"));

        Map<String, TypedObject> stringTypedObjectMap = new HashMap<>();
        stringTypedObjectMap.put("hello", new TypedObject("$type{com.dongkuk.oasis.executors.KorHello}"));
        List<String> keyOrder = Arrays.asList("hello");
        InputOutputContainer inputOutputContainer = new InputOutputContainer(stringTypedObjectMap, keyOrder);

        PlainJavaServiceTaskExecutable executable =
                plainJavaServiceTaskExecutable(propertyContainer, inputOutputContainer);
        DefaultServiceContext serviceContext = new DefaultServiceContext(new HashMap<>());
        KorHello mock = mock(KorHello.class);
        when(mock.sayHello()).thenReturn("hello");
        serviceContext.setClassToObjectMap(
                new MapBuilder<String, Object>().addEntity(KorHello.class.getName(), mock).build());
        ProcessContext processContext = new DefaultProcessContext(serviceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        assertThat(execute.result().getObject(String.class)).isEqualTo("hello");
    }

    @Test
    void lazyTask() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "getMessage"));

        PlainJavaServiceTaskExecutable executable =
                plainJavaServiceTaskExecutable(propertyContainer);
        DefaultServiceContext serviceContext = new DefaultServiceContext(new HashMap<>());
        SimpleClass mock = mock(SimpleClass.class);
        when(mock.getMessage()).thenReturn("hello");
        serviceContext.setClassToObjectMap(
                new MapBuilder<String, Object>().addEntity(SimpleClass.class.getName(), mock).build());
        ProcessContext processContext = new DefaultProcessContext(serviceContext);
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        assertThat(execute.result().getObject(String.class)).isEqualTo("hello");
    }

    @Test
    void typeExpressedClassUseDataOfInput() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "helloDtoName"));

        Map<String, TypedObject> stringTypedObjectMap = new HashMap<>();
        stringTypedObjectMap.put("name", new TypedObject("Eliza"));
        stringTypedObjectMap.put("helloDto", new TypedObject("$type{com.dongkuk.oasis.executors.HelloDto}"));

        InputOutputContainer inputOutputContainer = new InputOutputContainer(stringTypedObjectMap);

        PlainJavaServiceTaskExecutable executable =
                plainJavaServiceTaskExecutable(propertyContainer, inputOutputContainer);

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        assertThat(execute.result().getObject(String.class)).isEqualTo("Eliza");
    }

    @Test
    @DisplayName("nickName 파라미터 생성 후 " +
            "nickName 파라미터를 생성자로 받는 Name 클래스 생성 후 " +
            "Name 클래스를 생성자로 받는 HelloDto 클래스 생성후 메서드 호출 테스트")
    void typeExpressedClassUseInstanceCreatedFromInputTypeExpression() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "helloDtoName"));

        Map<String, TypedObject> stringTypedObjectMap = new HashMap<>();
        stringTypedObjectMap.put("nickName", new TypedObject("Eliza"));
        stringTypedObjectMap.put("nameSpec", new TypedObject("$type{com.dongkuk.oasis.executors.NickName}"));
        stringTypedObjectMap.put("helloDto", new TypedObject("$type{com.dongkuk.oasis.executors.HelloDto}"));

        List<String> keyOrder = Arrays.asList("nickName", "nameSpec", "helloDto");

        InputOutputContainer inputOutputContainer = new InputOutputContainer(stringTypedObjectMap, keyOrder);

        PlainJavaServiceTaskExecutable executable =
                plainJavaServiceTaskExecutable(propertyContainer, inputOutputContainer);

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = executable.execute(executableContext);
        assertThat(execute.result().getObject(String.class)).isEqualTo("Eliza");
    }

    @Test
    void givenUnpackKeywordExistsInPropertyExpressionThenUnpack() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "data->**data"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        Map<String, Object> build = new MapBuilder<String, Object>()
                .addEntity("name", "kim")
                .addEntity("message", "hello")
                .build();
        processContext.add("data", new TypedObject(build, new TypeReference<Map<String, Object>>() {
        }));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("kimhello");
    }

    @Test
    void givenUnpackKeywordExistsInPropertyExpressionWithoutAliasThenUnpack() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "**data"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        Map<String, Object> build = new MapBuilder<String, Object>()
                .addEntity("name", "kim")
                .addEntity("message", "hello")
                .build();
        processContext.add("data", new TypedObject(build, new TypeReference<Map<String, Object>>() {
        }));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("kimhello");
    }

    @Test
    void givenUnpackKeywordExistsInPropertyExpressionThenUnpackAndIfNotInputOnlyFindContext()
            throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "data->**data"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        Map<String, Object> build = new MapBuilder<String, Object>()
                .addEntity("name", "kim")
                .addEntity("message", "hello")
                .build();
        processContext.add("data", new TypedObject(build, new TypeReference<Map<String, Object>>() {
        }));
        processContext.add("nickname", new TypedObject("park"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("parkkimhello");
    }

    @Test
    void givenUnpackKeywordExistsInPropertyExpressionThenUnpackAndIfInputOnlyDoNotFindContext()
            throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "data->**data"));
        propertyContainer.add(new Property("inputOnly", "true"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        Map<String, Object> build = new MapBuilder<String, Object>()
                .addEntity("name", "kim")
                .addEntity("message", "hello")
                .build();
        processContext.add("data", new TypedObject(build, new TypeReference<Map<String, Object>>() {
        }));
        processContext.add("nickname", new TypedObject("park"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("kimhello");
    }

    @Test
    void givenUnpackKeywordExistsInPropertyExpressionButNotMatchKeyOrTypeThenIgnore()
            throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "data->**data"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("data", new TypedObject(Arrays.asList("kim", "hello"),
                new TypeReference<List<String>>() {
                }));
        processContext.add("name", new TypedObject("park"));
        processContext.add("message", new TypedObject("hello"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("parkhello");
    }

    @Test
    void givenUnpackKeywordExistsInPropertyExpressionUsingList()
            throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "data[0]->**data"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        Map<String, Object> build = new MapBuilder<String, Object>()
                .addEntity("name", "kim")
                .addEntity("message", "hello")
                .build();
        processContext.add("data", new TypedObject(Collections.singletonList(build),
                new TypeReference<List<Map<String, Object>>>() {
                }));
        processContext.add("nickname", new TypedObject("park"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("parkkimhello");
    }

    @Test
    void givenUnpackKeywordExistsInPropertyExpressionUsingListInputOnly()
            throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "data[0]->**data"));
        propertyContainer.add(new Property("inputOnly", "true"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        Map<String, Object> build = new MapBuilder<String, Object>()
                .addEntity("name", "kim")
                .addEntity("message", "hello")
                .build();
        processContext.add("data", new TypedObject(Collections.singletonList(build),
                new TypeReference<List<Map<String, Object>>>() {
                }));
        processContext.add("nickname", new TypedObject("park"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("kimhello");
    }

    @Test
    void givenUnpackKeywordOnPlainObjectThenFindGetterAndUse() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("input", "data->**data"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));

        processContext.add("data", new TypedObject(new NameMessageDto("kim", "hello"),
                new TypeReference<NameMessageDto>() {
                }));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("kimhello");
    }

    @Test
    void shouldUseObjectFromApplicationContext() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "getName"));
        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Name");
        Map<String, TypedObject> stringTypedObjectHashMap = new HashMap<>();
        stringTypedObjectHashMap.put("~~~~~~",
                new TypedObject(new Name("ApplicationContextName")));
        DefaultApplicationContext defaultApplicationContext = new DefaultApplicationContext(stringTypedObjectHashMap);
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext();
        defaultServiceContext.setApplicationContext(defaultApplicationContext);
        ProcessContext processContext = new DefaultProcessContext(defaultServiceContext);

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("ApplicationContextName");
    }

    @Test
    void givenBindingParameterNameOptionalThenSkipBindingSource() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("opt", "message"));

        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));

        processContext.add("name", new TypedObject("name1"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("name1null");
    }

    @Test
    void givenBindingParameterNameOptionalThenSkipBindingSource2() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        propertyContainer.add(new Property("opt", "message"));

        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.Unpack");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));

        processContext.add("name", new TypedObject("name1"));
        processContext.add("nickname", new TypedObject("nickname1"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        ExecutionResult execute = plainJavaServiceTaskExecutable.execute(executableContext);
        assertThat(execute.result().getObject()).isEqualTo("nickname1name1null");
    }

    /**
     * If a plain type value is in the context and the method parameter matches the type, it is not bound.
     */
    @Test
    void givenPlainTypeBindingParameterMatchingNameAndTypeThenThrowException() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "f"));

        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.BiFunctionClass");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));

        processContext.add("name", new TypedObject("name1"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> plainJavaServiceTaskExecutable.execute(executableContext));
    }

    @Test
    void givenMethodBindingFailureThenExposeBindingDiagnostics() throws ClassNotFoundException {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "f"));

        PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable
                = plainJavaServiceTaskExecutable(propertyContainer,
                new InputOutputContainer(),
                "com.dongkuk.oasis.executors.BiFunctionClass");

        ProcessContext processContext = new DefaultProcessContext(new DefaultServiceContext(new HashMap<>()));
        processContext.add("name", new TypedObject("name1"));

        ExecutableContext executableContext = new DefaultExecutableContext(processContext);
        assertThatExceptionOfType(MethodNotFoundException.class)
                .isThrownBy(() -> plainJavaServiceTaskExecutable.execute(executableContext))
                .withMessageContaining("No suitable method. : Class[com.dongkuk.oasis.executors.BiFunctionClass], Method[f]")
                .withMessageContaining("Context diagnostics:")
                .withMessageContaining("Task inputs: []")
                .withMessageContaining("Visible process/service keys: [name=java.lang.String]")
                .withMessageContaining("Candidate diagnostics:")
                .withMessageContaining("Parameter [message : java.lang.String] was not bound.");
    }

    @Test
    void optionalPropertyShouldBeAccepted() {
        assertThat(getPlainJavaServiceTaskExecutable().canAcceptProperty("opt")).isTrue();
    }

    private PlainJavaServiceTaskExecutable getPlainJavaServiceTaskExecutable() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("method", "hello"));
        return plainJavaServiceTaskExecutable(propertyContainer);
    }

    private PlainJavaServiceTaskExecutable getPlainJavaServiceTaskExecutable(PropertyContainer propertyContainer) {
        return plainJavaServiceTaskExecutable(propertyContainer);
    }

    private PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable(PropertyContainer propertyContainer) {
        return plainJavaServiceTaskExecutable(propertyContainer, new InputOutputContainer());
    }

    private PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable(
            PropertyContainer propertyContainer, InputOutputContainer inputOutputContainer) {
        return new PlainJavaServiceTaskExecutable(
                SimpleClass.class,
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        "com.dongkuk.oasis.executors.SimpleClass",
                        propertyContainer,
                        inputOutputContainer,
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                null
        );
    }

    private PlainJavaServiceTaskExecutable plainJavaServiceTaskExecutable(
            PropertyContainer propertyContainer, InputOutputContainer inputOutputContainer, String className)
            throws ClassNotFoundException {
        return new PlainJavaServiceTaskExecutable(
                Class.forName(className),
                new JavaServiceTask("t1",
                        "t1",
                        null,
                        null,
                        mock(SequentialFlow.class),
                        className,
                        propertyContainer,
                        inputOutputContainer,
                        new InputOutputContainer(),
                        MultiInstance.nonMultiInstance()),
                null
        );
    }
}
