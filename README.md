# Araliya AI Chatbot

Two projects:

- `backend/` — Express server that talks to OpenRouter and to Kapruka's
  real, remote MCP server (`https://mcp.kapruka.com/mcp`, Streamable HTTP,
  no auth) for product search.
- `frontend/` — Vite + React + TypeScript chat UI.

Quick start:

```
cd backend
npm install
cp .env.example .env   # then paste in your OpenRouter API key
npm run dev             # http://localhost:8787

cd ../frontend
npm install
npm run dev             # http://localhost:5173
```
