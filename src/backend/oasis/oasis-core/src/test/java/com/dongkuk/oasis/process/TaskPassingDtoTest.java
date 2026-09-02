package com.dongkuk.oasis.process;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.EmptyApplicationContext;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.service.ServiceFindableProcessContext;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
class TaskPassingDtoTest {
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @Test
    void taskStartUsage() {
        Service service = getService("/process/TaskPassingDtoTest/taskGenerateDto.bpmn");
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext(),
                new TypedMapBuilder().addEntity("name", "jj").build());

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );
        processContext.add("age", new TypedObject(13));

        ServiceFindableProcessContext serviceFindableProcessContext
                = new ServiceFindableProcessContext(processContext, serviceId -> null);

        processStarter.start(process, serviceFindableProcessContext);
    }

    @Test
    void taskStartUsageDoubleDtos() {
        Service service = getService("/process/TaskPassingDtoTest/taskGenerateDoubleDto.bpmn");
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(new EmptyApplicationContext(),
                new TypedMapBuilder().addEntity("name", "jj").build());

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );
        processContext.add("age", new TypedObject(13));

        ServiceFindableProcessContext serviceFindableProcessContext
                = new ServiceFindableProcessContext(processContext, serviceId -> null);

        processStarter.start(process, serviceFindableProcessContext);
        TypedObject out = serviceFindableProcessContext.get("out");
        Assertions.assertThat(out.getObject()).isEqualTo("13jj");
    }

    public static class NameDto {
        private String name;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }
    }

    public static class MyDto {
        private String name;
        private int age;

        public int getAge() {
            return age;
        }

        public void setAge(int age) {
            this.age = age;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }
    }
}