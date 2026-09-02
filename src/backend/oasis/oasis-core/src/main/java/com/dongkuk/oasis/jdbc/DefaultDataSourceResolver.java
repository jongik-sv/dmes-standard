package com.dongkuk.oasis.jdbc;

import javax.sql.DataSource;

/**
 * 기본 데이터소스를 결정하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2022-02-14
 */
public interface DefaultDataSourceResolver {
    /**
     * @return 기본 데이터소스를 반환한다. 기본 데이터소스가 없으면 null을 반환한다.
     */
    DataSource defaultDataSource();
}
