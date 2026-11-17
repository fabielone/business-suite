#!/bin/zsh -l
# Zut CRM demo account: fictional company, every role, stored only in your browser. Ctrl+C to stop.
cd "$(dirname "$0")" || exit 1
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" && nvm use 22 >/dev/null 2>&1
echo "Node: $(node -v 2>&1)"
[ -d node_modules ] || npm ci
npm run build --workspace @suite/core --workspace @suite/offline || exit 1
( sleep 6; open "http://localhost:5181/?demo=1" ) &
npm run dev --workspace @suite/web -- --mode operations --port 5181
