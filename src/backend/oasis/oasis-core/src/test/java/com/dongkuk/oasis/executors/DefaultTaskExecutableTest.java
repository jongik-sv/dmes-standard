package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.activity.DefaultTask;
import com.dongkuk.oasis.model.flow.DefaultSequentialFlow;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-07-08
 */
class DefaultTaskExecutableTest {
    @Test
    void basicFeature() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("input", "yourResult"));
        DefaultTaskExecutable executable = buildTaskExecutable(propertyContainer);

        ProcessContext processContext = buildProcessContext();

        List<Map<String, Object>> listMap = new ArrayList<>();
        listMap.add(new MapBuilder<String, Object>().addEntity("id", 1).addEntity("name", "myName").build());
        listMap.add(new MapBuilder<String, Object>().addEntity("id", 2).addEntity("name", "yourName").build());

        processContext.add("yourResult", new TypedObject(
                listMap, new TypeReference<List<Map<String, Object>>>() {
        }
        ));

        ExecutableContext executableContext = new DefaultExecutableContext(
                processContext
        );

        ExecutionResult execute = executable.execute(executableContext);
        TypedObject result = execute.result();
        List<Map<String, Object>> object
                = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });

        assertThat(object).hasSize(2);
    }

    @Test
    void indexAccess() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("input", "yourResult[0]"));
        DefaultTaskExecutable executable = buildTaskExecutable(propertyContainer);

        ProcessContext processContext = buildProcessContext();

        List<Map<String, Object>> listMap = new ArrayList<>();
        listMap.add(new MapBuilder<String, Object>().addEntity("id", 1).addEntity("name", "myName").build());
        listMap.add(new MapBuilder<String, Object>().addEntity("id", 2).addEntity("name", "yourName").build());

        processContext.add("yourResult", new TypedObject(
                listMap, new TypeReference<List<Map<String, Object>>>() {
        }
        ));

        ExecutableContext executableContext = new DefaultExecutableContext(
                processContext
        );

        ExecutionResult execute = executable.execute(executableContext);
        TypedObject result = execute.result();
        Map<String, Object> object
                = result.getObject(new TypeReference<Map<String, Object>>() {
        });

        assertThat(object.get("id")).isEqualTo(1);
    }

    @Test
    void keyAccess() {
        PropertyContainer propertyContainer = new PropertyContainer();
        propertyContainer.add(new Property("input", "yourResult[0]['name']"));
        DefaultTaskExecutable executable = buildTaskExecutable(propertyContainer);

        ProcessContext processContext = buildProcessContext();

        List<Map<String, Object>> listMap = new ArrayList<>();
        listMap.add(new MapBuilder<String, Object>().addEntity("id", 1).addEntity("name", "myName").build());
        listMap.add(new MapBuilder<String, Object>().addEntity("id", 2).addEntity("name", "yourName").build());

        processContext.add("yourResult", new TypedObject(
                listMap, new TypeReference<List<Map<String, Object>>>() {
        }
        ));

        ExecutableContext executableContext = new DefaultExecutableContext(
                processContext
        );

        ExecutionResult execute = executable.execute(executableContext);
        TypedObject result = execute.result();
        Object object = result.getObject();

        assertThat(object).isEqualTo("myName");
    }

    private ProcessContext buildProcessContext() {
        return new DefaultProcessContext(
                new DefaultServiceContext(
                        new DefaultApplicationContext()
                )
        );
    }

    private DefaultTaskExecutable buildTaskExecutable(PropertyContainer propertyContainer) {
        return new DefaultTaskExecutable(
                new DefaultTask("a",
                        "a",
                        null,
                        null,
                        new DefaultSequentialFlow("1", "1", "a", "b", new PropertyContainer()),
                        propertyContainer
                        , null,
                        null,
                        MultiInstance.nonMultiInstance()));
    }
}