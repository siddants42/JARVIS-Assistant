from django.contrib import admin
from .models import Conversation, ChatMessage, Task
admin.site.register(Conversation)
admin.site.register(ChatMessage)
admin.site.register(Task)
