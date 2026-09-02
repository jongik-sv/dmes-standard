package com.dongkuk.caravan.console.caravanhubconfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.domain.Specification;

/**
 * ConsoleCaravanHubConfigSpecification 의 빈 조건 처리 회귀 방지 테스트.
 *
 * <p>Spring Data JPA 4.0 (Boot 4) 의 strict 검사 — Specification 가 {@code null} 반환 시
 * {@code IllegalArgumentException: Specification must not be null}. 따라서 빈 조건 시
 * {@link CriteriaBuilder#conjunction()} (= TRUE) 를 반환해야 안전.</p>
 *
 * <p>본 테스트는 Phase 4 검증 중 발견된 회귀를 방지한다.</p>
 */
class ConsoleCaravanHubConfigSpecificationTest {

    @Test
    void directionEquals_null_returns_conjunction() {
        Specification<ConsoleCaravanHubConfigEntity> spec = ConsoleCaravanHubConfigSpecification.directionEquals(null);
        Predicate result = invoke(spec, cb -> cb.conjunction());
        assertThat(result).as("null direction → cb.conjunction() (TRUE)").isNotNull();
    }

    @Test
    void directionEquals_empty_returns_conjunction() {
        Specification<ConsoleCaravanHubConfigEntity> spec = ConsoleCaravanHubConfigSpecification.directionEquals("");
        Predicate result = invoke(spec, cb -> cb.conjunction());
        assertThat(result).isNotNull();
    }

    @Test
    void directionEquals_value_returns_equal_predicate() {
        Specification<ConsoleCaravanHubConfigEntity> spec = ConsoleCaravanHubConfigSpecification.directionEquals("IN");

        @SuppressWarnings("unchecked")
        Root<ConsoleCaravanHubConfigEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        @SuppressWarnings("unchecked")
        Path<Object> directionPath = mock(Path.class);
        Predicate equalPredicate = mock(Predicate.class);

        when(root.get("direction")).thenReturn((Path) directionPath);
        when(cb.equal(directionPath, "IN")).thenReturn(equalPredicate);

        Predicate result = spec.toPredicate(root, query, cb);

        assertThat(result).isSameAs(equalPredicate);
        verify(cb).equal(directionPath, "IN");
        verify(cb, never()).conjunction();
    }

    @Test
    void topicIdLike_null_returns_conjunction() {
        Specification<ConsoleCaravanHubConfigEntity> spec = ConsoleCaravanHubConfigSpecification.topicIdLike(null);
        Predicate result = invoke(spec, cb -> cb.conjunction());
        assertThat(result).isNotNull();
    }

    @Test
    void topicIdLike_value_returns_like_predicate_with_wildcards() {
        Specification<ConsoleCaravanHubConfigEntity> spec = ConsoleCaravanHubConfigSpecification.topicIdLike("test");

        @SuppressWarnings("unchecked")
        Root<ConsoleCaravanHubConfigEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        @SuppressWarnings("unchecked")
        Path<String> topicIdPath = mock(Path.class);
        Predicate likePredicate = mock(Predicate.class);

        when(root.get("topicId")).thenReturn((Path) topicIdPath);
        when(cb.like(eq(topicIdPath), eq("%test%"))).thenReturn(likePredicate);

        Predicate result = spec.toPredicate(root, query, cb);

        assertThat(result).isSameAs(likePredicate);
        verify(cb).like(topicIdPath, "%test%");
    }

    @Test
    void useYnEquals_null_returns_conjunction() {
        Specification<ConsoleCaravanHubConfigEntity> spec = ConsoleCaravanHubConfigSpecification.useYnEquals(null);
        Predicate result = invoke(spec, cb -> cb.conjunction());
        assertThat(result).isNotNull();
    }

    @Test
    void useYnEquals_value_returns_equal_predicate() {
        Specification<ConsoleCaravanHubConfigEntity> spec = ConsoleCaravanHubConfigSpecification.useYnEquals("Y");

        @SuppressWarnings("unchecked")
        Root<ConsoleCaravanHubConfigEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        @SuppressWarnings("unchecked")
        Path<Object> useYnPath = mock(Path.class);
        Predicate equalPredicate = mock(Predicate.class);

        when(root.get("useYn")).thenReturn((Path) useYnPath);
        when(cb.equal(useYnPath, "Y")).thenReturn(equalPredicate);

        Predicate result = spec.toPredicate(root, query, cb);

        assertThat(result).isSameAs(equalPredicate);
    }

    @Test
    void all_methods_chain_with_where_and_never_return_null() {
        // Spring Data JPA 4.0 의 Specification.where(spec).and(spec) 체인이
        // 모든 메서드가 null 반환 안 한다는 가정 위에서 작동. 본 테스트는 그 가정 검증.
        Specification<ConsoleCaravanHubConfigEntity> chained = Specification.where(
                ConsoleCaravanHubConfigSpecification.directionEquals(null))
                .and(ConsoleCaravanHubConfigSpecification.topicIdLike(null))
                .and(ConsoleCaravanHubConfigSpecification.useYnEquals(null));

        // chain 자체가 null 이 아니어야 (null 반환되면 NullPointerException 발생)
        assertThat(chained).isNotNull();

        // 실제 toPredicate 호출 시도 — null 반환 없이 정상 처리되어야
        @SuppressWarnings("unchecked")
        Root<ConsoleCaravanHubConfigEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        Predicate truePredicate = mock(Predicate.class);
        when(cb.conjunction()).thenReturn(truePredicate);
        when(cb.and(any(Predicate[].class))).thenReturn(truePredicate);

        Predicate result = chained.toPredicate(root, query, cb);

        assertThat(result).as("모든 빈 조건 chain → 항상 valid Predicate").isNotNull();
    }

    /**
     * Specification.toPredicate 호출용 mock 헬퍼.
     * 빈 조건일 때 cb.conjunction() 가 호출되는지 검증하는 패턴.
     */
    @SuppressWarnings("unchecked")
    private Predicate invoke(Specification<ConsoleCaravanHubConfigEntity> spec,
                              java.util.function.Function<CriteriaBuilder, Predicate> conjunctionStub) {
        Root<ConsoleCaravanHubConfigEntity> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        Predicate truePredicate = mock(Predicate.class);
        when(cb.conjunction()).thenReturn(truePredicate);
        return spec.toPredicate(root, query, cb);
    }
}
