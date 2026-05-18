import { Octokit } from "@octokit/rest";
import fs from 'fs-extra';
import path from 'node:path';

export async function pullFromGithub(repoName: string, token: string, targetDir: string) {
  const octokit = new Octokit({ auth: token });
  
  console.log(`📥 Pulling repository: ${repoName}...`);
  
  try {
    const { data: user } = await octokit.users.getAuthenticated();
    const owner = user.login;

    // 1. Get the latest commit on main
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo: repoName,
      ref: 'heads/main'
    });
    const latestCommitSha = ref.object.sha;

    // 2. Get the tree recursively
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo: repoName,
      tree_sha: latestCommitSha,
      recursive: 'true'
    });

    console.log(`📦 Found ${tree.tree.length} items in remote tree.`);
    
    // 3. Download and write files
    for (const item of tree.tree) {
      if (item.type === 'blob' && item.path) {
        const filePath = path.join(targetDir, item.path);
        
        // Skip some files if necessary (e.g. .env)
        if (item.path === '.env' || item.path.includes('node_modules')) continue;

        console.log(`  ⬇️ Fetching: ${item.path}`);
        
        const { data } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: item.path
        });

        if (!Array.isArray(data) && 'content' in data) {
          const content = Buffer.from(data.content, 'base64');
          await fs.ensureDir(path.dirname(filePath));
          await fs.writeFile(filePath, content);
        }
      }
    }

    console.log(`✨ Successfully pulled all files to ${targetDir}!`);
    return true;

  } catch (error: any) {
    console.error('❌ Failed to pull:', error.message);
    throw error;
  }
}
