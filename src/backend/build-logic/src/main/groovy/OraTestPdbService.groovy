import org.gradle.api.services.BuildService
import org.gradle.api.services.BuildServiceParameters

import java.util.concurrent.TimeUnit

/**
 * 시험용 Oracle PDB 한 개를 빌드 한 번에 한 번만 복제하고 빌드가 끝나면 지우는 빌드 서비스(oracle-1007 b4).
 * dmes.test-conventions 가 켠 모듈의 Test 태스크가 시작할 때 acquire() 를 부르고, 접속값을 시스템 속성으로 넘긴다.
 *
 * 켜는 법(기본은 꺼짐 — 아무것도 하지 않는다):
 *   -Pdmes.ora.test=clone             템플릿(기본 TPL_EMPTY)에서 T_<레인> PDB 를 복제해 쓰고, 빌드가 끝나면 지운다
 *   -Pdmes.ora.template=TPL_DATA      복제 원본 템플릿(데이터까지 적재한 것)
 *   -Pdmes.ora.pdb=L_ORA_MDM          이미 있는 PDB 를 그대로 쓴다(복제·삭제 없음)
 * 같은 값을 환경 변수 DMES_ORA_TEST(clone)·DMES_ORA_TEMPLATE·DMES_ORA_PDB 로도 줄 수 있다.
 *
 * 복제·삭제는 scripts/oracle/pdb.mjs 가 한다(PC 전체 잠금·열린 PDB 상한을 거친다). 이 클래스는 node 를 부를 뿐이다.
 * 멤버에 private 을 두지 않는다 — Gradle 이 서비스를 하위 클래스로 감싸 클로저에서 private 에 닿지 못한다.
 */
abstract class OraTestPdbService implements BuildService<Parameters>, AutoCloseable {
    interface Parameters extends BuildServiceParameters {
        org.gradle.api.provider.Property<String> getRepoRoot()
        org.gradle.api.provider.Property<String> getLane()
        org.gradle.api.provider.Property<String> getMode()      // clone | existing
        org.gradle.api.provider.Property<String> getTemplate()
        org.gradle.api.provider.Property<String> getPdb()       // existing 일 때 PDB 이름
    }

    String pdbName
    boolean cloned = false

    /** 시험 PDB 이름을 돌려준다. 처음 부를 때 복제한다. */
    synchronized String acquire() {
        if (pdbName != null) return pdbName
        if (parameters.mode.get() == 'existing') {
            pdbName = parameters.pdb.get().toUpperCase()
            return pdbName
        }
        String name = 'T_' + parameters.lane.get().toUpperCase().replaceAll('[^A-Z0-9_]', '_')
        if (name.length() > 28) name = name.substring(0, 28)
        // 이전 시험이 비정상 종료돼 남긴 같은 이름 PDB 가 있으면 지운다(레인 하나가 이 이름 하나를 쓴다).
        runPdb(['drop', name], 600, true)
        runPdb(['clone', parameters.template.get().toUpperCase(), name], 1800, false)
        pdbName = name
        cloned = true
        return pdbName
    }

    static String jdbcUrl(String pdb) {
        String host = System.getenv('DMES_ORA_HOST') ?: 'localhost'
        String port = System.getenv('DMES_ORA_PORT') ?: '1521'
        return "jdbc:oracle:thin:@//${host}:${port}/${pdb}"
    }

    int runPdb(List<String> args, long timeoutSec, boolean ignoreFailure) {
        File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
        if (!script.isFile()) throw new org.gradle.api.GradleException("PDB 도구가 없다: ${script}")
        List<String> cmd = ['node', script.absolutePath] + args
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start()
        StringBuilder out = new StringBuilder()
        Thread t = Thread.start { p.inputStream.eachLine { out.append(it).append('\n') } }
        if (!p.waitFor(timeoutSec, TimeUnit.SECONDS)) {
            p.destroyForcibly()
            if (!ignoreFailure) throw new org.gradle.api.GradleException("pdb.mjs ${args} 시간 초과(${timeoutSec}초)")
            return -1
        }
        t.join(2000)
        if (p.exitValue() != 0 && !ignoreFailure) {
            throw new org.gradle.api.GradleException("pdb.mjs ${args} 실패(exit ${p.exitValue()})\n${out}")
        }
        return p.exitValue()
    }

    @Override
    void close() {
        // 빌드 종료(성공·실패·취소)에서 불린다. 복제한 PDB 만 지운다.
        if (cloned && pdbName != null) {
            try {
                runPdb(['drop', pdbName], 600, true)
            } catch (Exception ignored) {
                // 지우지 못해도 빌드 결과를 바꾸지 않는다 — 다음 시험이 같은 이름을 먼저 지운다.
            }
        }
    }
}
