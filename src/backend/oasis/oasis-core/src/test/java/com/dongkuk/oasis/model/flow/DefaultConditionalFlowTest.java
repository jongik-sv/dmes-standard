package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.StringExpressionCondition;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-02-05
 */
class DefaultConditionalFlowTest {
    @Test
    void givenFlowNameNullThenNameIsSetAsId() {
        DefaultConditionalFlow flow = new DefaultConditionalFlow(
                "1",
                null,
                "3",
                "4",
                new StringExpressionCondition("hey"),
                new PropertyContainer());
        assertThat(flow.getName()).isEqualTo(flow.getId());
    }

    @SuppressWarnings("ConstantConditions")
    @Test
    void nullCheck() {
        Assertions.assertThatIllegalArgumentException().isThrownBy(() ->
                new DefaultConditionalFlow(null, "2", "3", "4", new StringExpressionCondition("hey"),
                        new PropertyContainer()));
        Assertions.assertThatIllegalArgumentException().isThrownBy(() ->
                new DefaultConditionalFlow("1", "2", null, "4", new StringExpressionCondition("hey"),
                        new PropertyContainer()));
        Assertions.assertThatIllegalArgumentException().isThrownBy(() ->
                new DefaultConditionalFlow("1", "2", "3", null, new StringExpressionCondition("hey"),
                        new PropertyContainer()));
        Assertions.assertThatIllegalArgumentException().isThrownBy(() ->
                new DefaultConditionalFlow("1", "2", "3", "4", null,
                        new PropertyContainer()));
    }

    @Test
    void using() {
        DefaultConditionalFlow flow = new DefaultConditionalFlow(
                "1",
                null,
                "3",
                "4",
                new StringExpressionCondition("hey"),
                new PropertyContainer());
        String condition = (String) flow.condition().conditionExpression();
        System.out.println(condition);

    }
}