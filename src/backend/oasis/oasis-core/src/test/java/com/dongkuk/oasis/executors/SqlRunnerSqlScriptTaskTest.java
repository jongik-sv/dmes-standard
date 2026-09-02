package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultExecutableContext;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.execution.ElementExecutor;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.activity.SqlScriptTask;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

import static com.dongkuk.oasis.model.PropertyNames.*;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-06-15
 */
class SqlRunnerSqlScriptTaskTest {
    ElementExecutor elementExecutor =
            new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver()).generateElementExecutor();
    DefaultApplicationContext applicationContext = new DefaultApplicationContext();

    @Test
    void basicCall() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        applicationContext.put("sqlRunner", new TypedObject(new SqlRunner() {
            @Override
            public TypedObject run(Map<String, Object> param, DataSource dataSource, String sqlId) {
                return new TypedObject("test");
            }
        }));
        applicationContext.put("ds1", new TypedObject(new DummyDataSource()));

        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        String result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        null,
                                        "idid",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(String.class);

        Assertions.assertThat(result1).isEqualTo("test");
    }

    private SqlScriptTask getSqlScriptTask(
            String sql,
            String sqlId,
            String dataSourceName,
            String transactionManagerName,
            String[] inputKeys,
            String outputKey,
            InputOutputContainer inputs,
            InputOutputContainer outputs) {

        PropertyContainer propertyContainer = new PropertyContainer();
        if (dataSourceName != null)
            propertyContainer.add(new Property(DATA_SOURCE, dataSourceName));
        if (transactionManagerName != null)
            propertyContainer.add(new Property(TRANSACTION_MANAGER_NAME, transactionManagerName));
        if (inputKeys != null) {
            String join = String.join(", ", inputKeys);
            Property property = new Property(INPUT_KEY, join);
            propertyContainer.add(property);
        }
        if (outputKey != null) {
            propertyContainer.add(new Property(OUTPUT_KEY, outputKey));
        }

        return new SqlScriptTask("t1",
                "t1",
                null,
                null,
                mock(SequentialFlow.class),
                sql,
                sqlId,
                propertyContainer,
                inputs,
                outputs,
                MultiInstance.nonMultiInstance());
    }
}