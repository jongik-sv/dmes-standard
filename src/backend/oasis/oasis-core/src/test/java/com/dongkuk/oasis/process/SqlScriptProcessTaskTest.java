package com.dongkuk.oasis.process;

import com.dongkuk.oasis.NonModifyClassNameResolver;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.factories.ProcessStaterAndElementExecutorFactory;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.utils.MapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import utils.OracleTestDatabase;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getService;

/**
 * @author Jeongjin Kim
 * @since 2021-06-09
 */
@Execution(ExecutionMode.SAME_THREAD)
class SqlScriptProcessTaskTest {
    DataSource database;
    DataSource dataSource1;
    ProcessStarter processStarter = new ProcessStaterAndElementExecutorFactory(
            new NonModifyClassNameResolver()
    ).generateProcessStarter();

    @BeforeEach
    void setup() throws SQLException {
        database = database();
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
    }

    private DataSource database() {
        return OracleTestDatabase.create("process/SqlScriptTaskTest/initData.sql");
    }

    @Test
    void runSql() {
        Service service = getService("/process/SqlScriptTaskTest/selectQueryDynamically.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(applicationContext, new HashMap<>(0))
        );

        processStarter.start(process, processContext);

        TypedObject result = processContext.elementOutput("result");
        List<Map<String, Object>> object = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(3);
    }

    @Test
    void denyUpdateQuery() {
        Service service = getService("/process/SqlScriptTaskTest/update.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );

        ProcessContext processContext = new DefaultProcessContext(
                new DefaultServiceContext(applicationContext, new HashMap<>(0))
        );

        Assertions.assertThatExceptionOfType(UncategorizedSQLException.class).isThrownBy(() ->
                processStarter.start(process, processContext)
        );
    }

    @Test
    void runWithStringInput() {
        Service service = getService("/process/SqlScriptTaskTest/selectQueryDynamicallyInputParam.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("string"))
                .build());

        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);

        TypedObject result = processContext.elementOutput("result");
        List<Map<String, Object>> object = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(1);
    }

    @Test
    void runWithMapInput() {
        Service service = getService("/process/SqlScriptTaskTest/selectQueryDynamicallyInputParam.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("map"))
                .build());

        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);

        TypedObject result = processContext.elementOutput("result");
        List<Map<String, Object>> object = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(1);
    }

    @Test
    void runWithMapInputAndServiceContext() {
        Service service = getService("/process/SqlScriptTaskTest/selectQueryDynamicallyInputParam.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("composite"))
                .addEntity("firstName", new TypedObject("jj"))
                .build());

        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);

        TypedObject result = processContext.elementOutput("result");
        List<Map<String, Object>> object = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(1);
    }

    @Test
    void runWithInputKey() {
        Service service = getService("/process/SqlScriptTaskTest/selectQueryDynamicallyInputParam.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("input"))
                .build());

        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );
        processContext.add("k", new TypedObject(
                new MapBuilder<String, Object>().addEntity("id", "0").build(),
                new TypeReference<Map<String, Object>>() {
                })
        );

        processStarter.start(process, processContext);

        TypedObject result = processContext.elementOutput("result");
        List<Map<String, Object>> object = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(1);
    }

    @Test
    void runSqlWithLoop() {
        Service service = getService("/process/SqlScriptTaskTest/selectQueryDynamicallyLoop.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("ids", new TypedObject(Arrays.asList(0, 1, 2), new TypeReference<List<Integer>>() {
                        })).build()
        );

        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);

        TypedObject result = processContext.elementOutput("result");
        List<Map<String, Object>> object = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(3);
    }

    @Test
    void runSqlWithLoopAndJavaService() {
        Service service = getService("/process/SqlScriptTaskTest/selectQueryDynamicallyJavaServiceAndLoop.bpmn");
        Process process = service.getInitialProcess();
        ApplicationContext applicationContext = new DefaultApplicationContext(
                new MapBuilder<String, TypedObject>().
                        addEntity("ds1", new TypedObject(dataSource1))
                        .build()
        );
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(applicationContext,
                new HashMap<>()
        );

        ProcessContext processContext = new DefaultProcessContext(
                defaultServiceContext
        );

        processStarter.start(process, processContext);

        TypedObject result = processContext.elementOutput("result");
        List<Map<String, Object>> object = result.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(2);
    }
}