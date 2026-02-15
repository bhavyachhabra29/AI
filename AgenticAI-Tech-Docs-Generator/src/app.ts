// Client-side application logic
let currentResults: any = null;

function selectSourceType(type: string) {
    // Update radio selection
    document.querySelectorAll('input[name="sourceType"]').forEach(radio => {
        (radio as HTMLInputElement).checked = (radio as HTMLInputElement).value === type;
    });

    // Update visual selection
    document.querySelectorAll('.radio-option').forEach(option => {
        option.classList.remove('active');
    });
    
    // Find the clicked radio option and add active class
    const clickedOption = document.querySelector(`input[value="${type}"]`)?.closest('.radio-option');
    if (clickedOption) {
        clickedOption.classList.add('active');
    }

    // Show/hide relevant fields
    document.querySelector('.github-fields')?.classList.toggle('active', type === 'github');
    document.querySelector('.local-fields')?.classList.toggle('active', type === 'local');
}

function toggleEmailFields() {
    const sendEmailCheckbox = document.getElementById('sendEmail') as HTMLInputElement;
    const emailFields = document.querySelector('.email-fields') as HTMLElement;
    const emailNotification = document.querySelector('.email-notification') as HTMLElement;
    
    if (sendEmailCheckbox?.checked) {
        emailFields?.classList.add('active');
        if (emailNotification) emailNotification.style.display = 'block';
    } else {
        emailFields?.classList.remove('active');
        if (emailNotification) emailNotification.style.display = 'none';
    }
}

function updateProgress(stage: string, progress: number) {
    const progressElement = document.getElementById('progress');
    const progressFill = document.getElementById('progressFill');
    const statusElement = document.getElementById('status');

    if (progressElement) progressElement.style.display = 'block';
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (statusElement) statusElement.textContent = stage;
}

function showResults(results: any) {
    const resultsElement = document.getElementById('results');
    if (resultsElement) {
        resultsElement.style.display = 'block';
        currentResults = results;
        
        // Update download buttons
        const techBtn = document.getElementById('downloadTech') as HTMLAnchorElement;
        const funcBtn = document.getElementById('downloadFunc') as HTMLAnchorElement;
        
        if (techBtn) {
            techBtn.onclick = () => downloadFile(results.technicalSpec, 'technical-spec.md', 'text/markdown');
        }
        
        if (funcBtn) {
            funcBtn.onclick = () => downloadFile(results.functionalSpec, 'functional-spec.html', 'text/html');
        }
    }
}

function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Form submission handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('docForm') as HTMLFormElement;
    const sendEmailCheckbox = document.getElementById('sendEmail') as HTMLInputElement;
    
    // Handle email checkbox toggle
    sendEmailCheckbox?.addEventListener('change', toggleEmailFields);
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const sourceType = formData.get('sourceType') as 'github' | 'local';
        const projectName = formData.get('projectName') as string;
        const description = formData.get('description') as string;
        const sendEmail = (document.getElementById('sendEmail') as HTMLInputElement)?.checked || false;
        const recipientEmail = (document.getElementById('recipientEmail') as HTMLInputElement)?.value;
        
        let submissionData: any = {
            sourceType,
            projectName,
            description,
            sendEmail,
            recipientEmail
        };
        
        if (sourceType === 'github') {
            submissionData.repoUrl = formData.get('repoUrl') as string;
            submissionData.pat = formData.get('pat') as string;
            
            if (!submissionData.repoUrl) {
                alert('Please enter a repository URL');
                return;
            }
        } else {
            submissionData.localPath = formData.get('localPath') as string;
            
            if (!submissionData.localPath) {
                alert('Please enter a local folder path');
                return;
            }
        }
        
        if (!projectName.trim()) {
            alert('Please enter a project name');
            return;
        }

        if (sendEmail && !recipientEmail?.trim()) {
            alert('Please enter a recipient email address');
            return;
        }
        
        try {
            // Disable form
            const submitBtn = form.querySelector('.generate-btn') as HTMLButtonElement;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Generating...';
            
            // Show progress
            updateProgress('Initializing...', 0);
            
            // Call the actual API
            await generateDocumentation(submissionData);
            
        } catch (error) {
            console.error('Generation error:', error);
            
            // Show specific error messages
            let errorMessage = 'An error occurred during generation. Please try again.';
            
            if (error instanceof Error) {
                if (error.message.includes('Git is not installed')) {
                    errorMessage = '⚠️ Git Required\n\nGit is not installed on this system. To analyze GitHub repositories, please:\n\n1. Download and install Git from: https://git-scm.com/download/win\n2. Restart the application\n3. Try again\n\nAlternatively, you can use the "Local Folder" option to analyze projects already downloaded to your computer.';
                } else if (error.message.includes('spawn git ENOENT')) {
                    errorMessage = '⚠️ Git Configuration Issue\n\nGit is not accessible from the command line. Please:\n\n1. Install Git from https://git-scm.com/download/win\n2. Ensure "Git from the command line" is selected during installation\n3. Restart the application';
                } else if (error.message.includes('repository not found') || error.message.includes('404')) {
                    errorMessage = '❌ Repository Not Found\n\nThe GitHub repository URL appears to be incorrect or the repository is private and requires authentication.';
                } else if (error.message.includes('authentication') || error.message.includes('401')) {
                    errorMessage = '🔐 Authentication Required\n\nThis repository requires a GitHub Personal Access Token (PAT) for access.';
                } else {
                    errorMessage = `❌ Generation Failed\n\n${error.message}`;
                }
            }
            
            alert(errorMessage);
        } finally {
            // Re-enable form
            const submitBtn = form.querySelector('.generate-btn') as HTMLButtonElement;
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Generate Documentation';
        }
    });
});

// Function to call the actual API
async function generateDocumentation(formData: any) {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Generation failed');
        }

        const results = await response.json();
        
        // Update progress to completion
        updateProgress('Documentation generated successfully!', 100);
        
        // Show results
        showResults(results);
        
        // Show email confirmation if email was sent
        if (formData.sendEmail && results.emailSent) {
            setTimeout(() => {
                alert(`📧 Documentation has been successfully sent to ${formData.recipientEmail}`);
            }, 500);
        }
        
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Simulation function for demo purposes
async function simulateGeneration(formData: any) {
    // Simulate the multi-agent process
    const stages = [
        'Initializing agents...',
        'Analyzing code structure...',
        'Extracting documentation...',
        'Reviewing analysis...',
        'Generating technical specs...',
        'Generating functional specs...',
    ];

    // Add email stage if email is requested
    if (formData.sendEmail) {
        stages.push('Sending documentation via email...');
    }
    
    stages.push('Finalizing documents...');
    
    for (let i = 0; i < stages.length; i++) {
        updateProgress(stages[i], (i + 1) * (100 / stages.length));
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate work
    }
    
    // Generate mock results
    const mockResults = {
        technicalSpec: generateMockTechnicalSpec(formData.projectName),
        functionalSpec: generateMockFunctionalSpec(formData.projectName),
        metadata: {
            filesAnalyzed: Math.floor(Math.random() * 50) + 10,
            codeLanguages: ['TypeScript', 'JavaScript', 'CSS'],
            frameworks: ['React', 'Node.js'],
            architecture: 'Multi-tier'
        },
        emailSent: formData.sendEmail
    };
    
    showResults(mockResults);
    
    // Show email confirmation if email was sent
    if (formData.sendEmail) {
        setTimeout(() => {
            alert(`📧 Documentation has been successfully sent to ${formData.recipientEmail}`);
        }, 500);
    }
}

function generateMockTechnicalSpec(projectName: string): string {
    return `# Technical Specification: ${projectName}

## Overview
This document provides a comprehensive technical specification for the ${projectName} system.

## Architecture
### System Architecture
- **Frontend**: Modern web application built with TypeScript
- **Backend**: Node.js with RESTful API design
- **Database**: Document-based storage
- **Deployment**: Containerized deployment with Docker

### Technology Stack
- **Frontend Technologies**:
  - TypeScript for type-safe development
  - Modern CSS with responsive design
  - ES6+ JavaScript features
  
- **Backend Technologies**:
  - Node.js runtime environment
  - Express.js web framework
  - RESTful API architecture

## Component Overview
### Core Components
1. **User Interface Layer**
   - Responsive web interface
   - Form validation and user input handling
   - Progress tracking and feedback

2. **Business Logic Layer**
   - Multi-agent coordination system
   - File analysis and processing
   - Document generation pipeline

3. **Data Layer**
   - File system integration
   - Repository analysis
   - Content extraction and parsing

## API Documentation
### Core Endpoints
- \`POST /generate\` - Initiate documentation generation
- \`GET /status/:id\` - Check generation status
- \`GET /download/:id\` - Download generated documents

## Security Considerations
- Secure handling of GitHub Personal Access Tokens
- Input validation and sanitization
- Rate limiting for API endpoints

## Performance Characteristics
- Asynchronous processing for large repositories
- Progressive analysis with status updates
- Optimized file parsing and content extraction

## Deployment Architecture
### Development Environment
- Local development server
- Hot reloading for rapid iteration

### Production Environment
- Containerized deployment
- Load balancing capabilities
- Monitoring and logging integration
`;
}

function generateMockFunctionalSpec(projectName: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Functional Specification: ${projectName}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        h3 { color: #7f8c8d; }
        .requirement { background: #ecf0f1; padding: 15px; border-left: 4px solid #3498db; margin: 10px 0; }
        .user-story { background: #e8f5e8; padding: 15px; border-left: 4px solid #27ae60; margin: 10px 0; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #bdc3c7; padding: 12px; text-align: left; }
        th { background: #34495e; color: white; }
    </style>
</head>
<body>
    <h1>Functional Specification: ${projectName}</h1>
    
    <h2>1. Business Overview</h2>
    <p>The ${projectName} system is designed to automatically generate comprehensive technical and functional documentation from source code repositories. This system serves development teams, technical writers, and project stakeholders who need up-to-date, accurate documentation.</p>

    <h2>2. User Stories and Use Cases</h2>
    
    <div class="user-story">
        <h3>User Story 1: Repository Analysis</h3>
        <p><strong>As a</strong> developer<br>
        <strong>I want to</strong> analyze a GitHub repository<br>
        <strong>So that</strong> I can generate technical documentation automatically</p>
    </div>

    <div class="user-story">
        <h3>User Story 2: Local Project Analysis</h3>
        <p><strong>As a</strong> technical writer<br>
        <strong>I want to</strong> analyze a local project folder<br>
        <strong>So that</strong> I can create functional specifications for internal projects</p>
    </div>

    <h2>3. Functional Requirements</h2>

    <div class="requirement">
        <h3>FR-001: Repository Input</h3>
        <p>The system shall allow users to input either a GitHub repository URL with optional Personal Access Token or a local folder path.</p>
    </div>

    <div class="requirement">
        <h3>FR-002: Multi-Agent Processing</h3>
        <p>The system shall use a coordinator agent that delegates analysis tasks to specialized agents for code analysis, documentation extraction, and specification generation.</p>
    </div>

    <div class="requirement">
        <h3>FR-003: Progress Tracking</h3>
        <p>The system shall provide real-time progress updates during the analysis and generation process.</p>
    </div>

    <div class="requirement">
        <h3>FR-004: Document Generation</h3>
        <p>The system shall generate two types of documents:
        <ul>
            <li>Technical Specification in Markdown format</li>
            <li>Functional Specification in HTML format suitable for Confluence</li>
        </ul>
        </p>
    </div>

    <h2>4. Business Rules</h2>
    <table>
        <tr><th>Rule ID</th><th>Description</th><th>Priority</th></tr>
        <tr><td>BR-001</td><td>Private repositories require a valid GitHub PAT</td><td>High</td></tr>
        <tr><td>BR-002</td><td>Local folder paths must be accessible to the application</td><td>High</td></tr>
        <tr><td>BR-003</td><td>Generated documents must be downloadable</td><td>Medium</td></tr>
        <tr><td>BR-004</td><td>Analysis progress must be visible to users</td><td>Medium</td></tr>
    </table>

    <h2>5. Integration Requirements</h2>
    <ul>
        <li><strong>GitHub API</strong>: Integration with GitHub for repository access</li>
        <li><strong>o1 API</strong>: o1 model endpoint for AI analysis</li>
        <li><strong>File System</strong>: Local file system access for folder analysis</li>
    </ul>

    <h2>6. Non-Functional Requirements</h2>
    <ul>
        <li><strong>Performance</strong>: Analysis should complete within 5 minutes for typical repositories</li>
        <li><strong>Usability</strong>: Intuitive web interface with clear instructions</li>
        <li><strong>Reliability</strong>: Error handling for common failure scenarios</li>
        <li><strong>Security</strong>: Secure handling of authentication tokens</li>
    </ul>

    <h2>7. Acceptance Criteria</h2>
    <ul>
        <li>Users can successfully analyze both GitHub repositories and local folders</li>
        <li>Generated technical specifications include architecture, components, and API documentation</li>
        <li>Generated functional specifications include business requirements and user stories</li>
        <li>Progress is clearly communicated throughout the generation process</li>
        <li>Documents are properly formatted and downloadable</li>
    </ul>
</body>
</html>`;
}

// Make functions available globally
(window as any).selectSourceType = selectSourceType;
