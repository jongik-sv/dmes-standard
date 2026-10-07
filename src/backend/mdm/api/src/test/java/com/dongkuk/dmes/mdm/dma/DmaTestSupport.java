package com.dongkuk.dmes.mdm.dma;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.testdb.SharedContextResettable;
import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmColumnSystem;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;
import javax.sql.DataSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * TSK-04-04 design.md §3.3 — dma 서비스 테스트 공용. 가짜 사용자·가짜 마루 ID 이름 공간과 용어·도메인·컬럼 삽입 헬퍼.
 * 데이터는 리포지토리 save 로 넣는다(Flyway 운영 시드 금지). {@code DmaOasisHttpTest} 는 이 설정을 가져오지 않는다.
 */
public final class DmaTestSupport {

    private DmaTestSupport() {
    }

    @TestConfiguration(proxyBeanMethods = false)
    public static class Config {

        @Bean
        @Primary
        MutableCurrentUser dmaCurrentUser() {
            return new MutableCurrentUser();
        }

        /** 기본은 MASTER_CODE 종류라 컬럼 저장의 REF_TARGET 검사(MASTER_DATA)에 걸리지 않는다. C28 이 바꾼다. */
        @Bean
        FakeMaruIdNamespace dmaMaruIdNamespace() {
            return new FakeMaruIdNamespace();
        }
    }

    public static final class MutableCurrentUser implements MdmCurrentUser, SharedContextResettable {
        private volatile String userId;
        private volatile Set<String> roles = Set.of();

        @Override
        public void resetForTestClass() {
            this.userId = null;
            this.roles = Set.of();
        }

        public void set(String userId, Set<String> roles) {
            this.userId = userId;
            this.roles = Set.copyOf(roles);
        }

        @Override
        public String userId() {
            return userId;
        }

        @Override
        public Set<String> roleIds() {
            return roles;
        }
    }

    public static final class FakeMaruIdNamespace implements MaruIdNamespace, SharedContextResettable {
        private volatile MaruIdKind kind = MaruIdKind.MASTER_CODE;
        private final Set<String> ids = new HashSet<>();

        public void reset() {
            kind = MaruIdKind.MASTER_CODE;
            ids.clear();
        }

        @Override
        public void resetForTestClass() {
            reset();
        }

        public void set(MaruIdKind kind, Set<String> ids) {
            this.kind = kind;
            this.ids.clear();
            this.ids.addAll(ids);
        }

        @Override
        public MaruIdKind kind() {
            return kind;
        }

        @Override
        public boolean contains(String maruId) {
            return ids.contains(maruId);
        }
    }

    /** 단위 원장 한 행을 없을 때만 넣는다 — Oracle 에는 {@code INSERT OR IGNORE} 가 없어 {@code WHERE NOT EXISTS} 로 대신한다. */
    public static void unitIfAbsent(JdbcTemplate jdbc, String code, String dimension, String baseUnit) {
        jdbc.update("INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) "
                + "SELECT ?, ?, ?, 1, 0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_UNIT WHERE UNIT_CODE = ?)",
                code, dimension, baseUnit, code);
    }

    /**
     * 가리키는 부모 행이 없는 "유령 참조" 행을 넣는다. Oracle 에는 SQLite 의 {@code PRAGMA foreign_keys = OFF}(연결 단위)가 없어, 이 제약만
     * 잠깐 DISABLE 하고 넣은 뒤 ENABLE NOVALIDATE(새 DML 만 검사)로 되돌린다. 시험이 끝나면 유령 행을 지우고 {@link #restoreForeignKey} 로
     * 완전히 되돌린다 — 그러지 않으면 다음 클래스의 초기화 DELETE 는 되지만 제약이 NOVALIDATE 로 남는다.
     */
    public static void insertWithForeignKeyOff(DataSource dataSource, String table, String constraint, String sql)
            throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            c.setAutoCommit(true);
            st.execute("ALTER TABLE " + table + " DISABLE CONSTRAINT " + constraint);
            try {
                st.execute(sql);
            } finally {
                st.execute("ALTER TABLE " + table + " ENABLE NOVALIDATE CONSTRAINT " + constraint);
            }
        }
    }

    /** {@link #insertWithForeignKeyOff} 로 끈 제약을 검증 상태까지 되돌린다 — 유령 행을 먼저 지운 뒤(예: {@link #clear}) 부른다. */
    public static void restoreForeignKey(JdbcTemplate jdbc, String table, String constraint) {
        jdbc.execute("ALTER TABLE " + table + " ENABLE VALIDATE CONSTRAINT " + constraint);
    }

    public static void clear(JdbcTemplate jdbc) {
        jdbc.update("DELETE FROM TB_MDM_COLUMN_SYSTEM");
        jdbc.update("DELETE FROM TB_MDM_COLUMN");
        jdbc.update("DELETE FROM TB_MDM_TERM");
        jdbc.update("DELETE FROM TB_MDM_DOMAIN");
    }

    public static MdmTerm term(MdmTermRepository repo, String name, String abbr, String engName, String synonyms) {
        MdmTerm term = new MdmTerm(name, 1, name + " 정의");
        term.setEngAbbr(abbr);
        term.setEngName(engName);
        term.setSynonyms(synonyms);
        return repo.save(term);
    }

    public static MdmDomain domain(MdmDomainRepository repo, String name, String stdName) {
        return repo.save(new MdmDomain(name, stdName, "QTY", "NUMBER"));
    }

    public static MdmColumn column(MdmColumnRepository repo, String name, String physName, Long domainId) {
        return repo.save(new MdmColumn(name, physName, domainId));
    }

    public static MdmColumnSystem mapping(MdmColumnSystemRepository repo, Long columnId, String system, String phys,
                                          String transform) {
        MdmColumnSystem row = new MdmColumnSystem(columnId, system, phys);
        row.setTransform(transform);
        return repo.save(row);
    }
}
