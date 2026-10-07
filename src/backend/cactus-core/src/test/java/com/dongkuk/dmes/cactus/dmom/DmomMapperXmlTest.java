package com.dongkuk.dmes.cactus.dmom;

import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;

import java.io.InputStream;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * DmomMapper.xml 스모크 테스트 (DB 불요).
 *
 * <ol>
 *   <li>{@code cactus.mybatis.mapper-locations} 기본 글로브({@code classpath*:persistence/**}/{@code *.xml})에
 *       매칭되는지 — 위치 검증(Phase 0 §0.5 정합).</li>
 *   <li>MyBatis 가 XML 을 파싱하고 4개 statement 를 등록하는지 — XML well-formedness +
 *       {@code #{...}}/{@code ${...}} 플레이스홀더 구문 검증.</li>
 * </ol>
 *
 * <p><b>한계</b>: Oracle SQL 의미({@code FETCH FIRST}/{@code CURRENT_TIMESTAMP}/{@code NEXTVAL}/JOIN) 검증은
 * 실DB 필요(Phase 5). MyBatis 는 SQL 본문을 불투명 텍스트로 취급하므로 본 테스트로는 못 잡는다.
 */
class DmomMapperXmlTest {

    private static final String LOCATION_PATTERN = "classpath*:persistence/**/*.xml";
    private static final String RESOURCE = "persistence/dmom/DmomMapper.xml";

    @Test
    void mapper_locations_글로브에_포함된다() throws Exception {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources(LOCATION_PATTERN);

        boolean found = Arrays.stream(resources)
                .anyMatch(r -> "DmomMapper.xml".equals(r.getFilename()));

        assertThat(found)
                .as("DmomMapper.xml 이 %s 에 매칭되어 cactus multi-DS factory 에 로드되어야 함", LOCATION_PATTERN)
                .isTrue();
    }

    @Test
    void XML_파싱되고_4개_statement_등록된다() throws Exception {
        Configuration configuration = new Configuration();
        Resource resource = new PathMatchingResourcePatternResolver().getResource("classpath:" + RESOURCE);

        try (InputStream in = resource.getInputStream()) {
            new XMLMapperBuilder(in, configuration, RESOURCE, configuration.getSqlFragments()).parse();
        }

        assertThat(configuration.hasStatement("DmomMapper.getFormatLayout")).isTrue();
        assertThat(configuration.hasStatement("DmomMapper.getSendTableId")).isTrue();
        assertThat(configuration.hasStatement("DmomMapper.insertIfOutbound")).isTrue();
        assertThat(configuration.hasStatement("DmomMapper.insertTcError")).isTrue();
    }
}
