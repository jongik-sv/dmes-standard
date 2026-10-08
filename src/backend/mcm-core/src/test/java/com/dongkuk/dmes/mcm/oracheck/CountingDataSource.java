package com.dongkuk.dmes.mcm.oracheck;

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.AbstractDataSource;

/** 연결에서 준비한 SQL 문장 수를 세는 시험용 DataSource. */
final class CountingDataSource extends AbstractDataSource {

    private final DataSource delegate;
    private final AtomicInteger statements = new AtomicInteger();

    CountingDataSource(DataSource delegate) {
        this.delegate = delegate;
    }

    int statements() {
        return statements.get();
    }

    @Override
    public Connection getConnection() throws java.sql.SQLException {
        Connection target = delegate.getConnection();
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (proxy, method, args) -> {
            if (method.getName().equals("prepareStatement") || method.getName().equals("prepareCall")) statements.incrementAndGet();
            try {
                return method.invoke(target, args);
            } catch (java.lang.reflect.InvocationTargetException e) {
                throw e.getCause();
            }
        });
    }

    @Override
    public Connection getConnection(String username, String password) throws java.sql.SQLException {
        return getConnection();
    }
}
