import * as fs from 'fs-extra';
import * as path from 'path';
import { FileInfo } from './agents/base-agent';

export class RepositoryAnalyzer {
  private supportedExtensions = new Set([
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.h',
    '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj', '.hs',
    '.md', '.txt', '.json', '.yml', '.yaml', '.xml', '.html', '.css', '.scss',
    '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.tf'
  ]);

  async analyzeGithubRepo(repoUrl: string, pat?: string): Promise<FileInfo[]> {
    try {
      // Extract owner and repo from URL
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error('Invalid GitHub repository URL format');
      }
      
      const [, owner, repo] = match;
      const repoName = repo.replace('.git', '');
      
      // Use GitHub API to fetch repository contents
      return await this.fetchGithubRepoContents(owner, repoName, pat);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404')) {
        throw new Error('Repository not found or access denied. Please check the URL and ensure you have proper permissions.');
      }
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        throw new Error('Authentication failed. Please provide a valid GitHub Personal Access Token for private repositories.');
      }
      throw error;
    }
  }

  private async fetchGithubRepoContents(owner: string, repo: string, pat?: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    
    try {
      // Fetch repository tree recursively
      const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TechDocs-Generator'
      };
      
      if (pat) {
        headers['Authorization'] = `token ${pat}`;
      }
      
      const treeResponse = await fetch(treeUrl, { headers });
      
      if (!treeResponse.ok) {
        throw new Error(`GitHub API error: ${treeResponse.status} ${treeResponse.statusText}`);
      }
      
      const treeData = await treeResponse.json();
      
      // Filter and process files
      const filePromises = treeData.tree
        .filter((item: any) => item.type === 'blob' && this.shouldIncludeGithubFile(item.path, item.size || 0))
        .slice(0, 100) // Limit to prevent rate limiting
        .map(async (item: any) => {
          const content = await this.fetchGithubFileContent(owner, repo, item.sha, pat);
          if (content !== null) {
            return {
              path: item.path,
              content,
              language: this.detectLanguage(item.path),
              size: item.size || content.length
            };
          }
          return null;
        });
      
      const results = await Promise.all(filePromises);
      files.push(...results.filter((file): file is FileInfo => file !== null));
      
      // Sort by importance
      return files.sort((a, b) => {
        const aScore = this.getFileImportanceScore(a.path);
        const bScore = this.getFileImportanceScore(b.path);
        return bScore - aScore;
      });
      
    } catch (error) {
      console.error('Error fetching GitHub repository:', error);
      throw error;
    }
  }

  private async fetchGithubFileContent(owner: string, repo: string, sha: string, pat?: string): Promise<string | null> {
    try {
      const contentUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`;
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TechDocs-Generator'
      };
      
      if (pat) {
        headers['Authorization'] = `token ${pat}`;
      }
      
      const response = await fetch(contentUrl, { headers });
      
      if (!response.ok) {
        console.warn(`Failed to fetch file content for SHA ${sha}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      
      // GitHub API returns base64 encoded content
      if (data.encoding === 'base64') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        
        // Check if content is likely binary
        if (this.isBinaryContent(content)) return null;
        
        // Truncate very long files
        if (content.length > 50000) {
          return content.substring(0, 50000) + '\n... [truncated]';
        }
        
        return content;
      }
      
      return null;
    } catch (error) {
      console.warn(`Error fetching file content for SHA ${sha}:`, error);
      return null;
    }
  }

  private shouldIncludeGithubFile(filePath: string, size: number): boolean {
    // Skip very large files (> 1MB)
    if (size > 1024 * 1024) return false;
    
    // Skip common directories and files that aren't useful
    if (this.shouldSkipPath(filePath)) return false;
    
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    
    // Include supported extensions
    if (this.supportedExtensions.has(ext)) return true;
    
    // Include important files without extensions
    const importantFiles = [
      'readme', 'license', 'changelog', 'contributing', 'dockerfile',
      'makefile', 'rakefile', 'gemfile', 'package.json', 'composer.json',
      'requirements.txt', 'setup.py', 'pom.xml', 'build.gradle'
    ];
    
    return importantFiles.some(important => 
      filename.toLowerCase().includes(important)
    );
  }

  async analyzeLocalFolder(folderPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    
    await this.walkDirectory(folderPath, files, folderPath);
    
    // Sort by importance (certain file types first)
    return files.sort((a, b) => {
      const aScore = this.getFileImportanceScore(a.path);
      const bScore = this.getFileImportanceScore(b.path);
      return bScore - aScore;
    });
  }

  private async walkDirectory(
    currentPath: string, 
    files: FileInfo[], 
    basePath: string,
    depth = 0
  ): Promise<void> {
    if (depth > 10) return; // Prevent infinite recursion
    
    try {
      const items = await fs.readdir(currentPath);
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const relativePath = path.relative(basePath, itemPath);
        
        // Skip common directories that aren't useful for documentation
        if (this.shouldSkipPath(relativePath)) continue;
        
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          await this.walkDirectory(itemPath, files, basePath, depth + 1);
        } else if (stat.isFile() && this.shouldIncludeFile(item, stat.size)) {
          const content = await this.readFileContent(itemPath);
          if (content !== null) {
            files.push({
              path: relativePath,
              content,
              language: this.detectLanguage(item),
              size: stat.size
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${currentPath}:`, error);
    }
  }

  private shouldSkipPath(relativePath: string): boolean {
    const skipPatterns = [
      'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 'target',
      'bin', 'obj', '__pycache__', '.pytest_cache', 'coverage', '.nyc_output',
      'logs', 'tmp', 'temp', '.DS_Store', 'Thumbs.db'
    ];
    
    return skipPatterns.some(pattern => 
      relativePath.includes(pattern) || relativePath.startsWith('.')
    );
  }

  private shouldIncludeFile(filename: string, size: number): boolean {
    const ext = path.extname(filename).toLowerCase();
    
    // Skip very large files (> 1MB)
    if (size > 1024 * 1024) return false;
    
    // Include supported extensions
    if (this.supportedExtensions.has(ext)) return true;
    
    // Include important files without extensions
    const importantFiles = [
      'readme', 'license', 'changelog', 'contributing', 'dockerfile',
      'makefile', 'rakefile', 'gemfile', 'package.json', 'composer.json',
      'requirements.txt', 'setup.py', 'pom.xml', 'build.gradle'
    ];
    
    return importantFiles.some(important => 
      filename.toLowerCase().includes(important)
    );
  }

  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Skip binary files or very long files
      if (content.length > 50000) {
        return content.substring(0, 50000) + '\n... [truncated]';
      }
      
      // Check if content is likely binary
      if (this.isBinaryContent(content)) return null;
      
      return content;
    } catch (error) {
      console.warn(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  private isBinaryContent(content: string): boolean {
    // Simple binary detection
    const nonPrintableChars = content.match(/[\x00-\x08\x0E-\x1F\x7F]/g);
    return nonPrintableChars !== null && nonPrintableChars.length > content.length * 0.1;
  }

  private detectLanguage(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    
    const languageMap: { [key: string]: string } = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.clj': 'clojure',
      '.hs': 'haskell',
      '.md': 'markdown',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sql': 'sql',
      '.json': 'json',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.xml': 'xml',
      '.sh': 'shell',
      '.bat': 'batch',
      '.ps1': 'powershell'
    };
    
    return languageMap[ext] || 'unknown';
  }

  private getFileImportanceScore(filePath: string): number {
    const filename = path.basename(filePath).toLowerCase();
    
    // High importance files
    if (filename.includes('readme')) return 100;
    if (filename.includes('package.json')) return 95;
    if (filename.includes('dockerfile')) return 90;
    if (filename.includes('main.') || filename.includes('index.')) return 85;
    if (filename.includes('app.') || filename.includes('server.')) return 80;
    
    // Medium importance
    if (path.extname(filename) === '.md') return 70;
    if (filename.includes('config')) return 65;
    if (filename.includes('setup') || filename.includes('install')) return 60;
    
    // Code files
    const codeExts = ['.js', '.ts', '.py', '.java', '.cs', '.cpp', '.go', '.rs'];
    if (codeExts.includes(path.extname(filename))) return 50;
    
    return 30;
  }
}
