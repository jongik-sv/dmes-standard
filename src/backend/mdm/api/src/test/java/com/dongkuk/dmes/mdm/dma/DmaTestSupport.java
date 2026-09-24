package com.dongkuk.dmes.mdm.dma;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
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
import java.util.HashSet;
import java.util.Set;
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

    public static final class MutableCurrentUser implements MdmCurrentUser {
        private volatile String userId;
        private volatile Set<String> roles = Set.of();

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

    public static final class FakeMaruIdNamespace implements MaruIdNamespace {
        private volatile MaruIdKind kind = MaruIdKind.MASTER_CODE;
        private final Set<String> ids = new HashSet<>();

        public void reset() {
            kind = MaruIdKind.MASTER_CODE;
            ids.clear();
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
