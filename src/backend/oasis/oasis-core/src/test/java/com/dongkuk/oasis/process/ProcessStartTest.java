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
import com.dongkuk.oasis.model.flow.*;
import com.dongkuk.oasis.model.flow.nodes.*;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;

/**
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
class ProcessStartTest {
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @Test
    void processStartUsage() {
        Service service = getService("/process/ProcessStartTest/normal.bpmn");

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );

        processStarter.start(process, processContext);
    }

    @Test
    void singleTaskProcess() {
        Service service = getService("/process/ProcessStartTest/singleTask.bpmn");

        Process process = service.getInitialProcess();
        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(new EmptyApplicationContext(), new HashMap<>(0))
        );

        processStarter.start(process, processContext);
    }

    static class TestFlowPicker implements FlowPicker {
        @Override
        public Flow pick(ComplexFlowNode node, TypedObject typedObject) {
            SequentialFlow sequentialFlow = node.sequenceFlow();
            if (sequentialFlow != null)
                return sequentialFlow;
            ArrayList<ConditionalFlow> conditionalFlows = new ArrayList<>(node.conditionalFlows());
            return conditionalFlows.get(0);
        }

        @Override
        public Flow pick(SequentialFlowNode node, TypedObject typedObject) {
            return node.sequenceFlow();
        }

        @Override
        public Flow pick(ConditionalFlowNode node, TypedObject typedObject) {
            ArrayList<ConditionalFlow> conditionalFlows = new ArrayList<>(node.conditionalFlows());
            return conditionalFlows.get(0);
        }

        @Override
        public TerminalFlow pick(NonFlowNode node, TypedObject typedObject) {
            return new DefaultTerminalFlow();
        }
    }

    static class StartEventTestFlowPicker extends TestFlowPicker {
        @Override
        public Flow pick(SequentialFlowNode node, TypedObject typedObject) {
            return node.sequenceFlow();
        }
    }
}