package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.embedding.DeterministicHashTermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendRequest;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

/**
 * TSK-04-02 design.md §3.2 — I9, I18, I19 + 수용 기준 AC7(용어 1만 건 추천 응답 500ms 이내). 자체
 * temp DB(§3.2 격리 방식), {@code @Transactional} 없이. 서비스의 {@code save()} 경로를 타지 않고 JDBC
 * 배치 insert 로 10,000건을 커밋한 뒤 {@link TermRecommendationCache#reloadAll()}로 캐시를 채운다.
 * 측정 대상은 {@link TermMngService#recommend(RecommendRequest)} 서비스 메서드 호출 시간 자체다(D4 §"측정
 * 범위 명시" — OASIS 봉투·HTTP·네트워크 왕복은 포함하지 않는다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@TestPropertySource(properties = "mdm.embedding.encoder=fake")
class TermRecommendPerformanceTest extends AbstractMdmSharedDbTest {

    private static final int TERM_COUNT = 10_000;
    private static final long MAX_MEDIAN_MS = 500L;

    @Autowired
    TermMngService service;
    @Autowired
    TermRecommendationCache cache;
    @Autowired
    TermEmbeddingEncoder encoder; // fake
    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void seedTenThousandTerms() {
        DeterministicHashTermEmbeddingEncoder fixtureEncoder = new DeterministicHashTermEmbeddingEncoder();
        String modelId = encoder.modelId();

        jdbcTemplate.execute("PRAGMA synchronous=OFF"); // 성능 시험 전용 대량 insert 가속(테스트 DB 한정)
        jdbcTemplate.batchUpdate(
                "INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, EMBEDDING, EMBEDDING_MODEL) "
                        + "VALUES (?, 1, ?, ?, ?)",
                new org.springframework.jdbc.core.BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(java.sql.PreparedStatement ps, int i) throws java.sql.SQLException {
                        String termName = "성능용어" + i;
                        String definition = "성능 시험용 정의 " + i;
                        // I9·I18 인코딩 입력 형식("{표기}: {정의} ({영문명})")을 그대로 재현한다(TermMngService.buildEncodingInput).
                        String encodingInput = termName + ": " + definition; // 영문명이 비면 " (…)" 를 뺀다
                        byte[] embedding = TermEmbeddingCodec.encode(fixtureEncoder.encode(encodingInput));
                        ps.setString(1, termName);
                        ps.setString(2, definition);
                        ps.setBytes(3, embedding);
                        ps.setString(4, modelId);
                    }

                    @Override
                    public int getBatchSize() {
                        return TERM_COUNT;
                    }
                });

        cache.reloadAll();
    }

    @Test
    void AC7_1만건_추천_응답_중앙값이_500ms_미만이다() {
        RecommendRequest request = new RecommendRequest();
        request.setTermName("성능용어1234");
        request.setDefinition("성능 시험용 정의 1234");

        // 워밍업 1회.
        service.recommend(request);

        int trials = 5;
        long[] samplesMs = new long[trials];
        for (int i = 0; i < trials; i++) {
            long start = System.nanoTime();
            Map<String, Object> result = service.recommend(request);
            samplesMs[i] = (System.nanoTime() - start) / 1_000_000;
            assertTrue(result.containsKey("candidates"));
        }
        Arrays.sort(samplesMs);
        long median = samplesMs[trials / 2];
        assertTrue(median < MAX_MEDIAN_MS,
                "중앙값=" + median + "ms (기준 " + MAX_MEDIAN_MS + "ms 미만), 전체=" + Arrays.toString(samplesMs));
    }
}
