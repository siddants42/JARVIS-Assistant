# JARVIS Assistant (v2)

Free, local AI assistant. React + Django REST + SQLite + Ollama. Sky blue liquid glass UI with a robot.

## Run (Windows)
1. Install Python 3.11+, Node 20+, and Ollama (https://ollama.com), then run: `ollama pull qwen2.5:3b`
2. Double-click `START-JARVIS-WINDOWS.bat`, then open http://localhost:5173

## Run (Mac/Linux)
    cd backend && pip install -r requirements.txt && python manage.py migrate && python manage.py runserver
    cd frontend && npm install && npm run dev

## Modules (all working)
- Chat: remembers the conversation, saves history, supports /task, /remember and /search commands
- Voice mode: hands-free listen, think, speak loop (browser speech, free; Chrome or Edge)
- Tasks: saved in SQLite, AI breakdown of a goal into tasks
- Memory: facts the model sees in every chat
- Documents: upload txt/md/pdf, answers use the best matching passages
- GitHub: public repos and AI analysis (optional GITHUB_TOKEN in backend/.env)
- Dev tools: explain, debug, refactor, write tests
- Settings: model picker, read-aloud, delete data. Ctrl+K command palette. Installable (PWA) in Chrome/Edge.

## Limits
- Web search and GitHub need internet. Chrome sends voice audio to Google for recognition.
- Replies are not streamed. The API has no login or rate limit, so keep it on localhost.
- Small models (3B) are weaker at document questions and task planning. A 7B model works better.
