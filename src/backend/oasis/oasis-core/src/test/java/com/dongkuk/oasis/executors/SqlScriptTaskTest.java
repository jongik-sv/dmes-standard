package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultExecutableContext;
import com.dongkuk.oasis.context.DefaultProcessContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.execution.ElementExecutor;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.activity.SqlScriptTask;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionManagerInfoHolder;
import com.dongkuk.oasis.utils.MapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.lang.reflect.Type;
import java.sql.SQLException;
import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.*;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-06-15
 */
class SqlScriptTaskTest {
    EmbeddedDatabase database;
    DataSource dataSource1;
    SpringTransactionHandler transactionHandler;
    DefaultApplicationContext applicationContext;
    Type type = new TypeReference<Map<String, TypedObject>>() {
    }.getType();
    ElementExecutor elementExecutor;

    @BeforeEach
    void setup() throws SQLException {
        applicationContext = new DefaultApplicationContext();
        database = database();

        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, null)
        );
        applicationContext.put("ds1", new TypedObject(dataSource1));
        applicationContext.put("txm", new TypedObject(transactionHandler));

        elementExecutor = new ProcessStaterAndElementExecutorFactory(new NonModifyClassNameResolver()).generateElementExecutor();
    }

    private EmbeddedDatabase database() {
        EmbeddedDatabase dataSource;
        dataSource = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .setScriptEncoding("UTF-8")
                .ignoreFailedDrops(true)
                .addScript("task/SqlScriptTaskTest/initData.sql")
                .build();
        return dataSource;
    }

    private SpringTransactionHandler transactionHandler(TransactionManagerInfoHolder... transactionManagerInfoHolders) {
        for (TransactionManagerInfoHolder transactionManagerInfoHolder : transactionManagerInfoHolders) {
            PlatformTransactionManager tm =
                    new DataSourceTransactionManager(transactionManagerInfoHolder.getDataSource());

            this.applicationContext.put(transactionManagerInfoHolder.getTransactionManagerName(), new TypedObject(tm));
        }

        return new SpringTransactionHandler(applicationContext, Arrays.stream(transactionManagerInfoHolders)
                .map(TransactionManagerInfoHolder::getTransactionManagerName).toArray(String[]::new));
    }

    @Test
    void basicCall() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(3);

        List<Map<String, Object>> result2 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from USERS",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result2).hasSize(3);
    }

    @Test
    void givenResultTypeThenTryConvert() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);
        ExecutionResult ds1 = elementExecutor.execute(getSqlScriptTask(
                        String.format("/* resultType=%s */select * from users", UserDto.class.getName()),
                        "ds1",
                        null,
                        null,
                        null,
                        null,
                        null)
                , defaultExecutableNodeContext);
        List<Object> result1 = ds1.result().getObject(new TypeReference<List<Object>>() {
        });
        Assertions.assertThat(result1).hasSize(3);
    }

    @Test
    void parameterBindingWithInputContainer() {
        InputOutputContainer inputContainer = new InputOutputContainer(
                new MapBuilder<String, TypedObject>().addEntity("id", new TypedObject(1)).build()
        );

        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users where id = :id",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        inputContainer,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void parameterBindingWithPlainObject() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        defaultProcessContext.add("result", new TypedObject(new PlainDto(0)));
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users where id = :id",
                                        "ds1",
                                        null,
                                        new String[]{"result"},
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void parameterBindingWithListObject() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);

        List<Integer> list = new ArrayList<>();
        list.add(0);

        defaultProcessContext.add("id", new TypedObject(list, new TypeReference<List<Integer>>() {
        }));

        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users where id = :id",
                                        "ds1",
                                        null,
                                        new String[]{"id"},
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void parameterBindingWithMultiMapObject() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);

        Map<String, Object> data = new MapBuilder<String, Object>()
                .addEntity("id", 0)
                .build();
        Map<String, Object> data2 = new MapBuilder<String, Object>()
                .addEntity("lastName", "kim")
                .build();

        defaultProcessContext.add("data", new TypedObject(data, new TypeReference<Map<String, Object>>() {
        }));
        defaultProcessContext.add("data2", new TypedObject(data2, new TypeReference<Map<String, Object>>() {
        }));

        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users where id = :id and lastName = :lastName",
                                        "ds1",
                                        null,
                                        new String[]{"data", "data2"},
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void parameterBindingWithDataObject() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);

        defaultProcessContext.add("age", new TypedObject(20));
        defaultProcessContext.add("lastName", new TypedObject("kim"));

        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from history where lastName = :lastName and age >= :age",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void givenInputOnlyOneMapThenBindWithIt() {
        InputOutputContainer inputContainer = new InputOutputContainer(
                new MapBuilder<String, TypedObject>().addEntity(
                        "param",
                        new TypedObject(new MapBuilder<String, Object>()
                                .addEntity("id", "1").build(), this.type)
                ).build()
        );

        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users where id = :id",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        inputContainer,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void givenInputMoreThenOneMapThenBindUpperInputContainer() {
        InputOutputContainer inputContainer = new InputOutputContainer(
                new MapBuilder<String, TypedObject>()
                        .addEntity(
                                "param",
                                new TypedObject(new MapBuilder<String, TypedObject>()
                                        .addEntity("id", new TypedObject("1")).build()
                                        , this.type
                                )
                        )
                        .addEntity(
                                "param2",
                                new TypedObject(
                                        new MapBuilder<String, TypedObject>()
                                                .addEntity("id", new TypedObject("1")).build()
                                        , this.type
                                )
                        )
                        .build()
        );

        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        Assertions.assertThatExceptionOfType(RuntimeException.class).isThrownBy(() ->
                elementExecutor.execute(getSqlScriptTask(
                                "select * from users where id = :id",
                                "ds1",
                                null,
                                null,
                                null,
                                inputContainer,
                                null)
                        , defaultExecutableNodeContext)
        );
    }

    @Test
    void givenInputMultiConditionThenBindWithIt() {
        InputOutputContainer inputContainer = new InputOutputContainer(
                new MapBuilder<String, TypedObject>()
                        .addEntity("lastName", new TypedObject("kim"))
                        .addEntity("id", new TypedObject("0"))
                        .build()
        );

        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from members where id = :id and lastName = :lastName",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        inputContainer,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void givenNumberParamForStringFieldThenBind() {
        InputOutputContainer inputContainer = new InputOutputContainer(
                new MapBuilder<String, TypedObject>()
                        .addEntity("lastName", new TypedObject("kim"))
                        .addEntity("id", new TypedObject(0))
                        .build()
        );

        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from members where id = :id and lastName = :lastName",
                                        "ds1",
                                        null,
                                        null,
                                        null,
                                        inputContainer,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void parameterBindingMapUsingPropertyExpression() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);

        Map<String, Object> data = new MapBuilder<String, Object>()
                .addEntity("id", 0)
                .addEntity("name", "kim")
                .build();

        defaultProcessContext.add("data", new TypedObject(data, new TypeReference<Map<String, Object>>() {
        }));

        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users where id = :id and lastName = :lastName",
                                        "ds1",
                                        null,
                                        new String[]{"data['id'] -> id, data['name'] -> lastName"},
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    @Test
    void parameterBindingListMapUsingPropertyExpression() {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext, new HashMap<>(0));
        DefaultProcessContext defaultProcessContext = new DefaultProcessContext(defaultServiceContext);
        List<Map<String, Object>> listMap = new ArrayList<>();
        Map<String, Object> data = new MapBuilder<String, Object>()
                .addEntity("id", 0)
                .addEntity("name", "kim")
                .build();
        listMap.add(data);

        defaultProcessContext.add("data", new TypedObject(listMap, new TypeReference<List<Map<String, Object>>>() {
        }));

        DefaultExecutableContext defaultExecutableNodeContext = new DefaultExecutableContext(defaultProcessContext);

        List<Map<String, Object>> result1 =
                elementExecutor.execute(getSqlScriptTask(
                                        "select * from users where id = :id and lastName = :lastName",
                                        "ds1",
                                        null,
                                        new String[]{"data[0]['id'] -> id, data[0]['name'] -> lastName"},
                                        null,
                                        null,
                                        null)
                                , defaultExecutableNodeContext)
                        .result().getObject(new TypeReference<List<Map<String, Object>>>() {
                        });

        Assertions.assertThat(result1).hasSize(1);
    }

    private SqlScriptTask getSqlScriptTask(
            String sql,
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
                null,
                propertyContainer,
                inputs,
                outputs,
                MultiInstance.nonMultiInstance());
    }

    static class PlainDto {
        private final Integer id;

        public PlainDto(Integer id) {
            this.id = id;
        }

        public Integer getId() {
            return id;
        }
    }

    static class UserDto {
        private Integer id;
        private String firstName;
        private String lastName;

        public Integer getId() {
            return id;
        }

        public void setId(Integer id) {
            this.id = id;
        }

        public String getFirstName() {
            return firstName;
        }

        public void setFirstName(String firstName) {
            this.firstName = firstName;
        }

        public String getLastName() {
            return lastName;
        }

        public void setLastName(String lastName) {
            this.lastName = lastName;
        }
    }
}