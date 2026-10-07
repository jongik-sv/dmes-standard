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
 * PC 잠금은 복제 직전부터 빌드가 끝나 PDB 를 지울 때까지(시험 JVM 이 도는 구간 포함) `pdb.mjs lock-hold` 가 쥔다.
 * 그래서 PC 전체에서 Oracle 을 쓰는 시험 빌드는 한 번에 하나만 돈다. 기존 PDB 를 쓰는 existing 모드도 같다.
 * 잠금 주인은 node 프로세스이고 표준 입력이 닫히면(Gradle 이 죽어도) 스스로 놓는다.
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
    Process lockHolder = null
    long lockPid = 0

    /** 시험 PDB 이름을 돌려준다. 처음 부를 때 복제한다. */
    synchronized String acquire() {
        if (pdbName != null) return pdbName
        holdPcLock()
        try {
            return acquireLocked()
        } catch (Exception e) {
            logVmState('PDB 준비 실패')
            throw e
        }
    }

    String acquireLocked() {
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

    /** PC 전체 Oracle 잠금을 쥔다(이미 쥐고 있으면 그대로). 기다리는 한도는 DMES_ORA_HARNESS_LOCK_WAIT_SEC(기본 7200초). */
    void holdPcLock() {
        if (lockHolder != null) return
        File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
        if (!script.isFile()) throw new org.gradle.api.GradleException("PDB 도구가 없다: ${script}")
        long waitSec = (System.getenv('DMES_ORA_HARNESS_LOCK_WAIT_SEC') ?: '7200') as long
        Process p = new ProcessBuilder(['node', script.absolutePath, 'lock-hold', '--wait-sec', String.valueOf(waitSec)])
                .redirectErrorStream(true).start()
        // 첫 줄 "LOCKED <pid>" 가 오면 잠금을 쥔 것이다. 이후 출력은 버린다(파이프가 막히지 않게 읽는다).
        def first = new java.util.concurrent.LinkedBlockingQueue<String>()
        Thread.start {
            String last = ''
            try {
                p.inputStream.eachLine { String l ->
                    if (l.startsWith('LOCKED')) first.offer(l) else last = l
                }
            } catch (Exception ignored) { }
            first.offer('종료: ' + last)
        }
        String line = first.poll(waitSec + 60, TimeUnit.SECONDS)
        if (line == null || !line.startsWith('LOCKED')) {
            p.destroyForcibly()
            throw new org.gradle.api.GradleException("PC Oracle 잠금을 잡지 못했다(${line ?: '시간 초과'}). 다른 레인의 Oracle 작업이 끝나지 않았을 수 있다.")
        }
        lockHolder = p
        lockPid = p.pid()
    }

    void releasePcLock() {
        if (lockHolder == null) return
        try { lockHolder.outputStream.close() } catch (Exception ignored) { }
        if (!lockHolder.waitFor(10, TimeUnit.SECONDS)) lockHolder.destroyForcibly()
        lockHolder = null
        lockPid = 0
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
        ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true)
        // 이 서비스가 PC 잠금을 쥐고 있으니 자식 pdb.mjs 는 잠금을 다시 잡지 않고 지나간다.
        if (lockPid > 0) pb.environment().put('DMES_ORA_LOCK_HELD', String.valueOf(lockPid))
        Process p = pb.start()
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

    /**
     * VM 상태(free·loadavg)를 한 줄 로그로 남긴다(Oracle 명령이 아니다: podman machine ssh). Oracle 시험·접속이 실패했을 때 VM 크기 축소(2GB)
     * 때문인지 가리려는 용도다. available 150MB 미만이거나 load 10 이상이면 「VM 의심」 을 붙인다. podman 이 아니거나 읽지 못하면 조용히 건너뛴다.
     */
    synchronized void logVmState(String reason) {
        try {
            String engine = System.getenv('DMES_ORA_ENGINE') ?: 'podman'
            if (engine != 'podman') return
            Process p = new ProcessBuilder([engine, 'machine', 'ssh', '--', 'free -m; cat /proc/loadavg']).redirectErrorStream(true).start()
            StringBuilder out = new StringBuilder()
            Thread t = Thread.start { p.inputStream.eachLine { out.append(it).append('\n') } }
            if (!p.waitFor(20, TimeUnit.SECONDS)) { p.destroyForcibly(); return }
            t.join(2000)
            def mem = out.toString().readLines().find { it.startsWith('Mem:') }?.trim()?.split(/\s+/)
            def load = out.toString().readLines().find { it ==~ /^\d+\.\d+ \d+\.\d+ \d+\.\d+ .*/ }?.trim()?.split(/\s+/)
            if (mem == null || mem.length < 7 || load == null) return
            long available = mem[6] as long
            double load1 = load[0] as double
            boolean suspect = available < 150 || load1 >= 10
            System.err.println("[dmes-ora] ${reason}: VM available=${available}MB load=${load[0]} ${load[1]} ${load[2]}" +
                    (suspect ? ' → VM 의심(재실행 전에 조정자에게 보고: scripts/oracle/README.md 「Oracle 오류 판별」)' : ' (VM 정상 범위)'))
        } catch (Exception ignored) {
            // VM 상태를 못 읽어도 시험 결과는 바꾸지 않는다.
        }
    }

    /** 시험 PDB 의 세션 수 최대치를 한 줄 로그로 남긴다(sqlplus 한 번, 실패해도 무시). */
    void logSessions() {
        try {
            File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
            ProcessBuilder pb = new ProcessBuilder(['node', script.absolutePath, 'sessions', pdbName]).redirectErrorStream(true)
            if (lockPid > 0) pb.environment().put('DMES_ORA_LOCK_HELD', String.valueOf(lockPid))
            Process p = pb.start()
            String text = p.inputStream.text.trim()
            if (!p.waitFor(60, TimeUnit.SECONDS)) { p.destroyForcibly(); return }
            String line = text.readLines().find { it.startsWith('sessions') } ?: text
            System.err.println("[dmes-ora] 시험 PDB ${pdbName} ${line}")
        } catch (Exception ignored) {
            // 세션 수를 못 세도 시험 결과는 바꾸지 않는다.
        }
    }

    @Override
    void close() {
        // 빌드 종료(성공·실패·취소)에서 불린다. 복제한 PDB 만 지운다.
        try {
            if (cloned && pdbName != null) {
                logSessions()
                try {
                    runPdb(['drop', pdbName], 600, true)
                } catch (Exception ignored) {
                    // 지우지 못해도 빌드 결과를 바꾸지 않는다 — 다음 시험이 같은 이름을 먼저 지운다.
                }
            }
        } finally {
            releasePcLock()
        }
    }
}
