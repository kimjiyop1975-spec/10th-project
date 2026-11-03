const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// .env.local 에서 AIRKOREA_KEY 읽기
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
  const match = envContent.match(/AIRKOREA_KEY=(.*)/);
  if (match && match[1]) {
    process.env.AIRKOREA_KEY = match[1].trim();
  }
} catch (e) {
  console.warn('.env.local 파일을 읽지 못했습니다.', e.message);
}

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // /api/dust 요청 처리 (Vercel api/dust.js 핸들러 연결)
  if (pathname === '/api/dust') {
    try {
      // api/dust.js 동적 임포트 (ES 모듈 지원)
      const dustModule = await import('./api/dust.js');
      const handler = dustModule.default;

      // 간이 Express/Next.js 호환 래퍼 객체 생성
      req.query = parsedUrl.query;
      res.status = function (code) {
        this.statusCode = code;
        return this;
      };
      res.json = function (data) {
        this.setHeader('Content-Type', 'application/json; charset=utf-8');
        this.end(JSON.stringify(data));
      };

      return await handler(req, res);
    } catch (err) {
      console.error('API Error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 정적 파일 서빙 (index.html, style.css, script.js 등)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found');
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.end(content);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`서버가 성공적으로 실행되었습니다: http://localhost:${PORT}`);
});

