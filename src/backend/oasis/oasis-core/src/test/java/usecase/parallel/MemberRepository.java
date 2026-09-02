package usecase.parallel;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
@SuppressWarnings("SqlResolve")
public class MemberRepository {
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public MemberRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void join(Map<String, Object> memberInfo) {
        jdbcTemplate.update("insert into members(id, firstName, lastName) values(:id, :firstName, :lastName)", memberInfo);
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
