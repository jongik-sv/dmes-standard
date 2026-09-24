package com.dongkuk.dmes.mdm.common.embedding;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * {@code TB_MDM_TERM.EMBEDDING}/{@code EMBEDDING_MODEL} 전용 네이티브 SQL 접근 — 불변 규칙 I10.
 * 이 두 칼럼은 {@code MdmTerm} 엔티티에 매핑돼 있지 않으므로(D7, term-embedding.md) JPA 로 다룰 수 없다.
 *
 * <p>페이징은 SQLite/MSSQL 방언에 공통인 {@code LIMIT}/{@code OFFSET-FETCH} 문법을 쓰지 않고, 대상
 * {@code TERM_ID} 전체를 정렬해 가져온 뒤 호출부(자바)가 청크로 자른다 — 두 방언 모두에서 동작하는
 * 가장 단순한 방법이다.
 */
@Repository
public class TermEmbeddingRepository {

    private final JdbcTemplate jdbcTemplate;

    public TermEmbeddingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * {@code EMBEDDING}/{@code EMBEDDING_MODEL} 을 갱신한다.
     *
     * @return 영향받은 행 수(정상적으로는 1). 0 이면 호출부가 대상 행이 이미 flush 되지 않았거나
     *         존재하지 않는다는 뜻이다 — 호출부가 이 값을 검증해야 한다(advisor 지적 — JPA save 가
     *         아직 flush 되지 않은 상태에서 이 UPDATE 를 부르면 0건이 된다).
     */
    public int updateEmbedding(long termId, byte[] embedding, String modelId) {
        return jdbcTemplate.update(
                "UPDATE TB_MDM_TERM SET EMBEDDING = ?, EMBEDDING_MODEL = ? WHERE TERM_ID = ?",
                embedding, modelId, termId);
    }

    /** {@code EMBEDDING}/{@code EMBEDDING_MODEL} 을 NULL 로 지운다(I12 — 입력 필드 변경 시 재인코딩 전 초기화). */
    public int clearEmbedding(long termId) {
        return jdbcTemplate.update(
                "UPDATE TB_MDM_TERM SET EMBEDDING = NULL, EMBEDDING_MODEL = NULL WHERE TERM_ID = ?",
                termId);
    }

    /** 현재 {@code EMBEDDING_MODEL} 값(NULL 이면 {@link Optional#empty()}는 아니고 값 자체가 없는 것과 구분하지 않는다 — 단순 조회). */
    public Optional<String> findEmbeddingModel(long termId) {
        List<String> rows = jdbcTemplate.query(
                "SELECT EMBEDDING_MODEL FROM TB_MDM_TERM WHERE TERM_ID = ?",
                (rs, rowNum) -> rs.getString(1), termId);
        return rows.isEmpty() ? Optional.empty() : Optional.ofNullable(rows.get(0));
    }

    /** 저장된 임베딩 벡터(디코딩됨). 없으면 {@link Optional#empty()}. */
    public Optional<float[]> findEmbedding(long termId) {
        List<byte[]> rows = jdbcTemplate.query(
                "SELECT EMBEDDING FROM TB_MDM_TERM WHERE TERM_ID = ?",
                (rs, rowNum) -> rs.getBytes(1), termId);
        if (rows.isEmpty() || rows.get(0) == null) {
            return Optional.empty();
        }
        return Optional.of(TermEmbeddingCodec.decode(rows.get(0)));
    }

    /**
     * I11 — {@code EMBEDDING_MODEL} 이 NULL 이거나 현재 활성 모델과 다른 행의 {@code TERM_ID} 를
     * 오름차순으로 전부 반환한다. 호출부가 청크(500건) 단위로 자른다(D6).
     */
    public List<Long> findStaleTermIds(String activeModelId) {
        return jdbcTemplate.query(
                "SELECT TERM_ID FROM TB_MDM_TERM WHERE EMBEDDING_MODEL IS NULL OR EMBEDDING_MODEL <> ? "
                        + "ORDER BY TERM_ID",
                (rs, rowNum) -> rs.getLong(1), activeModelId);
    }

    /**
     * 부팅 시(또는 성능 시험의 {@code reloadAll}) 전체 캐시 적재용 — {@code EMBEDDING} 이 NULL 이 아닌
     * 행 전부를 {@code termId → 벡터} 로 반환한다(I19).
     */
    public Map<Long, float[]> loadAllEmbeddings() {
        Map<Long, float[]> out = new LinkedHashMap<>();
        jdbcTemplate.query("SELECT TERM_ID, EMBEDDING FROM TB_MDM_TERM WHERE EMBEDDING IS NOT NULL",
                (ResultSet rs) -> {
                    long termId = rs.getLong(1);
                    byte[] bytes = rs.getBytes(2);
                    if (bytes != null) {
                        out.put(termId, TermEmbeddingCodec.decode(bytes));
                    }
                });
        return out;
    }

    /**
     * 성능 시험(§3.2)이 서비스의 {@code save()} 경로를 타지 않고 JDBC 배치 insert 로 넣은 임베딩을 한 번에
     * 쓸 때 쓴다. 서비스 코드 경로는 아니다.
     */
    public void bulkUpdateEmbedding(long termId, byte[] embedding, String modelId) throws SQLException {
        int updated = updateEmbedding(termId, embedding, modelId);
        if (updated != 1) {
            throw new SQLException("EMBEDDING bulk 갱신 대상 행이 없다: termId=" + termId);
        }
    }
}
