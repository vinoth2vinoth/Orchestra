import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { AutonomousDaemon } from '../src/framework/orchestration/AutonomousDaemon.ts';
import { readProjectBoard } from '../src/framework/tools/ProjectBoardStore.ts';

const projectPath = path.join(process.cwd(), 'workspace', 'projects.json');

class TestDaemon extends AutonomousDaemon {
  public executions: Array<{ projectId: string; taskId: string }> = [];

  constructor(private readonly result: any = 'daemon completed', options: { now?: () => number; staleTaskMs?: number; maxAttempts?: number } = {}) {
    super(100000, options);
  }

  protected async executeSwarmTask(project: any, task: any): Promise<any> {
    this.executions.push({ projectId: project.id, taskId: task.id });
    return this.result;
  }

  public async exposeFinalize(projectId: string, taskId: string, runId: string, result: any, isError = false) {
    await this.finalizeTask(projectId, taskId, runId, result, isError);
  }
}

function writeBoard(board: any) {
  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  fs.writeFileSync(projectPath, `${JSON.stringify(board, null, 2)}\n`, 'utf8');
}

async function waitForStatus(taskId: string, status: string, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const board = await readProjectBoard();
    const task = board.projects.flatMap((project: any) => project.tasks || []).find((item: any) => item.id === taskId);
    if (task?.status === status) return task;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${taskId} to become ${status}`);
}

async function withBoardFixture(run: () => Promise<void>) {
  const hadOriginal = fs.existsSync(projectPath);
  const original = hadOriginal ? fs.readFileSync(projectPath, 'utf8') : '';
  try {
    await run();
  } finally {
    if (hadOriginal) {
      fs.writeFileSync(projectPath, original, 'utf8');
    } else if (fs.existsSync(projectPath)) {
      fs.unlinkSync(projectPath);
    }
  }
}

async function testTodoTaskIsLeasedAndCompleted() {
  await withBoardFixture(async () => {
    writeBoard({
      projects: [{
        id: 'daemon-project',
        name: 'Daemon Project',
        tasks: [{
          id: 'task-todo',
          title: 'Run background AI Agent task',
          status: 'TODO',
          assignee: 'AI Bot'
        }]
      }]
    });

    const daemon = new TestDaemon('finished cleanly');
    await daemon.runOnce();
    const task = await waitForStatus('task-todo', 'DONE');

    assert.equal(daemon.executions.length, 1);
    assert.equal(task.daemonAttempts, 1);
    assert.equal(task.daemonLease, undefined);
    assert(String(task.description).includes('finished cleanly'));
  });
}

async function testExpiredTaskIsRequeuedAndRetried() {
  await withBoardFixture(async () => {
    writeBoard({
      projects: [{
        id: 'daemon-project',
        name: 'Daemon Project',
        tasks: [{
          id: 'task-expired',
          title: 'Recover stale task',
          status: 'IN_PROGRESS',
          assignee: 'AI Swarm',
          daemonAttempts: 1,
          daemonLease: {
            runId: 'old-run',
            startedAt: 100,
            expiresAt: 200
          }
        }]
      }]
    });

    const daemon = new TestDaemon('retry completed', { now: () => 1000, staleTaskMs: 5000, maxAttempts: 3 });
    await daemon.runOnce();
    const task = await waitForStatus('task-expired', 'DONE');

    assert.equal(daemon.executions.length, 1);
    assert.equal(task.daemonAttempts, 2);
    assert.equal(task.daemonLease, undefined);
    assert(String(task.description).includes('old-run'));
    assert(String(task.description).includes('retry completed'));
  });
}

async function testExpiredTaskBlocksAfterMaxAttempts() {
  await withBoardFixture(async () => {
    writeBoard({
      projects: [{
        id: 'daemon-project',
        name: 'Daemon Project',
        tasks: [{
          id: 'task-maxed',
          title: 'Do not retry forever',
          status: 'IN_PROGRESS',
          assignee: 'AI Bot',
          daemonAttempts: 3,
          daemonLease: {
            runId: 'maxed-run',
            startedAt: 100,
            expiresAt: 200
          }
        }]
      }]
    });

    const daemon = new TestDaemon('should not run', { now: () => 1000, staleTaskMs: 5000, maxAttempts: 3 });
    await daemon.runOnce();
    const board = await readProjectBoard();
    const task = board.projects[0].tasks[0];

    assert.equal(task.status, 'BLOCKED');
    assert.equal(task.daemonLease, undefined);
    assert.equal(daemon.executions.length, 0);
    assert(String(task.description).includes('Max retry count reached'));
  });
}

async function testLegacyInProgressTaskWithoutLeaseIsRecovered() {
  await withBoardFixture(async () => {
    writeBoard({
      projects: [{
        id: 'daemon-project',
        name: 'Daemon Project',
        tasks: [{
          id: 'task-legacy',
          title: 'Recover legacy in-progress task',
          status: 'IN_PROGRESS',
          assignee: 'AI Bot',
          daemonAttempts: 0
        }]
      }]
    });

    const daemon = new TestDaemon('legacy completed', { now: () => 1000, staleTaskMs: 5000, maxAttempts: 3 });
    await daemon.runOnce();
    const task = await waitForStatus('task-legacy', 'DONE');

    assert.equal(daemon.executions.length, 1);
    assert.equal(task.daemonAttempts, 1);
    assert.equal(task.daemonLease, undefined);
    assert(String(task.description).includes('legacy-unleased-run'));
    assert(String(task.description).includes('legacy completed'));
  });
}

async function testStaleFinalizeCannotOverwriteCurrentLease() {
  await withBoardFixture(async () => {
    writeBoard({
      projects: [{
        id: 'daemon-project',
        name: 'Daemon Project',
        tasks: [{
          id: 'task-current',
          title: 'Protect current run',
          status: 'IN_PROGRESS',
          assignee: 'AI Bot',
          daemonAttempts: 2,
          daemonLease: {
            runId: 'current-run',
            startedAt: Date.now(),
            expiresAt: Date.now() + 10000
          }
        }]
      }]
    });

    const daemon = new TestDaemon();
    await daemon.exposeFinalize('daemon-project', 'task-current', 'old-run', 'stale success');
    const board = await readProjectBoard();
    const task = board.projects[0].tasks[0];

    assert.equal(task.status, 'IN_PROGRESS');
    assert.equal(task.daemonLease.runId, 'current-run');
    assert(!String(task.description || '').includes('stale success'));
  });
}

const tests = [
  ['TODO daemon task is leased and completed', testTodoTaskIsLeasedAndCompleted],
  ['expired daemon task is requeued and retried', testExpiredTaskIsRequeuedAndRetried],
  ['expired daemon task blocks after max attempts', testExpiredTaskBlocksAfterMaxAttempts],
  ['legacy in-progress task without lease is recovered', testLegacyInProgressTaskWithoutLeaseIsRecovered],
  ['stale finalize cannot overwrite current lease', testStaleFinalizeCannotOverwriteCurrentLease]
] as const;

const results = [];
for (const [name, run] of tests) {
  const start = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - start });
  } catch (err: any) {
    results.push({ name, ok: false, error: err.message, ms: Date.now() - start });
  }
}

console.log(JSON.stringify(results, null, 2));
if (results.some(result => !result.ok)) process.exit(1);
