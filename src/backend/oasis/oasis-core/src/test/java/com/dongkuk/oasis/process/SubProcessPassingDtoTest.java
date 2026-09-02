package com.dongkuk.oasis.process;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.service.ServiceFindableProcessContext;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
class SubProcessPassingDtoTest {
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @Test
    void inlineSubProcess_converting_to_dto() {
        Service service = getService("/process/SubProcessPassingDtoTest/inlineGenerateDto.bpmn");
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

        Map<String, TypedObject> stringTypedObjectMap = serviceFindableProcessContext.elementOutputs();

        SubProcessResult result = stringTypedObjectMap.get("result").getObject(SubProcessResult.class);
        MyDto out = (MyDto) result.get("MyDto");
        Assertions.assertThat(out).isNotNull();
        Assertions.assertThat(out.getName()).isEqualTo("jj");
    }

    @Test
    void offlineSubProcess_converting_to_dto() {
        Service service = getService("/process/SubProcessPassingDtoTest/offlineGenerateDto.bpmn");
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

        Map<String, TypedObject> stringTypedObjectMap = serviceFindableProcessContext.elementOutputs();

        SubProcessResult result = stringTypedObjectMap.get("rrr").getObject(SubProcessResult.class);
        MyDto out = (MyDto) result.get("MyDto");
        Assertions.assertThat(out).isNotNull();
        Assertions.assertThat(out.getName()).isEqualTo("jj");
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