package com.dongkuk.dmes.cactus.jpa;

import org.hibernate.boot.model.naming.Identifier;
import org.hibernate.engine.jdbc.env.spi.JdbcEnvironment;

/**
 * {@link SnakePhysicalNamingStrategy} 를 확장하여 물리 테이블명에 prefix 를 부착한다.
 *
 * <p>Snake 변환 (camelCase → snake_case, "Entity" 접미사 제거) 이후 prefix 를 적용하므로
 * prefix 자체는 snake 변환 대상이 되지 않는다.
 *
 * <p>예: 논리명 {@code MpnEntity} → super (Snake) → {@code mpn} → prefix {@code tb_} → {@code tb_mpn}
 *
 * <p>{@code tablePrefix} 가 빈 문자열이면 부모 동작과 완전히 동일 — 호환성 보장.
 *
 * <p><b>Skip 휴리스틱</b>: snake 변환 결과가 이미 {@code tablePrefix} 의 첫 segment
 * (예: {@code "tb_mpn_"} 의 경우 {@code "tb_"}) 로 시작하면 prefix 를 추가로 부착하지
 * 않는다. cactus 시스템 테이블({@code TB_SEC_USER} 등) 이 EntityScan 에 포함될 때
 * 이중 prefix ({@code tb_mpn_tb_sec_user}) 가 생기는 것을 방지하기 위함.
 *
 * <p>활성 조건: {@link CactusHibernateCustomizerAutoConfiguration} 가
 * {@code cactus.jpa.table-prefix} 비어있지 않을 때 instance 를 생성해 주입.
 */
public class PrefixedSnakePhysicalNamingStrategy extends SnakePhysicalNamingStrategy {

    private final String tablePrefix;
    /** tablePrefix 의 첫 segment (예: "tb_mpn_" → "tb_"). skip 휴리스틱 기준. */
    private final String skipPrefix;

    public PrefixedSnakePhysicalNamingStrategy(String tablePrefix) {
        this.tablePrefix = (tablePrefix == null) ? "" : tablePrefix;
        int sep = this.tablePrefix.indexOf('_');
        this.skipPrefix = (sep > 0) ? this.tablePrefix.substring(0, sep + 1) : "";
    }

    @Override
    public Identifier toPhysicalTableName(Identifier name, JdbcEnvironment jdbcEnvironment) {
        Identifier snaked = super.toPhysicalTableName(name, jdbcEnvironment);
        if (snaked == null || tablePrefix.isEmpty()) {
            return snaked;
        }
        String text = snaked.getText();
        if (text.startsWith(tablePrefix)) {
            return snaked;
        }
        if (!skipPrefix.isEmpty() && text.startsWith(skipPrefix)) {
            return snaked;
        }
        return new Identifier(tablePrefix + text, snaked.isQuoted());
    }
}
