#!/usr/bin/env node

/**
 * Phase 1: Legacy System Analysis - Service XML Structure Extraction
 *
 * 기능:
 * 1. Service XML 파싱 (파일 검색 제외)
 * 2. Activity 목록 추출
 * 3. Activity 타입 자동 분류 (common/custom/framework)
 * 4. Property 정보 추출
 * 5. structure.json 생성
 * 6. 자동 디렉토리 생성 및 검증 (docs/analysis/service/[ui|nui]/.temp/)
 *
 * 출력 디렉토리:
 * - 자동 생성: docs/analysis/service/[ui|nui]/.temp/
 * - ui/nui 판정: SERVICE-ID가 B로 시작하면 nui, 그 외(M, C10X 등)는 ui
 * - 생성 검증: 디렉토리 존재 여부 확인 및 오류 처리
 * - 파일 검증: 저장 후 파일 존재 및 크기 확인
 *
 * 사용법:
 * node phase1-analyzer.js <SERVICE-ID> <PROJECT-ROOT>
 *
 * 예시:
 * node phase1-analyzer.js M173020030 "."
 *
 * 출력 예시:
 * 📁 출력 디렉토리 확인: docs/analysis/service/ui/.temp
 * 📂 디렉토리 생성: docs/analysis
 * ✅ 디렉토리 생성 완료: docs/analysis
 * 📂 디렉토리 생성: docs/analysis/service/ui
 * ✅ 디렉토리 생성 완료: docs/analysis/service/ui
 * 📂 디렉토리 생성: docs/analysis/service/ui/.temp
 * ✅ 디렉토리 생성 완료: docs/analysis/service/ui/.temp
 */

const fs = require('fs');
const path = require('path');

/**
 * 디렉토리 안전 생성 유틸리티 함수
 * @param {string} targetDir - 생성할 디렉토리 경로
 * @param {boolean} verbose - 상세 출력 여부
 * @returns {boolean} 생성 성공 여부
 */
function ensureDirectoryExists(targetDir, verbose = true) {
  try {
    // 경로 정규화
    const normalizedDir = path.normalize(targetDir);

    // 이미 존재하는지 확인
    if (fs.existsSync(normalizedDir)) {
      if (verbose) {
        console.log(`✅ 디렉토리 존재함: ${normalizedDir}`);
      }
      return true;
    }

    // 상위 디렉토리부터 순차적으로 생성
    const dirsToCreate = [];
    let currentDir = normalizedDir;

    while (!fs.existsSync(currentDir) && currentDir !== path.dirname(currentDir)) {
      dirsToCreate.unshift(currentDir);
      currentDir = path.dirname(currentDir);
    }

    // 생성 필요한 디렉토리 순차적 생성
    for (const dir of dirsToCreate) {
      if (!fs.existsSync(dir)) {
        console.log(`📂 디렉토리 생성: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });

        // 생성 검증
        if (!fs.existsSync(dir)) {
          throw new Error(`디렉토리 생성 실패: ${dir}`);
        }

        if (verbose) {
          console.log(`✅ 디렉토리 생성 완료: ${dir}`);
        }
      }
    }

    return true;
  } catch (error) {
    if (verbose) {
      console.error(`❌ 디렉토리 생성 오류: ${error.message}`);
    }
    return false;
  }
}

/**
 * 파일 안전 저장 유틸리티 함수
 * @param {string} filePath - 저장할 파일 경로
 * @param {string|object} data - 저장할 데이터
 * @param {boolean} verbose - 상세 출력 여부
 * @returns {boolean} 저장 성공 여부
 */
function safeWriteFile(filePath, data, verbose = true) {
  try {
    const normalizedPath = path.normalize(filePath);

    // 데이터 JSON 형식으로 변환
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    console.log(`💾 파일 저장 중...: ${normalizedPath}`);

    fs.writeFileSync(normalizedPath, content, 'utf-8');

    // 저장 검증
    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`파일 저장 실패: ${normalizedPath}`);
    }

    // 파일 정보 확인
    const stats = fs.statSync(normalizedPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);

    if (verbose) {
      console.log(`✅ 파일 저장 완료: ${normalizedPath}`);
      console.log(`📊 파일 크기: ${fileSizeKB} KB`);
    }

    return true;
  } catch (error) {
    if (verbose) {
      console.error(`❌ 파일 저장 오류: ${error.message}`);
    }
    return false;
  }
}

/**
 * Service XML 파싱 (모든 property 수집)
 */
function parseServiceXml(xmlContent) {
  const activities = [];

  // <activity> 태그 추출 정규식
  const activityRegex = /<activity[^>]*name="([^"]*)"[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/activity>/g;
  let activityMatch;

  while ((activityMatch = activityRegex.exec(xmlContent)) !== null) {
    const name = activityMatch[1];
    const className = activityMatch[2];
    const content = activityMatch[3];
    const properties = {};

    // 각 activity 내 모든 property 추출 (name과 value 속성)
    const propRegex = /<property\s+name="([^"]*)"[^>]*value="([^"]*)"[^>]*\/>/g;
    let propMatch;

    while ((propMatch = propRegex.exec(content)) !== null) {
      const key = propMatch[1];
      const value = propMatch[2];
      properties[key] = value;
    }

    // transition 정보 추출 (success → value)
    const transitionMatch = content.match(/<transition\s+name="success"[^>]*value="([^"]*)"/);
    const transition = transitionMatch ? `success → ${transitionMatch[1]}` : undefined;

    activities.push({
      name,
      class: className,
      type: classifyActivityType(className),
      transition,
      properties: Object.keys(properties).length > 0 ? properties : undefined
    });
  }

  return activities;
}

/**
 * Activity properties에서 잠재적 SQL 키 수집 (dao가 있는 경우만)
 * @param {Object} activity - activity 객체
 * @returns {Array} 잠재적 SQL 키 배열 (dao 없으면 빈 배열)
 */
function extractPotentialSqlKeys(activity) {
  if (!activity.properties || !activity.properties.dao) {
    return [];
  }

  const potentialSqlKeys = [];
  const sqlKeywords = ['select', 'insert', 'update', 'delete', 'sql'];

  for (const [key, value] of Object.entries(activity.properties)) {
    // dao 속성과 빈 값은 제외
    if (key === 'dao' || !value || typeof value !== 'string') {
      continue;
    }

    // SQL 키워드가 포함된 키만 수집
    const hasSqlKeyword = sqlKeywords.some(keyword =>
      key.toLowerCase().includes(keyword)
    );

    if (hasSqlKeyword) {
      potentialSqlKeys.push({
        activityName: activity.name,
        propertyKey: key,      // 원래 키 이름 (select-sql, if-sql 등)
        sqlKey: value,         // SQL 키 값
        source: 'dao_activity' // 출처 표시
      });
    }
  }

  return potentialSqlKeys;
}

/**
 * Activity 타입 분류
 * - common: class에 ".common." 포함
 * - custom: class에 "com.unionsteel.mes" 포함
 * - built-in: com.poscoict.glue 또는 com.posdata.glue
 * - framework: 그 외
 */
function classifyActivityType(className) {
  if (className.includes('.common.')) {
    return 'common';
  }
  if (className.includes('com.unionsteel.mes')) {
    return 'custom';
  }
  if (className.includes('com.poscoict.glue') || className.includes('com.posdata.glue')) {
    return 'built-in';
  }
  return 'framework';
}

/**
 * PosSubBizControlActivity를 가진 activity에서 서브서비스 정보 추출
 * @param {Array} activities - parseServiceXml()에서 반환된 activity 배열
 * @returns {Array} 서브서비스 정보 배열 (중복 제거, callers 통합)
 */
function extractSubServices(activities) {
  var subServiceMap = {};
  activities.forEach(function(a) {
    if (a.class === 'com.posdata.glue.biz.activity.PosSubBizControlActivity'
        && a.properties && a.properties.ServiceName) {
      var serviceName = a.properties.ServiceName;
      var serviceId = serviceName.replace('-service', '');
      if (!subServiceMap[serviceId]) {
        subServiceMap[serviceId] = {
          serviceId: serviceId,
          serviceName: serviceName,
          serviceType: serviceId.startsWith('B') ? 'nui' : 'ui',
          newTransaction: a.properties['new-transacion'] || 'true',
          callers: []
        };
      }
      subServiceMap[serviceId].callers.push(a.name);
    }
  });
  var keys = Object.keys(subServiceMap);
  var result = [];
  for (var i = 0; i < keys.length; i++) {
    result.push(subServiceMap[keys[i]]);
  }
  return result;
}

/**
 * 프로세스 코드 추출
 * - B로 시작: 'B' 제거 후 다음 2자 + 다음 자리 = B47R1001 → m47
 * - M으로 시작: 앞 3자 소문자 = M472040010 → m47
 */
function extractProcessCode(serviceId) {
  if (serviceId.substring(1, 3).toLowerCase() === '10') {
    return 'c10'
  } else {
    return 'm' + serviceId.substring(1, 3).toLowerCase();
  }
  throw new Error(`Invalid SERVICE-ID format: ${serviceId}`);
}

/**
 * 메인 함수
 */
async function main() {
  try {
    // 1. 매개변수 검증
    const serviceId = process.argv[2];
    const legacyRootPath = process.argv[3];

    if (!serviceId || !legacyRootPath) {
      console.error('❌ 사용법: node phase1-analyzer.js <SERVICE-ID> <PROJECT-ROOT>');
      console.error('   예시: node phase1-analyzer.js M173020030 "."');
      process.exit(1);
    }

    // 스킵 체크: 출력 파일이 이미 존재하면 건너뛰기 (ui/nui 양쪽 확인)
    const forceRun = process.argv.includes('--force');
    const earlyOutputPathUi = path.join('docs', 'analysis', 'service', 'ui', '.temp', `${serviceId}_structure.json`);
    const earlyOutputPathNui = path.join('docs', 'analysis', 'service', 'nui', '.temp', `${serviceId}_structure.json`);
    const earlyOutputPath = fs.existsSync(earlyOutputPathUi) ? earlyOutputPathUi : earlyOutputPathNui;
    if (!forceRun && fs.existsSync(earlyOutputPath)) {
      console.log(`⏭️ Phase 1 스킵: 이미 존재함 → ${earlyOutputPath}`);
      console.log('   재생성하려면 --force 옵션을 사용하세요.');
      process.exit(0);
    }

    console.log(`\n🔍 Phase 1 시작: ${serviceId}`);
    console.log(`📁 프로젝트 루트: ${legacyRootPath}`);

    // 2. 프로세스 코드 추출
    const processCode = extractProcessCode(serviceId);
    console.log(`📝 프로세스 코드: ${processCode}`);

    // 3. Service XML 경로 설정
    const serviceXmlPath = path.join(legacyRootPath, 'src', 'service', `${serviceId}-service.xml`);
    console.log(`🔍 Service XML 경로: ${serviceXmlPath}`);

    // 4. Service XML 파일 존재 확인
    if (!fs.existsSync(serviceXmlPath)) {
      console.error(`❌ Service XML 파일을 찾을 수 없습니다: ${serviceXmlPath}`);
      process.exit(1);
    }

    // 5. Service XML 읽기 및 파싱
    console.log('📖 Service XML 읽는 중...');
    const xmlContent = fs.readFileSync(serviceXmlPath, 'utf-8');

    // Service 이름 추출 (service 태그의 name 속성)
    const serviceNameMatch = xmlContent.match(/<service[^>]*name="([^"]*)"/);
    const serviceName = serviceNameMatch ? serviceNameMatch[1] : serviceId;

    // Activity 추출
    console.log('🔗 Activity 분석 중...');
    const activities = parseServiceXml(xmlContent);

    console.log(`   총 ${activities.length}개 Activity 발견`);
    const builtInCount = activities.filter(a => a.type === 'built-in').length;
    const commonCount = activities.filter(a => a.type === 'common').length;
    const customCount = activities.filter(a => a.type === 'custom').length;
    const frameworkCount = activities.filter(a => a.type === 'framework').length;
    if (builtInCount > 0) console.log(`   - Built-in: ${builtInCount}개`);
    if (commonCount > 0) console.log(`   - Common: ${commonCount}개`);
    if (customCount > 0) console.log(`   - Custom: ${customCount}개`);
    if (frameworkCount > 0) console.log(`   - Framework: ${frameworkCount}개`);

    // 6. 초기 Activity 추출 (initial 속성)
    const initialActivityMatch = xmlContent.match(/initial="([^"]*)"/);
    const initialActivity = initialActivityMatch ? initialActivityMatch[1] : activities[0]?.name || null;

    // 7. 커스텀 Activity 목록 추출
    const customActivities = activities
      .filter(a => a.type === 'custom')
      .map(a => a.class);

    // const customActivities = activities
    //   .filter(a => a.type === 'custom')
    //   .map(a => ({
    //     className: a.class,
    //     package: a.class.substring(0, a.class.lastIndexOf('.')),
    //     method: 'doMainActivity',
    //     description: `Activity: ${a.name}`
    //   }));

    // 8. 관련 SQL 파일 경로
    const sqlFilePath = path.join(legacyRootPath, 'src', 'query', `${serviceId}.glue_sql`);
    const sqlFileExists = fs.existsSync(sqlFilePath);

    // 9. 데이터 플로우 분석
    const daoActivities = activities.filter(a => a.properties && a.properties.dao);
    console.log(`   - DAO Activities: ${daoActivities.length}개`);

    // dao가 있는 activity에서 잠재적 SQL 키 수집
    const potentialSqlQueries = daoActivities
      .flatMap(a => extractPotentialSqlKeys(a));

    // 기존 sqlkey도 수집 (dao가 없는 activity 포함)
    const traditionalSqlQueries = activities
      .filter(a => a.properties && a.properties.sqlkey)
      .map(a => ({
        activityName: a.name,
        propertyKey: 'sqlkey',
        sqlKey: a.properties.sqlkey,
        source: 'sqlkey'
      }));

    // 최종 SQL 키 목록 (중복 제거)
    const allSqlKeys = [
      ...traditionalSqlQueries,
      ...potentialSqlQueries
    ].filter((item, index, arr) =>
      arr.findIndex(x => x.sqlKey === item.sqlKey) === index
    );

    // 기존 방식 호환성 유지
    const sqlQueries = allSqlKeys.map(item => item.sqlKey);

    const javaSqlQueries = [];

    const dataKeys = activities
      .filter(a => a.properties && (a.properties.resultkey || a.properties['bind-result']))
      .map(a => a.properties.resultkey || a.properties['bind-result']);

    // 10. 서브서비스 추출
    const subServices = extractSubServices(activities);
    if (subServices.length > 0) {
      console.log(`   - Sub Services: ${subServices.length}개`);
      subServices.forEach(function(s) {
        console.log(`     · ${s.serviceId} (호출: ${s.callers.join(', ')})`);
      });
    }

    // 11. structure.json 생성
    // 서비스 타입 판정: B로 시작하면 nui, 그 외는 JSP 존재 여부로 판정
    var serviceType;
    if (serviceId.startsWith('B')) {
      serviceType = 'nui';
    } else {
      var jspPattern = path.join(legacyRootPath, 'WebContents', serviceId + '*.jsp');
      var jspFiles = require('child_process').execSync('ls ' + jspPattern + ' 2>/dev/null || true').toString().trim();
      serviceType = jspFiles.length > 0 ? 'ui' : 'nui';
    }
    const structure = {
      serviceInfo: {
        serviceId,
        serviceName,
        serviceType,
        initialActivity,
        processCode,
        analysisDate: new Date().toISOString().split('T')[0]
      },
      serviceStructure: {
        activities
      },
      dataFlow: {
        sqlQueries: sqlQueries.length > 0 ? sqlQueries : undefined,
        potentialSqlQueries: potentialSqlQueries.length > 0 ? potentialSqlQueries : undefined,
        traditionalSqlQueries: traditionalSqlQueries.length > 0 ? traditionalSqlQueries : undefined,
        javaSqlQueries,
        dataKeys: dataKeys.length > 0 ? dataKeys : undefined,

        // 추가 메타데이터
        sqlMetadata: {
          daoActivityCount: daoActivities.length,
          totalSqlKeysFound: allSqlKeys.length,
          potentialSqlKeysFound: potentialSqlQueries.length,
          traditionalSqlKeysFound: traditionalSqlQueries.length
        }
      },
      customActivities: [...customActivities],
      relatedFiles: {
        serviceXml: `./src/service/${serviceId}-service.xml`,
        sqlFile: sqlFileExists ? `./src/query/${serviceId}.glue_sql` : undefined
      },
      subServices: subServices.length > 0 ? subServices : undefined
    };

    // 7. 출력 디렉토리 생성 및 검증 (ui/nui 판정: M→ui, B→nui)
    const outputDir = path.join('docs', 'analysis', 'service', serviceType, '.temp');
    console.log(`📁 출력 디렉토리 확인: ${outputDir}`);

    if (!ensureDirectoryExists(outputDir, true)) {
      throw new Error(`출력 디렉토리 생성 실패: ${outputDir}`);
    }

    // 8. structure.json 저장 및 검증
    const outputPath = path.join(outputDir, `${serviceId}_structure.json`);
    console.log(`💾 structure.json 저장 중...`);

    if (!safeWriteFile(outputPath, structure, true)) {
      throw new Error(`structure.json 저장 실패: ${outputPath}`);
    }

    console.log(`\n✅ Phase 1 완료!`);
    console.log(`📄 출력: ${outputPath}`);
    console.log(`\n📊 수집 결과:`);
    console.log(`   - Service ID: ${serviceId}`);
    console.log(`   - Activities: ${activities.length}개`);
    console.log(`   - Custom Activities: ${customCount}개`);
    console.log(`   - DAO Activities: ${daoActivities.length}개`);
    console.log(`   - Total SQL Keys Found: ${allSqlKeys.length}개`);
    console.log(`   - Potential SQL Keys: ${potentialSqlQueries.length}개`);
    console.log(`   - Traditional SQL Keys: ${traditionalSqlQueries.length}개`);
    if (subServices.length > 0) {
      console.log(`   - Sub Services: ${subServices.length}개`);
    }

    // 9. 결과 JSON 출력 (스크립트 실행 결과로 반환)
    console.log('\n🎉 structure.json 생성 완료:');
    console.log(JSON.stringify(structure, null, 2));

  } catch (error) {
    console.error(`\n❌ 오류 발생:`, error.message);
    process.exit(1);
  }
}

// Main 실행
main();
