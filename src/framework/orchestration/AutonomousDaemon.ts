import * as fs from 'fs';
import * as path from 'path';
import { globalEventStore } from '../core/EventStore.js';
import { Orchestrator, WorkflowConfig } from './Orchestrator.js';
import { WorkerAgent } from '../agents/WorkerAgent.js';
import { MemoryMesh } from '../memory/MemoryMesh.js';
import { globalRegistry } from '../agents/AgentRegistry.js';
import * as crypto from 'crypto';

const workspaceRoot = path.join(process.cwd(), 'workspace');
const STORAGE_PATH = 'projects.json';

export class AutonomousDaemon {
    private isRunning = false;
    private pollIntervalMs: number;
    private timer: NodeJS.Timeout | null = null;
    private memory = new MemoryMesh();

    constructor(pollIntervalMs = 15000) {
        this.pollIntervalMs = pollIntervalMs;
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log(`[AutonomousDaemon] Starting background monitoring loop (${this.pollIntervalMs}ms)`);
        this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
        
        // Execute first tick immediately
        this.tick();
    }

    public stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log(`[AutonomousDaemon] Stopped background monitoring`);
    }

    private async tick() {
        try {
            await this.processProjectsQueue();
        } catch (err: any) {
            console.error('[AutonomousDaemon] Tick failed:', err);
        }
    }

    private async processProjectsQueue() {
        const absolutePath = path.join(workspaceRoot, STORAGE_PATH);
        if (!fs.existsSync(absolutePath)) return;

        let dataStr = fs.readFileSync(absolutePath, 'utf8');
        if (!dataStr) return;

        const root = JSON.parse(dataStr);
        const projects = root.projects || [];
        let changesMade = false;

        for (const project of projects) {
            for (const task of project.tasks) {
                // Background heuristics: "Bot" or "Swarm" assignment + TODO/IN_PROGRESS state
                if (
                    task.status !== 'DONE' &&
                    task.assignee &&
                    (task.assignee.toLowerCase().includes('swarm') || task.assignee.toLowerCase().includes('bot') || task.assignee.toLowerCase().includes('ai'))
                ) {
                    if (task.status === 'TODO') {
                        console.log(`[AutonomousDaemon] Picking up background task: ${task.title}`);
                        
                        // Optimistically set to IN_PROGRESS
                        task.status = 'IN_PROGRESS';
                        changesMade = true;
                        
                        // Fire off async swarm operation without awaiting to unblock the daemon
                        this.executeSwarmTask(project, task).then(async (result) => {
                            await this.finalizeTask(project.id, task.id, result);
                        }).catch(async (err) => {
                            console.error(`[AutonomousDaemon] Background execution failed for ${task.id}:`, err);
                            await this.finalizeTask(project.id, task.id, `Failed: ${err.message}`, true);
                        });
                    }
                }
            }
        }

        if (changesMade) {
            fs.writeFileSync(absolutePath, JSON.stringify(root, null, 2), 'utf8');
        }
    }

    private async executeSwarmTask(project: any, task: any) {
        const orchestrator = new Orchestrator();
        const threadId = crypto.randomUUID();

        // Dynamically instantiate a temporary local agent for this exact daemon process
        const worker1 = new WorkerAgent(
            'DaemonWorker-Alfa',
            'You are an autonomous background worker. Analyze the project task and perform actions using your file system tools.',
            'WORKER',
            this.memory,
            { modelName: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY || '' },
            ['fileSystemRead', 'fileSystemWrite']
        );
        
        globalRegistry.register(worker1);

        const config: WorkflowConfig = {
            paradigm: 'SWARM',
            agents: [worker1],
            useDistributedQueue: false
        };

        const prompt = `Autonomous Background Task detected.\nProject: ${project.name}\nTask: ${task.title}\nDescription: ${task.description || 'None'}\n\nPlease take action. Update any files necessary to complete this task. Respond with a summary of what you did.`;

        globalEventStore.append({
            type: 'SYSTEM_HOOK',
            sourceAgentId: 'AUTONOMOUS_DAEMON',
            threadId,
            payload: { action: 'BACKGROUND_TASK_STARTED', taskId: task.id, title: task.title }
        });

        const result = await orchestrator.executeWorkflow(prompt, config, threadId);
        
        globalRegistry.clear(); // clean up temporary agent
        return result;
    }

    private async finalizeTask(projectId: string, taskId: string, daemonConclusion: any, isError = false) {
        // Re-read file to avoid race conditions
        const absolutePath = path.join(workspaceRoot, STORAGE_PATH);
        if (!fs.existsSync(absolutePath)) return;

        let dataStr = fs.readFileSync(absolutePath, 'utf8');
        const root = JSON.parse(dataStr);
        const projects = root.projects || [];
        let updated = false;

        const conclusionStr = typeof daemonConclusion === 'string' ? daemonConclusion : JSON.stringify(daemonConclusion);

        for (const project of projects) {
            if (project.id === projectId) {
                for (const t of project.tasks) {
                    if (t.id === taskId) {
                        t.status = isError ? 'TODO' : 'DONE';
                        t.description = (t.description ? t.description + '\n\n' : '') + `[Bot Output]:\n${conclusionStr.substring(0, 500)}`;
                        updated = true;
                    }
                }
            }
        }

        if (updated) {
           fs.writeFileSync(absolutePath, JSON.stringify(root, null, 2), 'utf8');
           console.log(`[AutonomousDaemon] Finalized task ${taskId}`);
        }
    }
}
