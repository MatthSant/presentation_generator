# App de visualização + geração (Layer A) — Node 20 + Python 3 no mesmo runtime.
# O Node serve o app e dispara o pipeline Python (build_report). Provider-agnostic:
# rode em qualquer PaaS/nuvem montando um volume em /data.
FROM node:20-slim

# Python 3 é necessário em RUNTIME (build_report/conv_calc). build-essential cobre
# o fallback de compilação do better-sqlite3 quando não há prebuilt para a ABI.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential \
 && ln -sf /usr/bin/python3 /usr/local/bin/python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências primeiro (cache de camada)
COPY app/package*.json ./
RUN npm ci

# Código + build
COPY app/ ./
RUN npm run build

ENV NODE_ENV=production \
    PORT=3131 \
    PYTHON_BIN=python3 \
    PYSRC_DIR=/app/pysrc \
    APP_OUT=/data/output \
    APP_DB=/data/comments.db \
    APP_BASE=/data/.base \
    CLAUDE_LOG=/data/claude-log.jsonl \
    APP_SCRATCH=/data/.scratch

# Análises + DB + registro de clientes (_clients.json) + base retida (dumps/configs)
# persistem no volume. APP_BASE PRECISA apontar p/ /data: no default cai em /app/.base
# (efêmero) e, quando a instância recicla (Cloud Run scale-to-zero/redeploy), o registro
# de clientes some → o seletor de cliente fica vazio. Só o scratch (CSV bruto) é efêmero.
VOLUME ["/data"]
EXPOSE 3131

CMD ["node", "dist/server/index.js"]
