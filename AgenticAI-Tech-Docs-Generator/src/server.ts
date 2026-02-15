import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';
import { TechDocsGenerator, WebInterface } from './index';

const PORT = 3000;
const webInterface = new WebInterface();

// MIME types for static files
const mimeTypes: { [key: string]: string } = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';

    // Enable CORS for API requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API endpoint for generating documentation
    if (pathname === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                
                // Set up progress callback for real-time updates
                webInterface.setProgressCallback((stage: string, progress: number) => {
                    console.log(`Progress: ${stage} - ${progress}%`);
                });

                const result = await webInterface.handleFormSubmission(data);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                console.error('Generation error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            }
        });
        return;
    }

    // Serve static files
    let filePath: string;
    if (pathname === '/') {
        filePath = path.join(__dirname, '..', 'index.html');
    } else if (pathname.startsWith('/dist/')) {
        filePath = path.join(__dirname, '..', pathname);
    } else {
        // Try to serve from project root for other files
        filePath = path.join(__dirname, '..', pathname);
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
    }

    // Determine content type
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Read and serve the file
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal server error');
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 TechDocs Generator server running at http://localhost:${PORT}`);
    console.log(`📚 Open your browser and navigate to the URL above to use the application`);
});

export default server;
