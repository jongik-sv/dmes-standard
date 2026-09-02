package com.dongkuk.caravan.hub.mapper;

import com.dongkuk.caravan.hub.config.MstMapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * caravan-hub 설정 테이블 조회 Mapper (MST DataSource).
 *
 * <p>{@code TB_CARAVAN_HUB_CONFIG} 및 {@code TB_MCM_MOM_KAFKA_TOPICS} 테이블에서
 * INBOUND/OUTBOUND 설정 정보를 조회한다.</p>
 *
 * <p>MST DataSource를 사용하며, SQL XML은 {@code mapper/mst/CaravanHubConfigMapper.xml}에 위치한다.</p>
 *
 * @see com.dongkuk.caravan.hub.config.MstMapper
 * @see com.dongkuk.caravan.hub.config.DataSourceConfig.MstDataSourceConfig
 */
@MstMapper
public interface CaravanHubConfigMapper {

    /**
     * 활성화된 DB INBOUND 폴링 토픽 목록을 조회한다.
     *
     * <p>{@code DIRECTION='INBOUND'}, {@code INTEGRATION_TYPE='DB'}, {@code USE_YN='Y'}인
     * 설정을 조회하며, {@code TB_MCM_MOM_KAFKA_TOPICS}와 조인하여 {@code USE_TP='Y'}인 토픽만 반환한다.</p>
     *
     * <p>반환 Map 키:</p>
     * <ul>
     *   <li>{@code TOPIC_ID} - Kafka 토픽 ID</li>
     *   <li>{@code TABLE_NAME} - {@code DB_SCHEMA.DB_TABLE_NAME} 형식 (예: {@code IFUSER.IF_MMPPMMCMTT01})</li>
     *   <li>{@code POLLING_INTERVAL_MS} - 폴링 주기 (ms, NULL이면 기본 1000ms)</li>
     *   <li>{@code GROUP_ID} - Kafka Consumer 그룹 ID</li>
     * </ul>
     *
     * @return 활성 DB INBOUND 토픽 목록. 없으면 빈 리스트
     * @see com.dongkuk.caravan.hub.inbound.db.DbInboundRouteManager
     */
    List<Map<String, Object>> selectDbInboundConfigs();

    /**
     * 활성화된 FILE INBOUND 폴링 설정 목록을 조회한다.
     *
     * <p>{@code DIRECTION='INBOUND'}, {@code INTEGRATION_TYPE='FILE'}, {@code USE_YN='Y'}인
     * 설정을 조회한다. DB INBOUND와 동일한 구조에 SFTP 접속 정보가 추가된다.</p>
     *
     * <p>반환 Map 키 (DB INBOUND 항목에 추가):</p>
     * <ul>
     *   <li>{@code FILE_PATH} - SFTP 원본 파일 경로</li>
     *   <li>{@code BACKUP_PATH} - SFTP 백업 파일 경로</li>
     *   <li>{@code FTP_HOST}, {@code FTP_PORT}, {@code FTP_USER}, {@code FTP_PASSWORD} - SFTP 접속 정보</li>
     * </ul>
     *
     * @return 활성 FILE INBOUND 설정 목록. 없으면 빈 리스트
     * @see com.dongkuk.caravan.hub.inbound.file.FileInboundRouteManager
     */
    List<Map<String, Object>> selectFileInboundConfigs();

    /**
     * OUTBOUND 설정을 조회한다.
     *
     * <p>{@code DIRECTION='OUTBOUND'}, {@code USE_YN='Y'}인 설정을 토픽 ID로 조회한다.
     * {@code INTEGRATION_TYPE}에 따라 사용되는 컬럼이 다르다:</p>
     * <ul>
     *   <li>DB: {@code DB_TABLE_NAME}, {@code DB_SCHEMA}</li>
     *   <li>HTTP: {@code HTTP_URL}, {@code HTTP_METHOD}, {@code HTTP_HEADERS}(옵셔널 JSON — {@code ${ENV}} 치환)</li>
     *   <li>FILE: {@code FILE_PATH}, {@code FTP_HOST}, {@code FTP_PORT}, {@code FTP_USER}, {@code FTP_PASSWORD}</li>
     * </ul>
     *
     * @param topicId Kafka 토픽 ID
     * @return OUTBOUND 설정 정보. 없으면 {@code null}
     * @see com.dongkuk.caravan.hub.outbound.OutboundDispatchRoute
     */
    Map<String, Object> selectOutboundConfig(@Param("TOPIC_ID") String topicId);

    /**
     * 테이블명이 SERAI_CONFIG에 등록된 유효한 테이블인지 검증한다.
     *
     * <p>MyBatis XML에서 {@code ${TABLE_NAME}}은 문자열 치환(PreparedStatement가 아님)이므로
     * SQL Injection 방지를 위해 실제 등록된 테이블인지 확인해야 한다.</p>
     *
     * <p>{@code DB_SCHEMA || '.' || DB_TABLE_NAME}이 전달된 값과 일치하고
     * {@code USE_YN='Y'}인 건수를 반환한다.</p>
     *
     * @param tableName 검증할 테이블명 ({@code schema.tableName} 형식)
     * @return 일치하는 설정 건수 (0이면 유효하지 않음)
     * @see com.dongkuk.caravan.hub.inbound.db.DbInboundHandler
     */
    int isValidTableName(@Param("schema") String schema, @Param("tableName") String tableName);
}
