package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.jdbc.ColumnConverter;
import com.dongkuk.oasis.jdbc.DefaultDataSourceResolver;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.SqlScriptTask;

import javax.sql.DataSource;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.executors.DataSourceExtractorFromTransactionManager.getDataSource;
import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class SqlScriptTaskExecutable implements Executable {
    private final SqlScriptTask sqlScriptTask;
    private final String sql;
    private final String sqlId;
    private final String dataSourceName;
    private final String transactionManagerName;
    private final List<String> acceptablePropertyNames =
            Arrays.asList(INPUT_KEY, DATA_SOURCE, TRANSACTION_MANAGER_NAME, OUTPUT_KEY);

    /**
     * @param sqlScriptTask sqlScriptTask
     */
    public SqlScriptTaskExecutable(SqlScriptTask sqlScriptTask) {
        this.sqlScriptTask = sqlScriptTask;
        sql = sqlScriptTask.getSql();
        Property dataSourceProperty = sqlScriptTask.getProperty(DATA_SOURCE);
        dataSourceName =
                dataSourceProperty == null ? null : dataSourceProperty.getValue();

        Property transactionManagerNameProperty = sqlScriptTask.getProperty(TRANSACTION_MANAGER_NAME);
        transactionManagerName =
                transactionManagerNameProperty == null ? null : transactionManagerNameProperty.getValue();

        sqlId = sqlScriptTask.getSqlId();
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        TypedObject dataSourceNameObject = null;
        TypedObject transactionManagerNameObject = null;
        DataSource dataSource = null;
        if (dataSourceName != null)
            dataSourceNameObject = executableContext.get(dataSourceName);
        if (transactionManagerName != null)
            transactionManagerNameObject = executableContext.get(transactionManagerName);

        if (dataSourceNameObject != null && transactionManagerNameObject != null)
            throw new IllegalArgumentException("Cannot retrieve the data source. " +
                    "Please input either [ds] or [tx] property.");

        if (transactionManagerNameObject == null && dataSourceNameObject == null) {
            List<TypedObject> defaultDataSourceResolvers
                    = executableContext.get(DefaultDataSourceResolver.class);

            if (defaultDataSourceResolvers.size() == 1) {
                dataSource = defaultDataSourceResolvers.get(0)
                        .getObject(DefaultDataSourceResolver.class).defaultDataSource();
                if (dataSource == null)
                    throw new IllegalArgumentException("Cannot retrieve the default data source.");
            } else if (defaultDataSourceResolvers.size() > 1)
                throw new IllegalArgumentException("There are more than 2 default data sources.");
            else
                throw new IllegalArgumentException("Cannot retrieve the data source. " +
                        "Please verify if the properties [ds] or [tx] are set correctly.");
        }

        dataSource = dataSource == null ?
                getDataSource(dataSourceNameObject, transactionManagerNameObject) :
                dataSource;

        List<TypedObject> columnConverters = executableContext.get(ColumnConverter.class);
        ColumnConverter columnConverter
                = columnConverters.size() == 0 ? new ColumnConverter() {
        } :
                columnConverters.get(0).getObject(ColumnConverter.class);

        Map<String, Object> param =
                new InputsAndContextFlatter()
                        .createParameter(sqlScriptTask.getProperty(INPUT_KEY),
                                sqlScriptTask.inputs(),
                                executableContext);
        TypedObject result;
        if (sql != null) {
            result = new JdbcTemplateSqlRunner().run(param, dataSource, columnConverter, sql);
        } else if (sqlId != null) {
            List<TypedObject> typedObjects = executableContext.get(SqlRunner.class);
            if (typedObjects.size() != 1) {
                throw new RuntimeException("Although the SQL ID is set, the executable SqlRunner could not be found.");
            }
            result = typedObjects.get(0).getObject(SqlRunner.class).run(param, dataSource, sqlId);
        } else {
            throw new RuntimeException("SQL or SQL ID must be set.");
        }

        return new UnmodifiableExecutionResult(result);
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }
}
