package utils;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionManagerInfoHolder;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.Arrays;

public final class DatabaseHelper {
    public static SpringTransactionHandler getSpringTransactionHandler(String initScriptPath,
                                                                       String transactionManagerName,
                                                                       DefaultApplicationContext applicationContext)
            throws SQLException {
        DataSource database = OracleTestDatabase.create(initScriptPath);
        DataSource dataSource = new SingleConnectionDataSource(database.getConnection(), true);
        TransactionManagerInfoHolder[] transactionManagerInfoHolders
                = {
                new TransactionManagerInfoHolder(transactionManagerName, dataSource, null)
        };
        for (TransactionManagerInfoHolder transactionManagerInfoHolder : transactionManagerInfoHolders) {
            PlatformTransactionManager tm;
            if (transactionManagerInfoHolder.getEntityManagerFactory() != null)
                tm = new JpaTransactionManager(transactionManagerInfoHolder.getEntityManagerFactory());
            else
                tm = new DataSourceTransactionManager(transactionManagerInfoHolder.getDataSource());

            applicationContext.put(transactionManagerInfoHolder.getTransactionManagerName(), new TypedObject(tm));
        }

        return new SpringTransactionHandler(applicationContext, Arrays.stream(transactionManagerInfoHolders)
                .map(TransactionManagerInfoHolder::getTransactionManagerName).toArray(String[]::new));
    }
}
