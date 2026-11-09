#!/bin/zsh
# Start the local offline mirror of jesperlandberg.com
cd "$(dirname "$0")"
PORT=${PORT:-5188}
echo "Mirror: http://127.0.0.1:$PORT/"
exec node server.js
