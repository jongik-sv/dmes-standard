package usecase.sqlScriptWithDto;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionManagerInfoHolder;
import com.dongkuk.oasis.utils.MapBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import utils.OracleTestDatabase;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.Arrays;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;

/**
 * @author Jeongjin Kim
 * @since 2022-04-20
 */
public class SqlScriptWithDtoAndCallJavaServiceTest {
    DataSource database;
    DataSource dataSource1;
    SpringTransactionHandler transactionHandler;
    DefaultApplicationContext applicationContext;

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
    }

    @Test
    void passingSqlScriptResultIntoTask() {
        ServiceStarter serviceStarter = getServiceStarter("/usecase/sqlScriptWithDto/sqlScriptTaskAndCallJavaTask.bpmn");

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext,
                new MapBuilder<String, TypedObject>()
                        .build());

        ServiceResult test = serviceStarter.start("test", serviceContext);

        System.out.println(test.serviceResultCode());

    }

    private DataSource database() {
        return OracleTestDatabase.create("usecase/sqlScriptWithDto/initData.sql");
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

}
