from django.urls import path
from . import views as v
urlpatterns = [
    path("health/", v.health), path("models/", v.models), path("chat/", v.chat),
    path("tasks/", v.tasks), path("tasks/breakdown/", v.breakdown), path("tasks/<int:task_id>/", v.task_detail),
    path("conversations/", v.conversations), path("conversations/<str:cid>/", v.conversation_detail),
    path("memory/", v.memory), path("memory/<int:pk>/", v.memory_detail),
    path("documents/", v.documents), path("documents/<int:pk>/", v.document_detail),
    path("github/", v.github_analyze), path("github/<str:user>/", v.github_repos),
]
