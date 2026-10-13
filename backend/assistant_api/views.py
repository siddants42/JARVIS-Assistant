import os, re, uuid, requests
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Conversation, ChatMessage, Task, Memory, Document
from .serializers import TaskSerializer

BASE = os.environ.get("JARVIS_LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
KEY = os.environ.get("JARVIS_LLM_API_KEY", "ollama")
MODEL = os.environ.get("JARVIS_LLM_MODEL", "qwen2.5:3b")
USER = os.environ.get("JARVIS_USER_NAME", "Siddhant")
SYSTEM = (f"You are JARVIS, a helpful personal AI assistant for {USER}. Be clear, accurate and concise. "
          "Never claim to have done something you did not do. If you use sources or document excerpts, say so.")

def llm(messages, model=None, temperature=0.6):
    r = requests.post(f"{BASE}/chat/completions", headers={"Authorization": f"Bearer {KEY}"},
                      json={"model": model or MODEL, "messages": messages, "temperature": temperature}, timeout=180)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def words(t):
    return set(re.findall(r"[a-z0-9]{4,}", t.lower()))

def passages(query, limit=3):
    q = words(query)
    found = []
    if q:
        for d in Document.objects.all():
            for i in range(0, len(d.text), 800):
                chunk = d.text[i:i + 900]
                score = len(q & words(chunk))
                if score:
                    found.append((score, d.name, chunk))
    return sorted(found, key=lambda x: -x[0])[:limit]

def respond(conv, text, model=None, ctx=True):
    steps = []
    if ctx:
        m = re.match(r"^(?:/task\s+|(?:add|create)\s+(?:a\s+)?task\s*(?:to|for|:)?\s*)(.+)$", text, re.I)
        if m:
            Task.objects.create(title=m.group(1).strip()[:240])
            return f"Task added: {m.group(1).strip()}", ["Saved task to the database"]
        m = re.match(r"^(?:/remember\s+|remember that\s+)(.+)$", text, re.I)
        if m:
            Memory.objects.create(fact=m.group(1).strip()[:300])
            return "Saved to memory.", ["Saved memory"]
    system, prompt = SYSTEM, text
    if ctx:
        mems = list(Memory.objects.values_list("fact", flat=True)[:30])
        if mems:
            system += "\nThings the user asked you to remember:\n- " + "\n- ".join(mems)
            steps.append(f"Loaded {len(mems)} memories")
        if text.lower().startswith("/search "):
            prompt = text[8:].strip()
            try:
                from ddgs import DDGS
                res = DDGS().text(prompt, max_results=5)
            except Exception as e:
                return f"Web search is unavailable ({e.__class__.__name__}). Check your internet connection.", ["Web search failed"]
            steps.append(f"Searched the web ({len(res)} results)")
            system += "\nWeb results:\n" + "\n".join(f"[{i+1}] {r['title']}: {r['body']} ({r['href']})" for i, r in enumerate(res)) + "\nAnswer from these results and cite them as [1], [2]."
        else:
            ps = passages(text)
            if ps:
                system += "\nExcerpts from the user's documents:\n" + "\n---\n".join(f"({n}) {c}" for _, n, c in ps)
                steps.append(f"Read {len(ps)} document passages")
    if conv:
        hist = [{"role": m.role, "content": m.content} for m in conv.messages.order_by("-created_at")[:12]][::-1]
        hist[-1]["content"] = prompt
    else:
        hist = [{"role": "user", "content": prompt}]
    try:
        reply = llm([{"role": "system", "content": system}] + hist, model)
    except Exception as e:
        return f"I couldn't reach the AI model ({e.__class__.__name__}). Make sure Ollama is running and the model is installed.", steps + ["Model unreachable"]
    return reply, steps + ["Wrote answer"]

@api_view(["GET"])
def health(request):
    return Response({"status": "online", "time": timezone.now().isoformat()})

@api_view(["GET"])
def models(request):
    try:
        names = [m["name"] for m in requests.get(BASE.rsplit("/v1", 1)[0] + "/api/tags", timeout=5).json()["models"]]
    except Exception:
        names = []
    return Response({"default": MODEL, "models": names or [MODEL], "reachable": bool(names)})

@api_view(["POST"])
def chat(request):
    text = str(request.data.get("message", "")).strip()
    if not text:
        return Response({"error": "Message is required."}, status=400)
    model = request.data.get("model") or None
    if request.data.get("save") is False:
        reply, steps = respond(None, text, model, False)
        return Response({"reply": reply, "steps": steps})
    cid = str(request.data.get("conversation_id", "")).strip() or str(uuid.uuid4())
    conv, _ = Conversation.objects.get_or_create(conversation_id=cid, defaults={"title": text[:60]})
    ChatMessage.objects.create(conversation=conv, role="user", content=text)
    reply, steps = respond(conv, text, model)
    ChatMessage.objects.create(conversation=conv, role="assistant", content=reply)
    conv.save()
    return Response({"conversation_id": cid, "reply": reply, "steps": steps})

@api_view(["GET", "DELETE"])
def conversations(request):
    if request.method == "DELETE":
        Conversation.objects.all().delete()
        return Response(status=204)
    return Response(list(Conversation.objects.order_by("-updated_at").values("conversation_id", "title", "updated_at")[:50]))

@api_view(["GET", "DELETE"])
def conversation_detail(request, cid):
    c = Conversation.objects.filter(conversation_id=cid).first()
    if not c:
        return Response({"error": "Not found."}, status=404)
    if request.method == "DELETE":
        c.delete()
        return Response(status=204)
    return Response([{"role": m.role, "content": m.content} for m in c.messages.all()])

@api_view(["GET", "POST"])
def tasks(request):
    if request.method == "GET":
        return Response(TaskSerializer(Task.objects.all(), many=True).data)
    s = TaskSerializer(data=request.data)
    if s.is_valid():
        return Response(TaskSerializer(s.save()).data, status=201)
    return Response(s.errors, status=400)

@api_view(["PATCH", "DELETE"])
def task_detail(request, task_id):
    t = Task.objects.filter(pk=task_id).first()
    if not t:
        return Response({"error": "Task not found."}, status=404)
    if request.method == "DELETE":
        t.delete()
        return Response(status=204)
    if "completed" in request.data:
        t.completed = bool(request.data["completed"])
    if "title" in request.data:
        t.title = str(request.data["title"])[:240]
    t.save()
    return Response(TaskSerializer(t).data)

@api_view(["POST"])
def breakdown(request):
    goal = str(request.data.get("goal", "")).strip()
    if not goal:
        return Response({"error": "Goal is required."}, status=400)
    try:
        out = llm([{"role": "system", "content": "Break the goal into 4 to 6 short, actionable tasks. Reply with one task per line, no numbering and no extra text."},
                   {"role": "user", "content": goal}], request.data.get("model") or None, 0.3)
    except Exception as e:
        return Response({"error": f"Model unreachable ({e.__class__.__name__})."}, status=502)
    titles = [re.sub(r"^[\-\*\d\.\)\s]+", "", l).strip() for l in out.splitlines()]
    made = [Task.objects.create(title=t[:240]) for t in titles if t][:8]
    return Response(TaskSerializer(made, many=True).data, status=201)

@api_view(["GET", "POST"])
def memory(request):
    if request.method == "POST":
        fact = str(request.data.get("fact", "")).strip()[:300]
        if not fact:
            return Response({"error": "Fact is required."}, status=400)
        m = Memory.objects.create(fact=fact)
        return Response({"id": m.id, "fact": m.fact}, status=201)
    return Response(list(Memory.objects.order_by("-created_at").values("id", "fact")))

@api_view(["DELETE"])
def memory_detail(request, pk):
    Memory.objects.filter(pk=pk).delete()
    return Response(status=204)

@api_view(["GET", "POST"])
def documents(request):
    if request.method == "POST":
        f = request.FILES.get("file")
        if not f:
            return Response({"error": "No file uploaded."}, status=400)
        try:
            if f.name.lower().endswith(".pdf"):
                from pypdf import PdfReader
                text = "\n".join((p.extract_text() or "") for p in PdfReader(f).pages)
            else:
                text = f.read().decode("utf-8", "ignore")
        except Exception as e:
            return Response({"error": f"Could not read the file ({e.__class__.__name__})."}, status=400)
        text = text.strip()[:300000]
        if not text:
            return Response({"error": "No readable text found in that file."}, status=400)
        d = Document.objects.create(name=f.name[:200], text=text)
        return Response({"id": d.id, "name": d.name, "chars": len(text)}, status=201)
    return Response([{"id": d.id, "name": d.name, "chars": len(d.text)} for d in Document.objects.order_by("-created_at")])

@api_view(["DELETE"])
def document_detail(request, pk):
    Document.objects.filter(pk=pk).delete()
    return Response(status=204)

def gh(path, raw=False):
    h = {"Accept": "application/vnd.github.raw+json" if raw else "application/vnd.github+json"}
    if os.environ.get("GITHUB_TOKEN"):
        h["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    r = requests.get("https://api.github.com" + path, headers=h, timeout=15)
    r.raise_for_status()
    return r.text if raw else r.json()

@api_view(["GET"])
def github_repos(request, user):
    try:
        repos = gh(f"/users/{user}/repos?sort=updated&per_page=12")
    except Exception as e:
        return Response({"error": f"GitHub request failed ({e.__class__.__name__}). Check the username or the rate limit."}, status=502)
    return Response([{"name": r["name"], "description": r["description"], "language": r["language"],
                      "stars": r["stargazers_count"], "url": r["html_url"]} for r in repos])

@api_view(["POST"])
def github_analyze(request):
    user, repo = str(request.data.get("user", "")), str(request.data.get("repo", ""))
    try:
        info = gh(f"/repos/{user}/{repo}")
        langs = ", ".join(gh(f"/repos/{user}/{repo}/languages").keys())
        try:
            readme = gh(f"/repos/{user}/{repo}/readme", raw=True)[:4000]
        except Exception:
            readme = "(no README)"
    except Exception as e:
        return Response({"error": f"GitHub request failed ({e.__class__.__name__})."}, status=502)
    prompt = (f"Review this GitHub repository and suggest concrete improvements.\nName: {info['name']}\n"
              f"Description: {info['description']}\nLanguages: {langs}\nREADME:\n{readme}")
    reply, steps = respond(None, prompt, request.data.get("model") or None, False)
    return Response({"reply": reply, "steps": ["Fetched repository details"] + steps})
