import uuid
from django.db import models

def new_conversation_id():
    return str(uuid.uuid4())

class Conversation(models.Model):
    conversation_id = models.CharField(max_length=64, unique=True, default=new_conversation_id)
    title = models.CharField(max_length=180, default="New conversation")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class ChatMessage(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=20, choices=[("user", "User"), ("assistant", "Assistant")])
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["created_at"]

class Task(models.Model):
    title = models.CharField(max_length=240)
    detail = models.TextField(blank=True)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["completed", "-created_at"]
    def __str__(self):
        return self.title

class Memory(models.Model):
    fact = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)

class Document(models.Model):
    name = models.CharField(max_length=200)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
