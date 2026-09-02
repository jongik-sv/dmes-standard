package com.dongkuk.oasis.process;

import com.dongkuk.oasis.BpmnServiceLoaderForTest;
import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.PathElement;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.service.PlainServiceResult;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.NoSuchElementException;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-04-05
 */
class CoreProcessStarterTest {
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @Test
    void givenInputKeysSetThenSetInputKeysIntoExecutableNodeContext() {
        Service service = getService("/process/CoreProcessStarterTest/inputKeys.bpmn");
        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );
        processContext.add("param1", new TypedObject("param1Data"));
        processContext.add("param2", new TypedObject("param2Data"));

        processStarter.start(process, processContext);

        assertThat(processContext.elementOutput("result").getObject()).isEqualTo("returnParam1Method param1, param2");
        assertThat(processContext.elementOutput("result2").getObject()).isEqualTo("returnParam1Method param1, param2");
        assertThat(processContext.elementOutput("result3").getObject()).isEqualTo("returnParam1Method param1, param2");
        assertThat(processContext.elementOutput("result4").getObject()).isEqualTo("returnParam1Method param1, param2");
        assertThat(processContext.elementOutput("result5").getObject()).isEqualTo("returnParam1Method param1");
    }

    @Test
    void runInlineSubProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/inlineSubProcess.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("inlineSubProcess",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(6);
        assertThat(path.get(1).getId()).isEqualTo("Activity_0vc166z");
        assertThat(path.get(3).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(5).getId()).isEqualTo("Event_1k6nf3k");
    }

    @Test
    void runInlineSubProcessBranching() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/inlineSubProcessBranching.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("inlineSubProcessBranching",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(6);
        assertThat(path.get(1).getId()).isEqualTo("Activity_0vc166z");
        assertThat(path.get(3).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(5).getId()).isEqualTo("Event_0p8244w");
    }

    @Test
    void runOfflineSubProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcess.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("offlineSubProcess",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(6);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1vwrt1c");
        assertThat(path.get(3).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(5).getId()).isEqualTo("Event_1k6nf3k");
    }

    @Test
    void runOfflineSubProcessBranching() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcessBranching.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("offlineSubProcessBranching",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(6);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1vwrt1c");
        assertThat(path.get(3).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(5).getId()).isEqualTo("Event_0pxl8ht");
    }

    @Test
    void runOfflineSubProcessBranching2() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcessBranching2.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("offlineSubProcessBranching2",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(10);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1vwrt1c");
        assertThat(path.get(3).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(5).getId()).isEqualTo("Activity_16f2qxm");
        assertThat(path.get(7).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(9).getId()).isEqualTo("Event_1i22hb2");
    }

    @Test
    void runOfflineSubProcessOfSubProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcessOfSubProcessBranching.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("offlineSubProcessOfSubProcessBranching",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(9);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1vwrt1c");
        assertThat(path.get(3).getId()).isEqualTo("Activity_0azev7h");
        assertThat(path.get(5).getId()).isEqualTo("Activity_0j1l8pa");
        assertThat(path.get(7).getId()).isEqualTo("Event_1whpsh3");
        assertThat(path.get(8).getId()).isEqualTo("Event_1k6nf3k");
    }

    @Test
    void givenFindInnerSubProcessThenThrowException() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/findInnerOfflineSubProcess.bpmn");
        ServiceResult offlineSubProcessOfSubProcessBranching = serviceStarter.start("offlineSubProcessOfSubProcessBranching",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        Assertions.assertThat(offlineSubProcessOfSubProcessBranching.exception()).isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void passingProcessParameterThenCanUseSubProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcessPassingParam.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("offlineSubProcessPassingParam",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        PlainServiceResult plainServiceResult = new PlainServiceResult(inlineSubProcess);
        System.out.println(plainServiceResult.toJson());
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(7);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1qt8ddo");
        assertThat(path.get(3).getId()).isEqualTo("Event_1n2hcay");
        assertThat(path.get(5).getId()).isEqualTo("Event_070vc1p");
        assertThat(path.get(6).getId()).isEqualTo("Event_1k6nf3k");
    }

    @Test
    void passingProcessParameterThenCanUseSingleTaskSubProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSingleTaskSubProcessPassingParam.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("offlineSubProcessPassingParam",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        PlainServiceResult plainServiceResult = new PlainServiceResult(inlineSubProcess);
        System.out.println(plainServiceResult.toJson());
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(5);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1qt8ddo");
        assertThat(path.get(3).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(4).getId()).isEqualTo("Event_1k6nf3k");
    }

    @Test
    void passingProcessParameterInlineThenCanUseSubProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/inlineSubProcessPassingParam.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("inlineSubProcessPassingParam",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        PlainServiceResult plainServiceResult = new PlainServiceResult(inlineSubProcess);
        System.out.println(plainServiceResult.toJson());
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(7);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1442y7w");
        assertThat(path.get(3).getId()).isEqualTo("Event_1n2hcay");
        assertThat(path.get(5).getId()).isEqualTo("Event_070vc1p");
        assertThat(path.get(6).getId()).isEqualTo("Event_1k6nf3k");
    }

    @Test
    void passingProcessParameterIterableOfflineThenCanUseSubProcessInLoop() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcessLoop.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("offlineSubProcessLoop",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        PlainServiceResult plainServiceResult = new PlainServiceResult(inlineSubProcess);
        System.out.println(plainServiceResult.toJson());
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(17);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1hvo441");
        assertThat(path.get(3).getId()).isEqualTo("Activity_1vwrt1c");
        assertThat(path.get(5).getId()).isEqualTo("Activity_1mt6jie");
        assertThat(path.get(6).getId()).isEqualTo("Event_070vc1p");
    }

    @Test
    void passingProcessParameterIterableInlineThenCanUseSubProcessInLoop() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/inlineSubProcessLoop.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("inlineSubProcessLoop",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        PlainServiceResult plainServiceResult = new PlainServiceResult(inlineSubProcess);
        System.out.println(plainServiceResult.toJson());
        List<PathElement> path = inlineSubProcess.path();
        assertThat(path).hasSize(16);
        assertThat(path.get(1).getId()).isEqualTo("Activity_1hvo441");
        assertThat(path.get(3).getId()).isEqualTo("Event_1n2hcay");
        assertThat(path.get(5).getId()).isEqualTo("Event_070vc1p");
        assertThat(path.get(6).getId()).isEqualTo("Event_1n2hcay");
    }

    @Test
    void pullingProcessParameterFromParentProcess() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcessPassingInputs.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("pullProcessParameter",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        PlainServiceResult plainServiceResult = new PlainServiceResult(inlineSubProcess);
        System.out.println(plainServiceResult.toJson());
        Assertions.assertThat(plainServiceResult.getResults().get("subProcessResult").getObject(
                SubProcessResult.class
        ).get("fullName")).isEqualTo("JeongjinKim");
        Assertions.assertThat(plainServiceResult.getExceptionMessage()).isNull();
    }

    @Test
    void calleeSubProcessCannotHaveOutputProperty() {
        ServiceStarter serviceStarter = BpmnServiceLoaderForTest.getServiceStarter("/process/CoreProcessStarterTest/offlineSubProcessWrongProperty.bpmn");
        ServiceResult inlineSubProcess = serviceStarter.start("pullProcessParameter",
                new DefaultServiceContext(new DefaultApplicationContext(new HashMap<>()), new HashMap<>(0)));

        PlainServiceResult plainServiceResult = new PlainServiceResult(inlineSubProcess);
        Assertions.assertThat(plainServiceResult.getExceptionMessage()).isNotNull();
        Assertions.assertThat(plainServiceResult.getExceptionMessage()).isEqualTo("[output] is an unavailable attribute. element [subPro](이름넣어주세요)");
    }
}