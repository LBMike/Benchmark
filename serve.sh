#!/bin/bash
cd "$(dirname "$0")"
python3 -c "
import http.server, socketserver, os
os.chdir('$(dirname "$0")')
handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(('', 8000), handler)
print('Server started on port 8000')
httpd.serve_forever()
"
