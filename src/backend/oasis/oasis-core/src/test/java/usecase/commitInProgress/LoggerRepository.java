package usecase.commitInProgress;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
@SuppressWarnings("SqlResolve")
public class LoggerRepository {
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public LoggerRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void log(String id) {
        Map<String, Object> param = new HashMap<>();
        param.put("id", id);
        jdbcTemplate.update("insert into log(id) values(:id)", param);
    }

//    public List<SampleDto> getSamples() {
//        // 1. mybatis
//        List<SampleEntity> objects = sqlSession.selectList("cothe.selectSamples", null);
//
//        // 2. Jpa
////        List<SampleEntity> objects = entityManager.createQuery("select m from SampleEntity as m", SampleEntity.class).getResultList();
//
//        // 3. Spring Jpa
////        List<SampleEntity> objects = sampleEntityRepository.findAll();
//
//        // data 전환
//        return objects.stream().map(sampleEntity -> new SampleDto(sampleEntity.getId(), sampleEntity.getName())).collect(Collectors.toList());
//    }
}
