package learning;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.WowContext;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.model.flow.Flow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.model.flow.TerminalFlow;
import com.dongkuk.oasis.model.flow.nodes.*;
import com.dongkuk.oasis.wow.Wow;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/**
 * @author Jeongjin Kim
 * @since 2021-02-05
 */
@SuppressWarnings("unused")
public class Visitor {
    @Test
    void visit() {
        class TestWow implements Wow {
            @Override
            public TypedObject run(WowContext wowContext) {
                return null;
            }
        }

        JavaServiceTask serviceTask = new JavaServiceTask(
                "1", "2", null, null,
                Mockito.mock(SequentialFlow.class), "null",
                null, null, null, MultiInstance.nonMultiInstance());
        FlowPicker picker = new AFlowPicker();
        serviceTask.pick(picker, null);
    }

    static public class AFlowPicker implements FlowPicker {
        @Override
        public Flow pick(ComplexFlowNode node, TypedObject typedObject) {
            System.out.println(node);
            return null;
        }

        @Override
        public Flow pick(SequentialFlowNode node, TypedObject typedObject) {
            System.out.println(node);
            return null;
        }

        @Override
        public Flow pick(ConditionalFlowNode node, TypedObject typedObject) {
            System.out.println(node);
            return null;
        }

        @Override
        public TerminalFlow pick(NonFlowNode node, TypedObject typedObject) {
            System.out.println(node);
            return null;
        }
    }
}
