package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.StringExpressionCondition;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.IdentifiableDefaultFlow;
import net.datafaker.Faker;

import java.util.Locale;

/**
 * @author Jeongjin Kim
 * @since 2021-04-06
 */
public class FakeFlowFactory {
    static Faker faker = new Faker(Locale.ENGLISH);

    public static ConditionalFlow conditionalFlow(String conditionExpression) {
        return new DefaultConditionalFlow(
                faker.random().hex(8),
                faker.animal().name(),
                faker.random().nextInt(0, 1000).toString(),
                faker.random().nextInt(0, 1000).toString(),
                new StringExpressionCondition(conditionExpression),
                new PropertyContainer());
    }

    public static DefaultFlow defaultFlow() {
        return new IdentifiableDefaultFlow(
                faker.random().hex(8),
                faker.animal().name(),
                faker.random().nextInt(0, 1000).toString(),
                faker.random().nextInt(0, 1000).toString(),
                new PropertyContainer()
        );
    }
}
