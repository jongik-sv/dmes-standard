package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.orm.jpa.JpaTransactionManager;

import javax.sql.DataSource;

/**
 * {@code TransactionManager}에서 {@code DataSource}를 찾아 반환하는 스태틱 클래스.
 *
 * @author Jeongjin Kim
 * @since 2022-02-09
 */
class DataSourceExtractorFromTransactionManager {
    /**
     * @param dataSourceNameObject         dataSourceNameObject
     * @param transactionManagerNameObject transactionManagerNameObject
     * @return 데이터소스 개체
     */
    static DataSource getDataSource(TypedObject dataSourceNameObject, TypedObject transactionManagerNameObject) {
        DataSource dataSource;
        if (transactionManagerNameObject != null) {
            Object object = transactionManagerNameObject.getObject();

            if (object instanceof JpaTransactionManager) {
                dataSource = ((JpaTransactionManager) object).getDataSource();
            } else if (object instanceof DataSourceTransactionManager) {
                dataSource = ((DataSourceTransactionManager) object).getDataSource();
            } else {
                throw new IllegalArgumentException("Unsupported transaction manager. " +
                        "Input the data source directly into the [ds] property.");
            }
        } else {
            dataSource = dataSourceNameObject.getObject(DataSource.class);
        }
        return dataSource;
    }
}
