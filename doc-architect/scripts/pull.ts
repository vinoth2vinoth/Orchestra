import { pullFromGithub } from '../src/puller.js';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

async function run() {
    const token = process.env.GITHUB_TOKEN;
    const repoName = "DocArchitect"; 
    const targetDir = path.join(process.cwd(), 'doc-architect');

    if (!token) {
        console.error("❌ Error: GITHUB_TOKEN is not set in environment variables.");
        console.log("Please add your GitHub Personal Access Token to the Settings menu.");
        process.exit(1);
    }

    try {
        await pullFromGithub(repoName, token, targetDir);
        console.log(`\n✅ Local workspace is now in sync with GitHub!`);
    } catch (err) {
        process.exit(1);
    }
}

run();
