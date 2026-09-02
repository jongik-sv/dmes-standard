package com.dongkuk.caravan.hub.mapper;

import com.dongkuk.caravan.hub.config.IfMapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 인터페이스 테이블({@code IF_*}) CRUD Mapper (IF DataSource).
 *
 * <p>INBOUND DB 폴링 시 미처리 메시지 조회 및 상태 업데이트,
 * OUTBOUND DB 처리 시 메시지 INSERT를 수행한다.</p>
 *
 * <p>IF DataSource를 사용하며, SQL XML은 {@code mapper/if/InterfaceMapper.xml}에 위치한다.</p>
 *
 * <p><b>주의</b>: SQL XML에서 {@code ${TABLE_NAME}}은 문자열 치환(PreparedStatement가 아님)이므로
 * 호출 전 반드시 테이블명 검증이 필요하다.</p>
 *
 * <p><b>AUDIT 컬럼 — cactus 표준 (v4 §16, 2026-05-13)</b>:
 * IF_* 테이블은 cactus 9 audit 컬럼 ({@code C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID /
 * U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER}) 사용. 모듈 측 entity 의
 * {@code CactusAuditEntity} 상속 형태와 동일 컬럼 구조.</p>
 *
 * @see com.dongkuk.caravan.hub.config.IfMapper
 * @see com.dongkuk.caravan.hub.config.DataSourceConfig.IfDataSourceConfig
 */
@IfMapper
public interface InterfaceMapper {

    /**
     * 미처리 메시지를 조회한다 ({@code IF_FLAG='N'}).
     *
     * <p>{@code C_AT ASC} 순서로 정렬하여 처리 순서를 보장하며,
     * 배치 크기는 호출 측에서 sub-list 로 제한한다.</p>
     *
     * <p>반환 Map 키: {@code U_AT}(낙관적 락 키), {@code TRANSACTION_CODE},
     * {@code INTERFACE_ID}, {@code INTERFACE_MSG}, {@code KEY_DATA1~3},
     * {@code IF_SEQ}, {@code VER}.</p>
     *
     * @param tableName 인터페이스 테이블명 ({@code schema.tableName} 형식, {@code $} 치환)
     * @return 미처리 메시지 목록. 없으면 빈 리스트
     * @see com.dongkuk.caravan.hub.inbound.db.DbInboundHandler#pollAndSend(String, String)
     */
    List<Map<String, Object>> selectPendingMessages(@Param("TABLE_NAME") String tableName);

    /**
     * 처리 성공 상태로 업데이트한다 ({@code IF_FLAG='Y'}).
     *
     * <p>{@code U_AT}를 WHERE 조건에 포함하여 낙관적 락(Optimistic Lock)을 구현한다.
     * 다른 프로세스가 먼저 처리했으면 UPDATE가 0건이 된다.
     * 업데이트 시 {@code U_USR_ID/U_SVC_ID/U_PGM_ID/VER} 도 함께 갱신된다.</p>
     *
     * @param tableName       인터페이스 테이블명 ({@code schema.tableName} 형식)
     * @param updatedAt       낙관적 락용 타임스탬프 (SELECT 시 조회된 {@code U_AT} 값)
     * @param transactionCode 트랜잭션 코드
     * @param ifDate          처리 일자 ({@code yyyyMMdd} 형식)
     * @param ifTime          처리 시각 ({@code HHmmss} 형식)
     * @param now             현재 시각 (새 {@code U_AT} 값)
     * @return 업데이트된 행 수 (0이면 다른 프로세스가 먼저 처리)
     */
    int updateSuccess(@Param("TABLE_NAME") String tableName,
                      @Param("U_AT") Object updatedAt,
                      @Param("TRANSACTION_CODE") String transactionCode,
                      @Param("IF_DATE") String ifDate,
                      @Param("IF_TIME") String ifTime,
                      @Param("NOW") LocalDateTime now);

    /**
     * 처리 실패 상태로 업데이트한다 ({@code IF_FLAG='E'}).
     *
     * <p>{@code U_AT}를 WHERE 조건에 포함하여 낙관적 락을 구현한다.</p>
     *
     * @param tableName       인터페이스 테이블명 ({@code schema.tableName} 형식)
     * @param updatedAt       낙관적 락용 타임스탬프 (SELECT 시 조회된 {@code U_AT} 값)
     * @param transactionCode 트랜잭션 코드
     * @param ifDate          처리 일자 ({@code yyyyMMdd} 형식)
     * @param ifTime          처리 시각 ({@code HHmmss} 형식)
     * @param now             현재 시각 (새 {@code U_AT} 값)
     * @return 업데이트된 행 수 (0이면 다른 프로세스가 먼저 처리)
     */
    int updateError(@Param("TABLE_NAME") String tableName,
                    @Param("U_AT") Object updatedAt,
                    @Param("TRANSACTION_CODE") String transactionCode,
                    @Param("IF_DATE") String ifDate,
                    @Param("IF_TIME") String ifTime,
                    @Param("NOW") LocalDateTime now);

    /**
     * OUTBOUND 수신 메시지를 인터페이스 테이블에 INSERT한다.
     *
     * <p>{@code IF_FLAG='N'}(미처리 상태)으로 삽입하며, cactus audit 9 컬럼 자동 채움:
     * <ul>
     *   <li>{@code C_AT / U_AT} = {@code #{NOW}}</li>
     *   <li>{@code C_USR_ID / U_USR_ID} = {@code 'SYSTEM'}</li>
     *   <li>{@code C_SVC_ID / U_SVC_ID} = {@code 'caravan-hub'}</li>
     *   <li>{@code C_PGM_ID / U_PGM_ID} = {@code 'DbOutboundHandler'}</li>
     *   <li>{@code VER} = {@code 0}</li>
     * </ul>
     * (caravan §17 SYSTEM/svc-tag/handler fallback 패턴 정합)</p>
     *
     * @param schema          DB 스키마명
     * @param tableName       테이블명 (스키마 미포함)
     * @param transactionCode 트랜잭션 코드
     * @param interfaceId     인터페이스 ID
     * @param interfaceMsg    인터페이스 메시지 본문
     * @param ifFlag          인터페이스 플래그 (통상 {@code "N"})
     * @param now             현재 시각 (C_AT / U_AT 동시 채움)
     * @return INSERT된 행 수
     * @see com.dongkuk.caravan.hub.outbound.db.DbOutboundHandler
     */
    int insertOutboundData(@Param("schema") String schema,
                           @Param("tableName") String tableName,
                           @Param("TRANSACTION_CODE") String transactionCode,
                           @Param("INTERFACE_ID") String interfaceId,
                           @Param("INTERFACE_MSG") String interfaceMsg,
                           @Param("IF_FLAG") String ifFlag,
                           @Param("NOW") LocalDateTime now);
}
