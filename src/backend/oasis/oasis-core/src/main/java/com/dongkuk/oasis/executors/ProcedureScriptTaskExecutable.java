package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.jdbc.DefaultDataSourceResolver;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.ProcedureScriptTask;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import javax.sql.DataSource;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.executors.DataSourceExtractorFromTransactionManager.getDataSource;
import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * @author Jeongjin Kim
 * @since 2022-02-08
 */
final class ProcedureScriptTaskExecutable implements Executable {
    private static final org.slf4j.Logger log
            = org.slf4j.LoggerFactory.getLogger(ProcedureScriptTaskExecutable.class);
    private final ProcedureScriptTask sqlScriptTask;
    private final String sql;
    private final String dataSourceName;
    private final String transactionManagerName;
    private final List<String> acceptablePropertyNames =
            Arrays.asList(INPUT_KEY, DATA_SOURCE, TRANSACTION_MANAGER_NAME, OUTPUT_KEY);

    /**
     * @param procedureScriptTask procedureScriptTask
     */
    public ProcedureScriptTaskExecutable(ProcedureScriptTask procedureScriptTask) {
        this.sqlScriptTask = procedureScriptTask;
        sql = procedureScriptTask.getSql();
        Property dataSourceProperty = procedureScriptTask.getProperty(DATA_SOURCE);
        dataSourceName =
                dataSourceProperty == null ? null : dataSourceProperty.getValue();

        Property transactionManagerNameProperty = procedureScriptTask.getProperty(TRANSACTION_MANAGER_NAME);
        transactionManagerName =
                transactionManagerNameProperty == null ? null : transactionManagerNameProperty.getValue();
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

        Map<String, Object> param =
                new InputsAndContextFlatter()
                        .createParameter(sqlScriptTask.getProperty(INPUT_KEY),
                                sqlScriptTask.inputs(),
                                executableContext);
        TypedObject result = runQuery(param, dataSource);
        return new UnmodifiableExecutionResult(result);
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }

    private TypedObject runQuery(Map<String, Object> param, DataSource dataSource) {
        NamedParameterJdbcTemplate jdbcTemplate =
                new NamedParameterJdbcTemplate(dataSource);

        int update = jdbcTemplate.update("call " + sql, param);

        log.debug("The procedure finished : " + update);

        return new TypedObject(update);
    }
}
