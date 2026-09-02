package com.dongkuk.dmes.cactus.jpa;

import org.hibernate.boot.model.naming.Identifier;
import org.hibernate.boot.model.naming.ImplicitIndexNameSource;
import org.hibernate.boot.model.naming.ImplicitNamingStrategyJpaCompliantImpl;
import org.hibernate.boot.model.naming.ImplicitUniqueKeyNameSource;

import java.util.stream.Collectors;

/**
 * Unique Constraint / Index 의 implicit name 을 {@code <ukPrefix><table>_<cols>} /
 * {@code <idxPrefix><table>_<cols>} 형식으로 생성한다.
 *
 * <p>적용 조건:
 * <ul>
 *   <li>엔티티의 {@code @UniqueConstraint} 또는 {@code @Index} 에 {@code name} 속성이 비어있어야 한다.
 *       명시한 {@code name} 은 ImplicitNamingStrategy 를 거치지 않고 그대로 사용된다.</li>
 *   <li>{@code cactus.jpa.implicit-naming.enabled = true} 일 때만 AutoConfiguration 이 주입.</li>
 * </ul>
 *
 * <p>{@code source.getTableName()} 은 PhysicalNamingStrategy 적용 전의 <b>논리 테이블명</b> 이다.
 * 따라서 테이블 prefix ({@code tb_}) 가 UK/Index 이름에 끼지 않는다.
 *
 * <p>예: 논리 테이블 {@code mpn} + UK on {@code (item_id, plant_id)} → {@code uk_mpn_item_id_plant_id}
 */
public class CactusImplicitNamingStrategy extends ImplicitNamingStrategyJpaCompliantImpl {

    private final String ukPrefix;
    private final String idxPrefix;
    /** host 테이블 prefix (예: "tb_mpn_"). buildBody 에서 stripping 해서 이중 prefix 방지. */
    private final String tablePrefix;

    public CactusImplicitNamingStrategy(String ukPrefix, String idxPrefix, String tablePrefix) {
        this.ukPrefix = (ukPrefix == null) ? "" : ukPrefix;
        this.idxPrefix = (idxPrefix == null) ? "" : idxPrefix;
        this.tablePrefix = (tablePrefix == null) ? "" : tablePrefix;
    }

    @Override
    public Identifier determineUniqueKeyName(ImplicitUniqueKeyNameSource source) {
        return Identifier.toIdentifier(ukPrefix + buildBody(source.getTableName(), source.getColumnNames()));
    }

    @Override
    public Identifier determineIndexName(ImplicitIndexNameSource source) {
        return Identifier.toIdentifier(idxPrefix + buildBody(source.getTableName(), source.getColumnNames()));
    }

    private String buildBody(Identifier tableName, java.util.List<Identifier> columnNames) {
        String table = tableName.getText();
        if (!tablePrefix.isEmpty() && table.startsWith(tablePrefix)) {
            table = table.substring(tablePrefix.length());
        }
        String cols = columnNames.stream()
                .map(Identifier::getText)
                .collect(Collectors.joining("_"));
        return table + "_" + cols;
    }
}
